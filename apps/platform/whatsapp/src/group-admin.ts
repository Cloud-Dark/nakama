import type {
  GroupMetadata,
  GroupParticipant,
  ParticipantAction,
} from "@whiskeysockets/baileys";
import { isWhatsAppBotAddress, type WhatsAppAccount } from "./group-message";

/** Participant changes the bot may perform; "modify" is deliberately absent. */
export const GROUP_PARTICIPANT_ACTIONS = [
  "add",
  "demote",
  "promote",
  "remove",
] as const;

export type GroupParticipantAction =
  (typeof GROUP_PARTICIPANT_ACTIONS)[number];

export type GroupAdminErrorCode =
  | "bot_not_admin"
  | "group_unreadable"
  | "invalid_participants"
  | "not_a_group"
  | "socket_unavailable";

export interface GroupAdminFailure {
  code: GroupAdminErrorCode;
  error: string;
  ok: false;
}

export interface GroupParticipantOutcome {
  jid: string;
  ok: boolean;
  status: string;
}

export interface GroupParticipantSuccess {
  action: GroupParticipantAction;
  groupSubject: string;
  ok: true;
  results: GroupParticipantOutcome[];
}

export type GroupParticipantResult =
  | GroupAdminFailure
  | GroupParticipantSuccess;

export interface GroupInfoSuccess {
  announce: boolean;
  botIsAdmin: boolean;
  id: string;
  ok: true;
  owner: string | null;
  participants: {
    admin: "admin" | "superadmin" | null;
    id: string;
  }[];
  subject: string;
}

export type GroupInfoResult = GroupAdminFailure | GroupInfoSuccess;

export interface GroupAdminSocket {
  groupMetadata: (jid: string) => Promise<GroupMetadata>;
  groupParticipantsUpdate: (
    jid: string,
    participants: string[],
    action: ParticipantAction
  ) => Promise<{ jid: string | undefined; status: string }[]>;
}

const GROUP_JID_SUFFIX = "@g.us";

const MAX_PARTICIPANTS_PER_CALL = 20;

const MIN_PHONE_DIGITS = 8;

const MAX_PHONE_DIGITS = 15;

/** WhatsApp reports success as "200"; every other code is a per-participant refusal. */
const PARTICIPANT_OK_STATUS = "200";

export function isGroupJid(jid: string): boolean {
  return jid.trim().endsWith(GROUP_JID_SUFFIX);
}

function fail(code: GroupAdminErrorCode, error: string): GroupAdminFailure {
  return { code, error, ok: false };
}

export function isGroupParticipantAction(
  value: string
): value is GroupParticipantAction {
  return GROUP_PARTICIPANT_ACTIONS.some((action) => action === value);
}

/**
 * Turns "+62 812-3456-7890", "0812...", "62812..." and a bare jid into a
 * participant jid. A leading zero is Indonesian trunk notation, so it is
 * replaced by the default country code rather than dialled literally.
 */
export function toParticipantJid(
  raw: string,
  defaultCountryCode = "62"
): string | null {
  const value = raw.trim();

  if (!value) {
    return null;
  }

  if (value.includes("@")) {
    const [user = "", server = ""] = value.split("@");
    const bare = user.split(":")[0] ?? "";

    return bare && server ? `${bare}@${server}` : null;
  }

  let digits = value.replace(/\D/g, "");

  if (digits.startsWith("00")) {
    digits = digits.slice(2);
  } else if (digits.startsWith("0")) {
    digits = `${defaultCountryCode}${digits.slice(1)}`;
  }

  if (digits.length < MIN_PHONE_DIGITS || digits.length > MAX_PHONE_DIGITS) {
    return null;
  }

  return `${digits}@s.whatsapp.net`;
}

function participantAdmin(
  participant: GroupParticipant
): "admin" | "superadmin" | null {
  if (participant.admin === "admin" || participant.admin === "superadmin") {
    return participant.admin;
  }

  if (participant.isSuperAdmin) {
    return "superadmin";
  }

  return participant.isAdmin ? "admin" : null;
}

function participantIdentities(participant: GroupParticipant): string[] {
  // SAFETY: Baileys 7 adds lid/pn fields to participants that its published
  // GroupParticipant type omits; widening only reads optional strings.
  const candidate = participant as GroupParticipant & {
    jid?: string | null;
    lid?: string | null;
    phoneNumber?: string | null;
  };

  return [
    participant.id,
    candidate.jid,
    candidate.lid,
    candidate.phoneNumber,
  ].filter((value): value is string => Boolean(value));
}

