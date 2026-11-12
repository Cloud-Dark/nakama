import { describe, expect, test } from "bun:test";
import {
  canChangeWhatsAppBotPermissions,
  canCommandWhatsAppBot,
  decideWhatsAppBotCommand,
  defaultWhatsAppBotPermissions,
  isWhatsAppBotAction,
  parseWhatsAppBotPermissions,
  parseWhatsAppPermCommand,
  parseWhatsAppSummaryCommand,
  resolveWhatsAppBotPermissions,
  resolveWhatsAppCallerRole,
  serializeWhatsAppBotPermissions,
  WHATSAPP_BOT_ACTIONS,
  type WhatsAppCallerFacts,
  whatsAppPermCommandHelp,
} from "./whatsapp-permissions";

const OWNER = "628100000000@s.whatsapp.net";

const OWNER_LID = "236283431522503@lid";

const ADMIN = "628122222222@s.whatsapp.net";

const ALLOWED = "628133333333@s.whatsapp.net";

const STRANGER = "628199999999@s.whatsapp.net";

function facts(overrides: Partial<WhatsAppCallerFacts>): WhatsAppCallerFacts {
  return {
    allowedPhones: ["628133333333"],
    callerJid: null,
    groupAdminJids: [ADMIN],
    ownerJids: [OWNER, OWNER_LID],
    ...overrides,
  };
}

describe("default permissions", () => {
  test("every action is enabled out of the box", () => {
    const permissions = defaultWhatsAppBotPermissions();

    for (const action of WHATSAPP_BOT_ACTIONS) {
      expect(permissions[action]).toBe(true);
    }
  });

  test("a config written before this setting existed keeps everything on", () => {
    expect(parseWhatsAppBotPermissions(undefined)).toEqual(
      defaultWhatsAppBotPermissions()
    );

    expect(parseWhatsAppBotPermissions("")).toEqual(
      defaultWhatsAppBotPermissions()
    );

    expect(parseWhatsAppBotPermissions("   ")).toEqual(
      defaultWhatsAppBotPermissions()
    );
  });

  test("only the named action changes, the rest keep the default", () => {
    const parsed = parseWhatsAppBotPermissions("remove=false");

    expect(parsed.remove).toBe(false);
    expect(parsed.add).toBe(true);
    expect(parsed.promote).toBe(true);
  });

  test("unknown and malformed entries are ignored, not fatal", () => {
    const parsed = parseWhatsAppBotPermissions(
      "nonsense=false,remove=off,,garbage"
    );

    expect(parsed.remove).toBe(false);
    expect(parsed.add).toBe(true);
  });

  test("the written value round-trips through the parser", () => {
    const permissions = parseWhatsAppBotPermissions("add=false,promote=false");
    const text = serializeWhatsAppBotPermissions(permissions);

    expect(parseWhatsAppBotPermissions(text)).toEqual(permissions);
  });

  test("a partial update merges over what is saved", () => {
    const existing = parseWhatsAppBotPermissions("add=false,remove=false");

    const merged = resolveWhatsAppBotPermissions({ add: true }, existing);

    expect(merged.add).toBe(true);
    expect(merged.remove).toBe(false);
    expect(merged.promote).toBe(true);
  });

  test("saving a config that never had the setting enables everything", () => {
    expect(resolveWhatsAppBotPermissions(undefined, undefined)).toEqual(
      defaultWhatsAppBotPermissions()
    );
  });

  test("recognises its own action names", () => {
    expect(isWhatsAppBotAction("remove")).toBe(true);
    expect(isWhatsAppBotAction("modify")).toBe(false);
  });
});

describe("caller role", () => {
  test("the owner is recognised by phone and by lid", () => {
    expect(resolveWhatsAppCallerRole(facts({ callerJid: OWNER }))).toBe(
      "owner"
    );

    expect(resolveWhatsAppCallerRole(facts({ callerJid: OWNER_LID }))).toBe(
      "owner"
    );

    expect(
      resolveWhatsAppCallerRole(facts({ callerJid: "628100000000:9@s.whatsapp.net" }))
    ).toBe("owner");
  });

  test("an allow-listed number and a group admin may command the bot", () => {
    expect(resolveWhatsAppCallerRole(facts({ callerJid: ALLOWED }))).toBe(
      "allowed_phone"
    );

    expect(resolveWhatsAppCallerRole(facts({ callerJid: ADMIN }))).toBe(
      "group_admin"
    );
  });

  test("anyone else is a stranger, and so is an unidentified caller", () => {
    expect(resolveWhatsAppCallerRole(facts({ callerJid: STRANGER }))).toBe(
      "stranger"
    );

    expect(resolveWhatsAppCallerRole(facts({ callerJid: null }))).toBe(
      "stranger"
    );

    expect(resolveWhatsAppCallerRole(facts({ callerJid: "   " }))).toBe(
      "stranger"
    );
  });

  test("a plain member stays a stranger when no admin list is known", () => {
    expect(
      resolveWhatsAppCallerRole({ callerJid: ADMIN, ownerJids: [OWNER] })
    ).toBe("stranger");
  });

  test("only the owner and the allow-list may change permissions", () => {
    expect(canChangeWhatsAppBotPermissions("owner")).toBe(true);
    expect(canChangeWhatsAppBotPermissions("allowed_phone")).toBe(true);
    expect(canChangeWhatsAppBotPermissions("group_admin")).toBe(false);
    expect(canChangeWhatsAppBotPermissions("stranger")).toBe(false);
  });

  test("a group admin may still direct the bot", () => {
    expect(canCommandWhatsAppBot("group_admin")).toBe(true);
    expect(canCommandWhatsAppBot("stranger")).toBe(false);
  });
});

