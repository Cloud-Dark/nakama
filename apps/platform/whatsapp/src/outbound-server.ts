import { timingSafeEqual } from "node:crypto";
import {
  ensureWhatsAppOutboundToken,
  loadWhatsAppConfigFile,
  resolveWhatsAppOutboundPort,
  WHATSAPP_OUTBOUND_TOKEN_HEADER,
} from "@nakama/core";
import type { ChannelConfigScope } from "@nakama/core/channel-config-shared";
import { saveWhatsAppOutboundPort } from "@nakama/core/whatsapp-config";
import type { WASocket } from "@whiskeysockets/baileys";
import {
  type GroupAdminErrorCode,
  type GroupAdminSocket,
  isGroupParticipantAction,
  readGroupInfo,
  updateGroupParticipants,
} from "./group-admin";
import type { WhatsAppAccount } from "./group-message";
import { rememberWhatsAppOutbound } from "./inbound-message";

function tokenMatches(provided: string | null, expected: string): boolean {
  if (!provided) {
    return false;
  }

  const actual = Buffer.from(provided.trim());
  const wanted = Buffer.from(expected);

  return actual.length === wanted.length && timingSafeEqual(actual, wanted);
}

interface WhatsAppOutboundSendHandle {
  sendMessage: WASocket["sendMessage"];
}

/** Group reads and participant changes, available once the socket is up. */
export interface WhatsAppGroupHandle extends GroupAdminSocket {
  account: WhatsAppAccount | undefined;
}

export interface WhatsAppOutboundServerOptions {
  getGroupHandle?: () => WhatsAppGroupHandle | null;
  getSendHandle: () => WhatsAppOutboundSendHandle | null;
  orgId?: ChannelConfigScope;
}

/** Maps a group failure to the status the Nakama server should see. */
const GROUP_ERROR_STATUS = {
  bot_not_admin: 409,
  group_unreadable: 502,
  invalid_participants: 400,
  not_a_group: 400,
  socket_unavailable: 503,
} satisfies Record<GroupAdminErrorCode, number>;

const STRING_TAG = "[object String]";

function isJsonString(value: string | undefined): boolean {
  return Object.prototype.toString.call(value) === STRING_TAG;
}

/**
 * Routes `/groups/{info,add,remove,promote,demote}`. Authorization happened in
 * the caller; the bot-is-admin check lives in `updateGroupParticipants`, so a
 * new route cannot skip it.
 */
async function handleGroupRequest(
  request: Request,
  pathname: string,
  handle: WhatsAppGroupHandle | null
): Promise<Response> {
  const operation = pathname.slice("/groups/".length);

  if (!handle) {
    return Response.json(
      { code: "socket_unavailable", error: "WhatsApp socket is not ready." },
      { status: 503 }
    );
  }

  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  if (!(body instanceof Object && "groupJid" in body)) {
    return Response.json({ error: "groupJid is required." }, { status: 400 });
  }

  const rawGroupJid = body.groupJid;

  if (!isJsonString(rawGroupJid)) {
    return Response.json({ error: "groupJid is required." }, { status: 400 });
  }

  const groupJid = String(rawGroupJid).trim();

  if (!groupJid) {
    return Response.json({ error: "groupJid is required." }, { status: 400 });
  }

  const context = {
    getAccount: () => handle.account,
    getSocket: () => handle,
  };

  if (operation === "info") {
    const info = await readGroupInfo(context, groupJid);

    return info.ok
      ? Response.json(info)
      : Response.json(info, {
          status: GROUP_ERROR_STATUS[info.code] ?? 500,
        });
  }

  if (!isGroupParticipantAction(operation)) {
    return Response.json({ error: "Not found" }, { status: 404 });
  }

  const malformedParticipants = Response.json(
    { error: "participants must be an array of strings." },
    { status: 400 }
  );

  if (!("participants" in body && Array.isArray(body.participants))) {
    return malformedParticipants;
  }

  const participants: string[] = [];

  for (const entry of body.participants) {
    if (!isJsonString(entry)) {
      return malformedParticipants;
    }

    const text = String(entry).trim();

    if (text) {
      participants.push(text);
    }
  }

  try {
    const result = await updateGroupParticipants(context, {
      action: operation,
      groupJid,
      participants,
    });

    return result.ok
      ? Response.json(result)
      : Response.json(result, {
          status: GROUP_ERROR_STATUS[result.code] ?? 500,
        });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);

    return Response.json({ error: message }, { status: 500 });
  }
}

