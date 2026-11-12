import { describe, expect, test } from "bun:test";
import type { GroupMetadata, ParticipantAction } from "@whiskeysockets/baileys";
import {
  findGroupAdminRole,
  type GroupAdminSocket,
  isGroupJid,
  isGroupParticipantAction,
  readGroupInfo,
  toParticipantJid,
  updateGroupParticipants,
} from "./group-admin";
import type { WhatsAppAccount } from "./group-message";

const GROUP_JID = "120363000000000000@g.us";

const me: WhatsAppAccount = {
  id: "628100000000@s.whatsapp.net",
  lid: "236283431522503@lid",
};

type Call = {
  action: ParticipantAction;
  jid: string;
  participants: string[];
};

function metadata(
  botAdmin: "admin" | "superadmin" | null,
  options: { botByLid?: boolean } = {}
): GroupMetadata {
  const botId = options.botByLid ? "236283431522503@lid" : me.id;

  // SAFETY: the helpers under test read only id, subject, announce, owner and
  // participants, so the fixture fills those and omits the optional rest.
  return {
    id: GROUP_JID,
    owner: "628199999999@s.whatsapp.net",
    participants: [
      { admin: "superadmin", id: "628199999999@s.whatsapp.net" },
      { admin: botAdmin, id: botId },
      { admin: null, id: "628122222222@s.whatsapp.net" },
    ],
    subject: "Tim Produk",
  } as GroupMetadata;
}

function harness(
  options: {
    botAdmin?: "admin" | "superadmin" | null;
    botByLid?: boolean;
    metadataError?: Error;
    socket?: null;
    statuses?: string[];
  } = {}
) {
  const calls: Call[] = [];

  const socket: GroupAdminSocket = {
    groupMetadata: (jid) => {
      if (options.metadataError) {
        return Promise.reject(options.metadataError);
      }

      expect(jid).toBe(GROUP_JID);

      return Promise.resolve(
        metadata(options.botAdmin ?? null, { botByLid: options.botByLid })
      );
    },
    groupParticipantsUpdate: (jid, participants, action) => {
      calls.push({ action, jid, participants });

      return Promise.resolve(
        participants.map((participant, index) => ({
          jid: participant,
          status: options.statuses?.[index] ?? "200",
        }))
      );
    },
  };

  return {
    calls,
    context: {
      getAccount: () => me,
      getSocket: () => (options.socket === null ? null : socket),
    },
  };
}

describe("participant jid normalization", () => {
  test("accepts local, international and already-formed addresses", () => {
    expect(toParticipantJid("0812 3456 7890")).toBe(
      "6281234567890@s.whatsapp.net"
    );
    expect(toParticipantJid("+62 812-3456-7890")).toBe(
      "6281234567890@s.whatsapp.net"
    );
    expect(toParticipantJid("006281234567890")).toBe(
      "6281234567890@s.whatsapp.net"
    );
    expect(toParticipantJid("628122222222@s.whatsapp.net")).toBe(
      "628122222222@s.whatsapp.net"
    );
    expect(toParticipantJid("236283431522503@lid")).toBe(
      "236283431522503@lid"
    );
    expect(toParticipantJid("628122222222:7@s.whatsapp.net")).toBe(
      "628122222222@s.whatsapp.net"
    );
  });

  test("refuses input that is not a reachable number", () => {
    expect(toParticipantJid("")).toBeNull();
    expect(toParticipantJid("12345")).toBeNull();
    expect(toParticipantJid("62812345678901234567")).toBeNull();
    expect(toParticipantJid("halo")).toBeNull();
  });

  test("recognises group jids and supported actions", () => {
    expect(isGroupJid(GROUP_JID)).toBe(true);
    expect(isGroupJid("628122222222@s.whatsapp.net")).toBe(false);
    expect(isGroupParticipantAction("remove")).toBe(true);
    expect(isGroupParticipantAction("modify")).toBe(false);
  });
});

describe("bot admin detection", () => {
  test("matches the bot by phone and by lid address", () => {
    expect(findGroupAdminRole(metadata("admin"), me)).toBe("admin");
    expect(
      findGroupAdminRole(metadata("superadmin", { botByLid: true }), me)
    ).toBe("superadmin");
    expect(findGroupAdminRole(metadata(null), me)).toBeNull();
    expect(findGroupAdminRole(metadata("admin"), undefined)).toBeNull();
  });
});

