import { z } from "zod";
import { loadWhatsAppConfigFile } from "../whatsapp-config";
import {
  resolveWhatsAppOutboundPort,
  WHATSAPP_OUTBOUND_TOKEN_HEADER,
} from "./whatsapp-outbound";

/** Participant changes the worker exposes; mirrors its `/groups/*` routes. */
export const WHATSAPP_GROUP_ACTIONS = [
  "add",
  "demote",
  "promote",
  "remove",
] as const;

export type WhatsAppGroupAction = (typeof WHATSAPP_GROUP_ACTIONS)[number];

export const WHATSAPP_GROUP_SETTINGS = [
  "announce_off",
  "announce_on",
  "ephemeral",
  "join_approval_off",
  "join_approval_on",
  "locked_off",
  "locked_on",
  "member_add_admin_only",
  "member_add_all",
  "photo_remove",
  "photo_set",
  "subject",
  "topic",
] as const;

export type WhatsAppGroupSetting = (typeof WHATSAPP_GROUP_SETTINGS)[number];

export type WhatsAppGroupErrorCode =
  | "bot_not_admin"
  | "group_unreadable"
  | "invalid_input"
  | "invalid_participants"
  | "not_a_group"
  | "not_configured"
  | "socket_unavailable"
  | "worker_error";

export interface WhatsAppGroupFailure {
  code: WhatsAppGroupErrorCode;
  error: string;
  ok: false;
}

const ParticipantsReplySchema = z.object({
  action: z.enum(WHATSAPP_GROUP_ACTIONS),
  groupSubject: z.string(),
  ok: z.literal(true),
  results: z.array(
    z.object({ jid: z.string(), ok: z.boolean(), status: z.string() })
  ),
});

const GroupInfoReplySchema = z.object({
  announce: z.boolean(),
  botIsAdmin: z.boolean(),
  id: z.string(),
  ok: z.literal(true),
  owner: z.string().nullable(),
  participants: z.array(
    z.object({
      admin: z.enum(["admin", "superadmin"]).nullable(),
      id: z.string(),
    })
  ),
  subject: z.string(),
});

const SettingReplySchema = z.object({
  action: z.enum(WHATSAPP_GROUP_SETTINGS),
  detail: z.string(),
  groupSubject: z.string(),
  ok: z.literal(true),
});

const WorkerErrorSchema = z.object({
  code: z
    .enum([
      "bot_not_admin",
      "group_unreadable",
      "invalid_input",
      "invalid_participants",
      "not_a_group",
      "socket_unavailable",
    ])
    .optional(),
  error: z.string().min(1).optional(),
});

export type WhatsAppGroupSettingResult = z.infer<typeof SettingReplySchema>;

export type WhatsAppGroupParticipantOutcome = z.infer<
  typeof ParticipantsReplySchema
>["results"][number];

export type WhatsAppGroupParticipantsResult = z.infer<
  typeof ParticipantsReplySchema
>;

export type WhatsAppGroupInfoResult = z.infer<typeof GroupInfoReplySchema>;

export interface WhatsAppGroupOwner {
  orgId: string;
  profileId: string;
}

export interface WhatsAppGroupClientOptions {
  fetchImpl?: typeof fetch;
}

const REQUEST_TIMEOUT_MS = 20_000;

function fail(
  code: WhatsAppGroupErrorCode,
  error: string
): WhatsAppGroupFailure {
  return { code, error, ok: false };
}

/**
 * One POST to the worker's local outbound server. Every failure comes back as
 * a value with a code, so a caller never has to read a raw provider error.
 */
async function post(
  owner: WhatsAppGroupOwner,
  path: string,
  body: {
    groupJid: string;
    participants?: string[];
    seconds?: number;
    text?: string;
    url?: string;
  },
  options: WhatsAppGroupClientOptions
): Promise<WhatsAppGroupFailure | { ok: true; payload: z.core.JSONValue }> {
  const fetchImpl = options.fetchImpl ?? fetch;

  if (!(owner.orgId && owner.profileId)) {
    return fail(
      "not_configured",
      "Choose an agent connection before using group actions."
    );
  }

  const config = await loadWhatsAppConfigFile(owner);

  if (!config?.pairedJid) {
    return fail("not_configured", "WhatsApp is not paired.");
  }

  if (!(config.outboundPort && config.outboundToken)) {
    return fail("not_configured", "WhatsApp worker is not connected.");
  }

  const port = resolveWhatsAppOutboundPort(config);

  const headers = new Headers({
    "Content-Type": "application/json",
    [WHATSAPP_OUTBOUND_TOKEN_HEADER]: config.outboundToken,
  });

  try {
    const response = await fetchImpl(`http://127.0.0.1:${port}${path}`, {
      body: JSON.stringify(body),
      headers,
      method: "POST",
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });

    let payload: z.core.JSONValue = null;

    try {
      payload = await response.json();
    } catch {
      payload = null;
    }

    if (response.ok) {
      return { ok: true, payload };
    }

    const parsed = WorkerErrorSchema.safeParse(payload);

    return fail(
      parsed.data?.code ?? "worker_error",
      parsed.data?.error ?? `WhatsApp worker error (${response.status}).`
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);

    return fail("worker_error", message);
  }
}

export function createWhatsAppGroupClient(
  options: WhatsAppGroupClientOptions = {}
) {
  return {
    /** The roster plus whether the bot itself holds admin rights. */
    async info(
      owner: WhatsAppGroupOwner,
      groupJid: string
    ): Promise<WhatsAppGroupFailure | WhatsAppGroupInfoResult> {
      const result = await post(owner, "/groups/info", { groupJid }, options);

      if (!result.ok) {
        return result;
      }

      const parsed = GroupInfoReplySchema.safeParse(result.payload);

      return parsed.success
        ? parsed.data
        : fail("worker_error", "WhatsApp worker returned an unreadable reply.");
    },

    /**
     * Name, topic, photo and the group switches. Refused with `bot_not_admin`
     * exactly like a participant change, because WhatsApp requires the same
     * rights for both.
     */
    async updateSetting(
      owner: WhatsAppGroupOwner,
      input: {
        action: WhatsAppGroupSetting;
        groupJid: string;
        seconds?: number;
        text?: string;
        url?: string;
      }
    ): Promise<WhatsAppGroupFailure | WhatsAppGroupSettingResult> {
      const result = await post(
        owner,
        `/groups/${input.action}`,
        {
          groupJid: input.groupJid,
          seconds: input.seconds,
          text: input.text,
          url: input.url,
        },
        options
      );

      if (!result.ok) {
        return result;
      }

      const parsed = SettingReplySchema.safeParse(result.payload);

      return parsed.success
        ? parsed.data
        : fail("worker_error", "WhatsApp worker returned an unreadable reply.");
    },

    /**
     * Kick, add, promote or demote. The worker refuses with `bot_not_admin`
     * when the bot is only a member, and its message is ready to show the user.
     */
    async updateParticipants(
      owner: WhatsAppGroupOwner,
      input: {
        action: WhatsAppGroupAction;
        groupJid: string;
        participants: readonly string[];
      }
    ): Promise<WhatsAppGroupFailure | WhatsAppGroupParticipantsResult> {
      const result = await post(
        owner,
        `/groups/${input.action}`,
        { groupJid: input.groupJid, participants: [...input.participants] },
        options
      );

      if (!result.ok) {
        return result;
      }

      const parsed = ParticipantsReplySchema.safeParse(result.payload);

      return parsed.success
        ? parsed.data
        : fail("worker_error", "WhatsApp worker returned an unreadable reply.");
    },
  };
}
