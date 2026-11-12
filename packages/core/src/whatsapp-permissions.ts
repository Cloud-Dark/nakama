/**
 * What the bot may do in a WhatsApp group, and who may tell it to.
 *
 * Two separate gates guard every group action: the action must be enabled, and
 * the caller must be allowed to command the bot. Both fail closed — an unknown
 * action or an unidentified caller is refused, never assumed.
 */

export const WHATSAPP_BOT_ACTIONS = [
  "add",
  "demote",
  "group_info",
  "group_photo",
  "group_settings",
  "group_subject",
  "group_summary",
  "group_topic",
  "promote",
  "remove",
  "reply",
] as const;

export type WhatsAppBotAction = (typeof WHATSAPP_BOT_ACTIONS)[number];

export type WhatsAppBotPermissions = Record<WhatsAppBotAction, boolean>;

/** Actions that change a group. Enabling these is what `!perm` guards. */
export const WHATSAPP_MUTATING_BOT_ACTIONS: readonly WhatsAppBotAction[] = [
  "add",
  "demote",
  "group_photo",
  "group_settings",
  "group_subject",
  "group_topic",
  "promote",
  "remove",
];

export function isWhatsAppBotAction(value: string): value is WhatsAppBotAction {
  return WHATSAPP_BOT_ACTIONS.some((action) => action === value);
}

/** The user asked for every action to work out of the box. */
export function defaultWhatsAppBotPermissions(): WhatsAppBotPermissions {
  return {
    add: true,
    demote: true,
    group_info: true,
    group_photo: true,
    group_settings: true,
    group_subject: true,
    group_summary: true,
    group_topic: true,
    promote: true,
    remove: true,
    reply: true,
  };
}

/**
 * Reads the `bot_actions` INI value, a comma-separated `name=bool` list.
 * An action missing from the file keeps the default, so a config written
 * before this setting existed still permits everything.
 */
export function parseWhatsAppBotPermissions(
  raw: string | undefined
): WhatsAppBotPermissions {
  const permissions = defaultWhatsAppBotPermissions();

  if (!raw?.trim()) {
    return permissions;
  }

  for (const part of raw.split(",")) {
    const [name = "", value = ""] = part.split("=");
    const action = name.trim().toLowerCase();

    if (!isWhatsAppBotAction(action)) {
      continue;
    }

    const flag = value.trim().toLowerCase();

    if (flag === "true" || flag === "1" || flag === "yes" || flag === "on") {
      permissions[action] = true;

      continue;
    }

    if (flag === "false" || flag === "0" || flag === "no" || flag === "off") {
      permissions[action] = false;
    }
  }

  return permissions;
}

/**
 * Merges a partial update over what is saved, filling anything absent with the
 * default. Saving a config written before this setting existed therefore keeps
 * every action enabled instead of writing blanks.
 */
export function resolveWhatsAppBotPermissions(
  update: Partial<WhatsAppBotPermissions> | undefined,
  existing: WhatsAppBotPermissions | undefined
): WhatsAppBotPermissions {
  const permissions = defaultWhatsAppBotPermissions();

  for (const action of WHATSAPP_BOT_ACTIONS) {
    permissions[action] =
      update?.[action] ?? existing?.[action] ?? permissions[action];
  }

  return permissions;
}

export function serializeWhatsAppBotPermissions(
  permissions: WhatsAppBotPermissions
): string {
  return WHATSAPP_BOT_ACTIONS.map(
    (action) => `${action}=${permissions[action] ? "true" : "false"}`
  ).join(",");
}

export type WhatsAppCallerRole =
  | "allowed_phone"
  | "group_admin"
  | "owner"
  | "stranger";

export type WhatsAppCommandDenyReason =
  | "action_disabled"
  | "not_authorized"
  | "unknown_caller";

export interface WhatsAppCommandDecision {
  allowed: boolean;
  reason?: WhatsAppCommandDenyReason;
  role: WhatsAppCallerRole;
}

/** Digits only, so "+62 812-3456" and "628123456@s.whatsapp.net" compare equal. */
function phoneDigits(value: string): string {
  const local = value.includes("@") ? (value.split("@")[0] ?? "") : value;

  return (local.split(":")[0] ?? "").replace(/\D/g, "");
}

function sameAddress(left: string, right: string): boolean {
  const leftDigits = phoneDigits(left);

  if (!leftDigits) {
    return false;
  }

  return leftDigits === phoneDigits(right);
}

export interface WhatsAppCallerFacts {
  /** Every identity of every group admin; empty outside a group. */
  groupAdminJids?: readonly string[];
  /** Numbers from `allowedPhones`, digits only. */
  allowedPhones?: readonly string[];
  /** The jid that sent the command. */
  callerJid: string | null | undefined;
  /** The paired account's own jid and lid. */
  ownerJids?: readonly (string | null | undefined)[];
}

/**
 * Who the caller is. The owner outranks everything, then the allow-list, then
 * group admins. A caller we cannot identify is a stranger.
 */