describe("participant updates", () => {
  for (const action of ["add", "demote", "promote", "remove"] as const) {
    test(`refuses ${action} when the bot is not an admin`, async () => {
      const { calls, context } = harness({ botAdmin: null });

      const result = await updateGroupParticipants(context, {
        action,
        groupJid: GROUP_JID,
        participants: ["628122222222@s.whatsapp.net"],
      });

      expect(result.ok).toBe(false);
      expect(result.ok === false && result.code).toBe("bot_not_admin");
      expect(calls).toEqual([]);
    });
  }

  test("names the group in the refusal so the user knows where to act", async () => {
    const { context } = harness({ botAdmin: null });

    const result = await updateGroupParticipants(context, {
      action: "remove",
      groupJid: GROUP_JID,
      participants: ["628122222222@s.whatsapp.net"],
    });

    expect(result.ok === false && result.error).toContain("Tim Produk");
  });

  test("performs the update once the bot is an admin", async () => {
    const { calls, context } = harness({ botAdmin: "admin" });

    const result = await updateGroupParticipants(context, {
      action: "remove",
      groupJid: GROUP_JID,
      participants: ["0812 2222 222"],
    });

    expect(result).toMatchObject({
      action: "remove",
      groupSubject: "Tim Produk",
      ok: true,
      results: [{ jid: "628122222222@s.whatsapp.net", ok: true, status: "200" }],
    });

    expect(calls).toEqual([
      {
        action: "remove",
        jid: GROUP_JID,
        participants: ["628122222222@s.whatsapp.net"],
      },
    ]);
  });

  test("keeps a per-participant refusal from failing the whole batch", async () => {
    const { context } = harness({
      botAdmin: "admin",
      statuses: ["200", "403"],
    });

    const result = await updateGroupParticipants(context, {
      action: "add",
      groupJid: GROUP_JID,
      participants: ["081200000001", "081200000002"],
    });

    expect(result.ok).toBe(true);
    expect(result.ok === true && result.results).toEqual([
      { jid: "6281200000001@s.whatsapp.net", ok: true, status: "200" },
      { jid: "6281200000002@s.whatsapp.net", ok: false, status: "403" },
    ]);
  });

  test("deduplicates participants given twice in different notations", async () => {
    const { calls, context } = harness({ botAdmin: "admin" });

    await updateGroupParticipants(context, {
      action: "promote",
      groupJid: GROUP_JID,
      participants: ["0812 2222 222", "628122222222@s.whatsapp.net"],
    });

    expect(calls[0]?.participants).toEqual(["628122222222@s.whatsapp.net"]);
  });

  test("rejects bad input before reaching the socket", async () => {
    const { calls, context } = harness({ botAdmin: "admin" });

    const unreadable = await updateGroupParticipants(context, {
      action: "remove",
      groupJid: GROUP_JID,
      participants: ["halo"],
    });

    expect(unreadable.ok === false && unreadable.code).toBe(
      "invalid_participants"
    );

    const empty = await updateGroupParticipants(context, {
      action: "remove",
      groupJid: GROUP_JID,
      participants: [],
    });

    expect(empty.ok === false && empty.code).toBe("invalid_participants");

    const tooMany = await updateGroupParticipants(context, {
      action: "add",
      groupJid: GROUP_JID,
      participants: Array.from(
        { length: 21 },
        (_, index) => `62812000${String(index).padStart(5, "0")}`
      ),
    });

    expect(tooMany.ok === false && tooMany.code).toBe("invalid_participants");
    expect(calls).toEqual([]);
  });

  test("refuses a chat that is not a group, and a missing socket", async () => {
    const direct = await updateGroupParticipants(
      harness({ botAdmin: "admin" }).context,
      {
        action: "remove",
        groupJid: "628122222222@s.whatsapp.net",
        participants: ["628199999999@s.whatsapp.net"],
      }
    );

    expect(direct.ok === false && direct.code).toBe("not_a_group");

    const offline = await updateGroupParticipants(
      harness({ socket: null }).context,
      {
        action: "remove",
        groupJid: GROUP_JID,
        participants: ["628122222222@s.whatsapp.net"],
      }
    );

    expect(offline.ok === false && offline.code).toBe("socket_unavailable");
  });

  test("reports unreadable group metadata instead of guessing", async () => {
    const { context } = harness({ metadataError: new Error("timed out") });

    const result = await updateGroupParticipants(context, {
      action: "remove",
      groupJid: GROUP_JID,
      participants: ["628122222222@s.whatsapp.net"],
    });

    expect(result.ok === false && result.code).toBe("group_unreadable");
  });
});

describe("group info", () => {
  test("reports the roster with the bot's own admin state", async () => {
    const { context } = harness({ botAdmin: "admin" });
    const result = await readGroupInfo(context, GROUP_JID);

    expect(result).toMatchObject({
      announce: false,
      botIsAdmin: true,
      ok: true,
      subject: "Tim Produk",
    });

    expect(result.ok === true && result.participants).toHaveLength(3);
  });

  test("stays readable when the bot is only a member", async () => {
    const { context } = harness({ botAdmin: null });
    const result = await readGroupInfo(context, GROUP_JID);

    expect(result).toMatchObject({ botIsAdmin: false, ok: true });
  });
});