export async function startWhatsAppOutboundServer(
  options: WhatsAppOutboundServerOptions
): Promise<{ port: number; stop: () => void }> {
  const orgId = options.orgId ?? null;
  const config = await loadWhatsAppConfigFile(orgId);
  const port = orgId ? 0 : resolveWhatsAppOutboundPort(config);
  // Mint it before the port opens so the first send already has a token to send.
  const startupToken = await ensureWhatsAppOutboundToken(orgId);
  let stopped = false;

  const server = Bun.serve({
    async fetch(request) {
      if (stopped) {
        return new Response("Server stopped", { status: 503 });
      }

      const url = new URL(request.url);

      const authorize = async () => {
        const latestConfig = await loadWhatsAppConfigFile(orgId);
        const expectedToken = latestConfig?.outboundToken?.trim();

        const authorized =
          expectedToken === startupToken &&
          Boolean(expectedToken) &&
          tokenMatches(
            request.headers.get(WHATSAPP_OUTBOUND_TOKEN_HEADER),
            expectedToken ?? ""
          );

        return authorized ? { config: latestConfig } : null;
      };

      if (request.method === "POST" && url.pathname.startsWith("/groups/")) {
        if (!(await authorize())) {
          return Response.json({ error: "Unauthorized." }, { status: 401 });
        }

        return await handleGroupRequest(
          request,
          url.pathname,
          options.getGroupHandle?.() ?? null
        );
      }

      if (request.method === "POST" && url.pathname === "/send") {
        const session = await authorize();

        if (!session) {
          return Response.json({ error: "Unauthorized." }, { status: 401 });
        }

        const latestConfig = session.config;
        const pairedJid = latestConfig?.pairedJid?.trim();

        if (!pairedJid) {
          return Response.json(
            { error: "WhatsApp is not paired." },
            { status: 400 }
          );
        }

        let body: unknown;

        try {
          body = await request.json();
        } catch {
          return Response.json(
            { error: "Invalid JSON body." },
            { status: 400 }
          );
        }

        if (!(body instanceof Object && "text" in body)) {
          return Response.json(
            { error: "Invalid JSON body." },
            { status: 400 }
          );
        }

        const rawText = body.text;

        if (Object.prototype.toString.call(rawText) !== "[object String]") {
          return Response.json({ error: "text is required." }, { status: 400 });
        }

        const text = String(rawText).trim();

        if (!text) {
          return Response.json({ error: "text is required." }, { status: 400 });
        }

        const handle = options.getSendHandle();

        if (!handle) {
          return Response.json(
            { error: "WhatsApp socket is not ready." },
            { status: 503 }
          );
        }

        try {
          rememberWhatsAppOutbound({ jid: pairedJid, text });
          await handle.sendMessage(pairedJid, { text });

          return Response.json({ ok: true });
        } catch (error) {
          const message =
            error instanceof Error ? error.message : String(error);

          return Response.json({ error: message }, { status: 500 });
        }
      }

      return new Response("Not found", { status: 404 });
    },
    hostname: "127.0.0.1",
    port,
  });

  try {
    await saveWhatsAppOutboundPort(server.port ?? port, orgId);
  } catch (error) {
    server.stop();
    throw error;
  }

  return {
    port: server.port ?? port,
    stop: () => {
      stopped = true;
      server.stop();
    },
  };
}
