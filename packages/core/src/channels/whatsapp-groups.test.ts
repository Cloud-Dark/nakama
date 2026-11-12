import { describe, expect, test } from "bun:test";
import { asTestFetch, withTempHome } from "../channel-test-helpers";
import {
  ensureWhatsAppOutboundToken,
  regenerateWhatsAppPairingCode,
  saveWhatsAppConfig,
  saveWhatsAppOutboundPort,
  verifyAndPairWhatsAppUser,
} from "../whatsapp-config";
import { createWhatsAppGroupClient } from "./whatsapp-groups";
import { WHATSAPP_OUTBOUND_TOKEN_HEADER } from "./whatsapp-outbound";

const owner = { orgId: "org_test", profileId: "agent_test" };

const GROUP_JID = "120363000000000000@g.us";

type Call = { body: string; headers: Headers; url: string };

type GroupClient = ReturnType<typeof createWhatsAppGroupClient>;

/** A paired worker listening on 4312, with its replies under the test's control. */
async function withPairedWorker(
  reply: () => Response,
  run: (client: GroupClient, calls: Call[], token: string) => Promise<void>
): Promise<void> {
  await withTempHome("nakama-wa-groups-", async () => {
    await saveWhatsAppConfig({ phoneNumber: "628100000000" }, owner);
    const { pairingCode } = await regenerateWhatsAppPairingCode(owner);

    if (!pairingCode) {
      throw new Error("The pairing fixture produced no code.");
    }

    const paired = await verifyAndPairWhatsAppUser(
      pairingCode,
      "628100000000@s.whatsapp.net",
      owner
    );

    if (!paired.ok) {
      throw new Error(`The pairing fixture failed: ${paired.message}`);
    }

    await saveWhatsAppOutboundPort(4312, owner);
    const token = await ensureWhatsAppOutboundToken(owner);
    const calls: Call[] = [];

    const client = createWhatsAppGroupClient({
      fetchImpl: asTestFetch((input, init) => {
        calls.push({
          body: String(init?.body ?? ""),
          headers: new Headers(init?.headers),
          url: String(input),
        });

        return Promise.resolve(reply());
      }),
    });

    await run(client, calls, token);
  });
}