/** Admin rights of one account in a group, matching both its pn and lid address. */
export function findGroupAdminRole(
  metadata: GroupMetadata,
  account: WhatsAppAccount | undefined
): "admin" | "superadmin" | null {
  if (!account) {
    return null;
  }

  for (const participant of metadata.participants) {
    const matches = participantIdentities(participant).some((identity) =>
      isWhatsAppBotAddress(identity, account)
    );

    if (matches) {
      return participantAdmin(participant);
    }
  }

  return null;
}

export function isGroupAdmin(
  metadata: GroupMetadata,
  account: WhatsAppAccount | undefined
): boolean {
  return findGroupAdminRole(metadata, account) !== null;
}

/** The refusal the user sees when the bot lacks admin rights, in Indonesian. */
export function botNotAdminMessage(subject: string): string {
  return [
    `Saya belum menjadi admin di grup "${subject}", jadi saya tidak bisa melakukan tindakan ini.`,
    "Tolong jadikan saya admin grup dulu, lalu minta lagi.",
  ].join(" ");
}

interface GroupAdminContext {
  getAccount: () => WhatsAppAccount | undefined;
  getSocket: () => GroupAdminSocket | null;
}

async function loadGroup(
  context: GroupAdminContext,
  groupJid: string
): Promise<
  | GroupAdminFailure
  | { metadata: GroupMetadata; ok: true; socket: GroupAdminSocket }
> {
  if (!isGroupJid(groupJid)) {
    return fail("not_a_group", "That chat is not a WhatsApp group.");
  }

  const socket = context.getSocket();

  if (!socket) {
    return fail("socket_unavailable", "WhatsApp socket is not ready.");
  }

  try {
    const metadata = await socket.groupMetadata(groupJid.trim());

    return { metadata, ok: true, socket };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);

    return fail("group_unreadable", message);
  }
}

export async function readGroupInfo(
  context: GroupAdminContext,
  groupJid: string
): Promise<GroupInfoResult> {
  const loaded = await loadGroup(context, groupJid);

  if (!loaded.ok) {
    return loaded;
  }

  const { metadata } = loaded;

  return {
    announce: metadata.announce === true,
    botIsAdmin: isGroupAdmin(metadata, context.getAccount()),
    id: metadata.id,
    ok: true,
    owner: metadata.owner ?? null,
    participants: metadata.participants.map((participant) => ({
      admin: participantAdmin(participant),
      id: participant.id,
    })),
    subject: metadata.subject,
  };
}

/**
 * Every participant change goes through here, so the bot-is-admin check cannot
 * be skipped by a caller. Per-participant statuses are preserved: WhatsApp can
 * refuse one number (privacy settings) while accepting the rest.
 */
export async function updateGroupParticipants(
  context: GroupAdminContext,
  input: {
    action: GroupParticipantAction;
    groupJid: string;
    participants: readonly string[];
  }
): Promise<GroupParticipantResult> {
  const jids: string[] = [];

  for (const raw of input.participants) {
    const jid = toParticipantJid(raw);

    if (!jid) {
      return fail(
        "invalid_participants",
        `Nomor atau alamat tidak dikenali: ${raw}`
      );
    }

    if (!jids.includes(jid)) {
      jids.push(jid);
    }
  }

  if (jids.length === 0) {
    return fail("invalid_participants", "No participants were given.");
  }

  if (jids.length > MAX_PARTICIPANTS_PER_CALL) {
    return fail(
      "invalid_participants",
      `At most ${MAX_PARTICIPANTS_PER_CALL} participants per request.`
    );
  }

  const loaded = await loadGroup(context, input.groupJid);

  if (!loaded.ok) {
    return loaded;
  }

  const { metadata, socket } = loaded;

  if (!isGroupAdmin(metadata, context.getAccount())) {
    return fail("bot_not_admin", botNotAdminMessage(metadata.subject));
  }

  const updated = await socket.groupParticipantsUpdate(
    metadata.id,
    jids,
    input.action
  );

  const results = updated.map((entry, index) => ({
    jid: entry.jid ?? jids[index] ?? "",
    ok: entry.status === PARTICIPANT_OK_STATUS,
    status: entry.status,
  }));

  return {
    action: input.action,
    groupSubject: metadata.subject,
    ok: true,
    results,
  };
}