describe("the in-chat control command", () => {
  test("a message that is not !perm is left to the agent", () => {
    expect(parseWhatsAppPermCommand("tolong kick orang itu")).toBeNull();
    expect(parseWhatsAppPermCommand("/help")).toBeNull();
    expect(parseWhatsAppPermCommand("/status")).toBeNull();
  });

  test("bare /perm lists the current state", () => {
    expect(parseWhatsAppPermCommand("/perm")).toEqual({ kind: "list" });
    expect(parseWhatsAppPermCommand("/perm list")).toEqual({ kind: "list" });
    expect(parseWhatsAppPermCommand("  /Perm  ")).toEqual({ kind: "list" });
  });

  test("on and off name one action", () => {
    expect(parseWhatsAppPermCommand("/perm off remove")).toEqual({
      action: "remove",
      kind: "set",
      on: false,
    });

    expect(parseWhatsAppPermCommand("/perm on Add")).toEqual({
      action: "add",
      kind: "set",
      on: true,
    });
  });

  test("an unknown action or verb is reported, never guessed", () => {
    expect(parseWhatsAppPermCommand("/perm on nonsense")).toEqual({
      kind: "unknown",
      word: "nonsense",
    });

    expect(parseWhatsAppPermCommand("/perm sideways remove")).toEqual({
      kind: "unknown",
      word: "sideways",
    });

    expect(parseWhatsAppPermCommand("/perm on")).toEqual({
      kind: "unknown",
      word: "on",
    });
  });

  test("help is available from the chat", () => {
    expect(parseWhatsAppPermCommand("/perm help")).toEqual({ kind: "help" });
    expect(whatsAppPermCommandHelp()).toContain("/perm on");
  });
});

describe("the summary command", () => {
  test("accepts both spellings and ignores other messages", () => {
    expect(parseWhatsAppSummaryCommand("/summary")).toContain(
      "whatsapp_group_summary"
    );

    expect(parseWhatsAppSummaryCommand("/ringkas")).toContain(
      "whatsapp_group_summary"
    );

    expect(parseWhatsAppSummaryCommand("/Summary")).not.toBeNull();
    expect(parseWhatsAppSummaryCommand("/help")).toBeNull();
    expect(parseWhatsAppSummaryCommand("ringkas dong")).toBeNull();
  });

  test("passes a message count through and caps it", () => {
    expect(parseWhatsAppSummaryCommand("/summary 120")).toContain("limit 120");
    expect(parseWhatsAppSummaryCommand("/summary 5000")).toContain("limit 200");
    expect(parseWhatsAppSummaryCommand("/summary 0")).not.toContain("limit");
    expect(parseWhatsAppSummaryCommand("/summary abc")).not.toContain("limit");
  });

  test("tells the agent not to invent messages", () => {
    const request = parseWhatsAppSummaryCommand("/summary") ?? "";

    expect(request).toContain("Jangan mengarang");
  });
});

describe("command decision", () => {
  test("an authorized caller passes when the action is enabled", () => {
    expect(
      decideWhatsAppBotCommand({
        action: "remove",
        facts: facts({ callerJid: ADMIN }),
        permissions: defaultWhatsAppBotPermissions(),
      })
    ).toEqual({ allowed: true, role: "group_admin" });
  });

  test("a disabled action is refused even for the owner", () => {
    expect(
      decideWhatsAppBotCommand({
        action: "remove",
        facts: facts({ callerJid: OWNER }),
        permissions: parseWhatsAppBotPermissions("remove=false"),
      })
    ).toEqual({ allowed: false, reason: "action_disabled", role: "owner" });
  });

  test("a stranger is refused before the action is even considered", () => {
    expect(
      decideWhatsAppBotCommand({
        action: "remove",
        facts: facts({ callerJid: STRANGER }),
        permissions: defaultWhatsAppBotPermissions(),
      })
    ).toEqual({ allowed: false, reason: "not_authorized", role: "stranger" });
  });

  test("an unidentified caller is reported apart from a known refusal", () => {
    expect(
      decideWhatsAppBotCommand({
        action: "remove",
        facts: facts({ callerJid: null }),
        permissions: defaultWhatsAppBotPermissions(),
      })
    ).toEqual({ allowed: false, reason: "unknown_caller", role: "stranger" });
  });
});