describe("createWhatsAppGroupClient", () => {
  test("kicks a participant through the worker's remove route", async () => {
    await withPairedWorker(
      () =>
        Response.json({
          action: "remove",
          groupSubject: "Tim Produk",
          ok: true,
          results: [
            { jid: "628122222222@s.whatsapp.net", ok: true, status: "200" },
          ],
        }),
      async (client, calls, token) => {
        const result = await client.updateParticipants(owner, {
          action: "remove",
          groupJid: GROUP_JID,
          participants: ["628122222222@s.whatsapp.net"],
        });

        expect(result).toMatchObject({
          action: "remove",
          groupSubject: "Tim Produk",
          ok: true,
        });

        expect(calls[0]?.url).toBe("http://127.0.0.1:4312/groups/remove");

        expect(calls[0]?.headers.get(WHATSAPP_OUTBOUND_TOKEN_HEADER)).toBe(
          token
        );

        expect(JSON.parse(calls[0]?.body ?? "{}")).toEqual({
          groupJid: GROUP_JID,
          participants: ["628122222222@s.whatsapp.net"],
        });
      }
    );
  });

  test("keeps the worker's bot_not_admin code and message", async () => {
    await withPairedWorker(
      () =>
        Response.json(
          {
            code: "bot_not_admin",
            error:
              'Saya belum menjadi admin di grup "Tim Produk". Tolong jadikan saya admin grup dulu.',
            ok: false,
          },
          { status: 409 }
        ),
      async (client) => {
        const result = await client.updateParticipants(owner, {
          action: "promote",
          groupJid: GROUP_JID,
          participants: ["628122222222@s.whatsapp.net"],
        });

        expect(result.ok).toBe(false);
        expect(result.ok === false && result.code).toBe("bot_not_admin");

        // The worker's own wording reaches the caller, not a generic message.
        expect(result.ok === false && result.error.length).toBeGreaterThan(0);
      }
    );
  });

  test("reports per-participant refusals without failing the batch", async () => {
    await withPairedWorker(
      () =>
        Response.json({
          action: "add",
          groupSubject: "Tim Produk",
          ok: true,
          results: [
            { jid: "628122222222@s.whatsapp.net", ok: true, status: "200" },
            { jid: "628133333333@s.whatsapp.net", ok: false, status: "403" },
          ],
        }),
      async (client) => {
        const result = await client.updateParticipants(owner, {
          action: "add",
          groupJid: GROUP_JID,
          participants: ["628122222222", "628133333333"],
        });

        expect(result.ok === true && result.results).toEqual([
          { jid: "628122222222@s.whatsapp.net", ok: true, status: "200" },
          { jid: "628133333333@s.whatsapp.net", ok: false, status: "403" },
        ]);
      }
    );
  });

  test("reads group info including the bot's own admin state", async () => {
    await withPairedWorker(
      () =>
        Response.json({
          announce: false,
          botIsAdmin: true,
          id: GROUP_JID,
          ok: true,
          owner: "628199999999@s.whatsapp.net",
          participants: [
            { admin: "superadmin", id: "628199999999@s.whatsapp.net" },
          ],
          subject: "Tim Produk",
        }),
      async (client, calls) => {
        const result = await client.info(owner, GROUP_JID);

        expect(result).toMatchObject({
          botIsAdmin: true,
          ok: true,
          subject: "Tim Produk",
        });

        expect(calls[0]?.url).toBe("http://127.0.0.1:4312/groups/info");
      }
    );
  });

  test("refuses an unreadable worker reply instead of trusting it", async () => {
    await withPairedWorker(
      () => Response.json({ surprise: true }),
      async (client) => {
        const result = await client.info(owner, GROUP_JID);

        expect(result.ok === false && result.code).toBe("worker_error");
      }
    );
  });

  test("keeps an unexpected worker status as a worker_error", async () => {
    await withPairedWorker(
      () => new Response("boom", { status: 500 }),
      async (client) => {
        const result = await client.updateParticipants(owner, {
          action: "remove",
          groupJid: GROUP_JID,
          participants: ["628122222222"],
        });

        expect(result.ok === false && result.code).toBe("worker_error");
      }
    );
  });

  test("renames the group through the subject route", async () => {
    await withPairedWorker(
      () =>
        Response.json({
          action: "subject",
          detail: 'Nama grup diubah menjadi "Tim Rilis".',
          groupSubject: "Tim Produk",
          ok: true,
        }),
      async (client, calls) => {
        const result = await client.updateSetting(owner, {
          action: "subject",
          groupJid: GROUP_JID,
          text: "Tim Rilis",
        });

        expect(result).toMatchObject({ action: "subject", ok: true });
        expect(calls[0]?.url).toBe("http://127.0.0.1:4312/groups/subject");

        expect(JSON.parse(calls[0]?.body ?? "{}")).toMatchObject({
          groupJid: GROUP_JID,
          text: "Tim Rilis",
        });
      }
    );
  });

  test("passes a photo url and a disappearing duration through", async () => {
    await withPairedWorker(
      () =>
        Response.json({
          action: "photo_set",
          detail: "Foto grup diperbarui.",
          groupSubject: "Tim Produk",
          ok: true,
        }),
      async (client, calls) => {
        await client.updateSetting(owner, {
          action: "photo_set",
          groupJid: GROUP_JID,
          url: "https://example.test/a.jpg",
        });

        expect(JSON.parse(calls[0]?.body ?? "{}")).toMatchObject({
          url: "https://example.test/a.jpg",
        });
      }
    );

    await withPairedWorker(
      () =>
        Response.json({
          action: "ephemeral",
          detail: "Pesan sementara diatur 86400 detik.",
          groupSubject: "Tim Produk",
          ok: true,
        }),
      async (client, calls) => {
        await client.updateSetting(owner, {
          action: "ephemeral",
          groupJid: GROUP_JID,
          seconds: 86_400,
        });

        expect(JSON.parse(calls[0]?.body ?? "{}")).toMatchObject({
          seconds: 86_400,
        });
      }
    );
  });

  test("keeps bot_not_admin for a setting change too", async () => {
    await withPairedWorker(
      () =>
        Response.json(
          { code: "bot_not_admin", error: "Jadikan saya admin dulu.", ok: false },
          { status: 409 }
        ),
      async (client) => {
        const result = await client.updateSetting(owner, {
          action: "topic",
          groupJid: GROUP_JID,
          text: "Baru",
        });

        expect(result.ok === false && result.code).toBe("bot_not_admin");
      }
    );
  });

  test("surfaces a rejected setting value as invalid_input", async () => {
    await withPairedWorker(
      () =>
        Response.json(
          {
            code: "invalid_input",
            error: "Berikan URL gambar https untuk foto grup.",
            ok: false,
          },
          { status: 400 }
        ),
      async (client) => {
        const result = await client.updateSetting(owner, {
          action: "photo_set",
          groupJid: GROUP_JID,
          url: "http://insecure.test/a.jpg",
        });

        expect(result.ok === false && result.code).toBe("invalid_input");
      }
    );
  });

  test("says so when WhatsApp was never paired", async () => {
    await withTempHome("nakama-wa-groups-unpaired-", async () => {
      const result = await createWhatsAppGroupClient({
        fetchImpl: asTestFetch(() => {
          throw new Error("The client must not reach the network.");
        }),
      }).info(owner, GROUP_JID);

      expect(result.ok === false && result.code).toBe("not_configured");
    });
  });
});