export function resolveWhatsAppCallerRole(
  facts: WhatsAppCallerFacts
): WhatsAppCallerRole {
  const caller = facts.callerJid?.trim();

  if (!caller) {
    return "stranger";
  }

  const owners = (facts.ownerJids ?? []).filter(
    (jid): jid is string => Boolean(jid?.trim())
  );

  if (owners.some((owner) => sameAddress(caller, owner))) {
    return "owner";
  }

  const digits = phoneDigits(caller);

  if (
    digits &&
    (facts.allowedPhones ?? []).some((phone) => phoneDigits(phone) === digits)
  ) {
    return "allowed_phone";
  }

  if ((facts.groupAdminJids ?? []).some((jid) => sameAddress(caller, jid))) {
    return "group_admin";
  }

  return "stranger";
}

export function canCommandWhatsAppBot(role: WhatsAppCallerRole): boolean {
  return role !== "stranger";
}

/**
 * Only the owner and the allow-list may change what the bot can do. A group
 * admin can direct the bot, but may not grant it new powers over the owner's
 * own WhatsApp account.
 */
export function canChangeWhatsAppBotPermissions(
  role: WhatsAppCallerRole
): boolean {
  return role === "owner" || role === "allowed_phone";
}

/** Both gates, in one answer: who is asking, and is the action switched on. */
export function decideWhatsAppBotCommand(input: {
  action: WhatsAppBotAction;
  facts: WhatsAppCallerFacts;
  permissions: WhatsAppBotPermissions;
}): WhatsAppCommandDecision {
  const role = resolveWhatsAppCallerRole(input.facts);

  if (role === "stranger") {
    return {
      allowed: false,
      reason: input.facts.callerJid?.trim()
        ? "not_authorized"
        : "unknown_caller",
      role,
    };
  }

  if (!input.permissions[input.action]) {
    return { allowed: false, reason: "action_disabled", role };
  }

  return { allowed: true, role };
}

const ACTION_LABELS: Record<WhatsAppBotAction, string> = {
  add: "tambah anggota",
  demote: "turunkan admin",
  group_info: "lihat info grup",
  group_photo: "ganti foto grup",
  group_settings: "ubah pengaturan grup",
  group_subject: "ganti nama grup",
  group_summary: "ringkas obrolan grup",
  group_topic: "ganti deskripsi grup",
  promote: "jadikan admin",
  remove: "keluarkan anggota",
  reply: "balas pesan",
};

export function whatsAppBotActionLabel(action: WhatsAppBotAction): string {
  return ACTION_LABELS[action];
}

export function describeWhatsAppBotPermissions(
  permissions: WhatsAppBotPermissions
): string {
  return WHATSAPP_BOT_ACTIONS.map(
    (action) =>
      `${permissions[action] ? "aktif " : "mati  "} ${action} (${ACTION_LABELS[action]})`
  ).join("\n");
}

export type WhatsAppPermCommand =
  | { action: WhatsAppBotAction; kind: "set"; on: boolean }
  | { kind: "help" }
  | { kind: "list" }
  | { kind: "unknown"; word: string };

/**
 * Parses the in-chat control command, so the owner can switch actions from
 * WhatsApp itself: `!perm`, `!perm on remove`, `!perm off add`, `!perm help`.
 * Kept out of `channel-commands.ts` because only WhatsApp has group powers.
 */
export function parseWhatsAppPermCommand(
  text: string
): WhatsAppPermCommand | null {
  const trimmed = text.trim();

  if (!trimmed.startsWith("!")) {
    return null;
  }

  const parts = trimmed.slice(1).split(/\s+/).filter(Boolean);
  const [word = "", second = "", third = ""] = parts;

  if (word.toLowerCase() !== "perm") {
    return null;
  }

  if (!second || second.toLowerCase() === "list") {
    return { kind: "list" };
  }

  const verb = second.toLowerCase();

  if (verb === "help") {
    return { kind: "help" };
  }

  const on = verb === "on";

  if (!(on || verb === "off")) {
    return { kind: "unknown", word: second };
  }

  const target = third.toLowerCase();

  return isWhatsAppBotAction(target)
    ? { action: target, kind: "set", on }
    : { kind: "unknown", word: third || verb };
}

export function whatsAppPermCommandHelp(): string {
  return [
    "!perm: lihat aksi yang aktif dan mati",
    "!perm on <aksi>: nyalakan satu aksi",
    "!perm off <aksi>: matikan satu aksi",
    `Aksi: ${WHATSAPP_BOT_ACTIONS.join(", ")}`,
    "Hanya pemilik bot dan nomor yang diizinkan boleh mengubah ini.",
  ].join("\n");
}

/** The refusal when a group admin tries to widen what the bot may do. */
export function whatsAppPermChangeDeniedMessage(): string {
  return "Hanya pemilik bot dan nomor yang diizinkan boleh mengubah izin ini. Admin grup bisa menyuruh saya, tapi tidak bisa menambah izin saya.";
}

export function whatsAppPermissionDeniedMessage(
  decision: WhatsAppCommandDecision,
  action: WhatsAppBotAction
): string {
  if (decision.reason === "action_disabled") {
    return `Aksi "${action}" (${ACTION_LABELS[action]}) sedang dimatikan. Pemilik bot dapat menyalakannya dengan: !perm on ${action}`;
  }

  return "Maaf, Anda tidak berhak menyuruh saya melakukan itu. Hanya pemilik bot, nomor yang diizinkan, dan admin grup yang bisa.";
}
