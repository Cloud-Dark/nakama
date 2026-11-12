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
  | "invalid_input"
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
  groupInviteCode: (jid: string) => Promise<string | undefined>;
  groupJoinApprovalMode: (jid: string, mode: "off" | "on") => Promise<void>;
  groupLeave: (jid: string) => Promise<void>;
  groupMemberAddMode: (
    jid: string,
    mode: "admin_add" | "all_member_add"
  ) => Promise<void>;
  groupMetadata: (jid: string) => Promise<GroupMetadata>;
  groupParticipantsUpdate: (
    jid: string,
    participants: string[],
    action: ParticipantAction
  ) => Promise<{ jid: string | undefined; status: string }[]>;
  groupRequestParticipantsList: (
    jid: string
  ) => Promise<{ [key: string]: string }[]>;
  groupRequestParticipantsUpdate: (
    jid: string,
    participants: string[],
    action: "approve" | "reject"
  ) => Promise<{ jid: string | undefined; status: string }[]>;
  groupRevokeInvite: (jid: string) => Promise<string | undefined>;
  groupSettingUpdate: (
    jid: string,
    setting: "announcement" | "locked" | "not_announcement" | "unlocked"
  ) => Promise<void>;
  groupToggleEphemeral: (
    jid: string,
    ephemeralExpiration: number
  ) => Promise<void>;
  groupUpdateDescription: (
    jid: string,
    description?: string
  ) => Promise<void>;
  groupUpdateSubject: (jid: string, subject: string) => Promise<void>;
  profilePictureUrl: (
    jid: string,
    type?: "image" | "preview"
  ) => Promise<string | undefined>;
  removeProfilePicture: (jid: string) => Promise<void>;
  updateProfilePicture: (jid: string, content: { url: string }) => Promise<void>;
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

/** Group settings the bot may change, each needing admin rights. */
export const GROUP_SETTING_ACTIONS = [
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

export type GroupSettingAction = (typeof GROUP_SETTING_ACTIONS)[number];

export interface GroupSettingSuccess {
  action: GroupSettingAction;
  detail: string;
  groupSubject: string;
  ok: true;
}

export type GroupSettingResult = GroupAdminFailure | GroupSettingSuccess;

export function isGroupSettingAction(
  value: string
): value is GroupSettingAction {
  return GROUP_SETTING_ACTIONS.some((action) => action === value);
}

const MAX_SUBJECT_CHARS = 100;

const MAX_TOPIC_CHARS = 2048;

/** WhatsApp's own disappearing-message choices, in seconds; 0 switches it off. */
const EPHEMERAL_SECONDS = new Set([
  0, 86_400, 604_800, 7_776_000,
]);

function photoUrl(value: string | undefined): string | null {
  const url = value?.trim();

  if (!url) {
    return null;
  }

  try {
    const parsed = new URL(url);

    return parsed.protocol === "https:" ? parsed.toString() : null;
  } catch {
    return null;
  }
}

/**
 * Subject, topic, photo and the group switches. Like participant changes these
 * require the bot to be an admin, so they share the one gate.
 */
export async function updateGroupSetting(
  context: GroupAdminContext,
  input: {
    action: GroupSettingAction;
    groupJid: string;
    seconds?: number;
    text?: string;
    url?: string;
  }
): Promise<GroupSettingResult> {
  const loaded = await loadGroup(context, input.groupJid);

  if (!loaded.ok) {
    return loaded;
  }

  const { metadata, socket } = loaded;

  if (!isGroupAdmin(metadata, context.getAccount())) {
    return fail("bot_not_admin", botNotAdminMessage(metadata.subject));
  }

  const done = (detail: string): GroupSettingSuccess => ({
    action: input.action,
    detail,
    groupSubject: metadata.subject,
    ok: true,
  });

  const id = metadata.id;

  if (input.action === "subject") {
    const subject = input.text?.trim();

    if (!subject || subject.length > MAX_SUBJECT_CHARS) {
      return fail(
        "invalid_input",
        `Nama grup harus 1 sampai ${MAX_SUBJECT_CHARS} karakter.`
      );
    }

    await socket.groupUpdateSubject(id, subject);

    return done(`Nama grup diubah menjadi "${subject}".`);
  }

  if (input.action === "topic") {
    const topic = input.text?.trim() ?? "";

    if (topic.length > MAX_TOPIC_CHARS) {
      return fail(
        "invalid_input",
        `Deskripsi grup maksimal ${MAX_TOPIC_CHARS} karakter.`
      );
    }

    await socket.groupUpdateDescription(id, topic || undefined);

    return done(topic ? "Deskripsi grup diperbarui." : "Deskripsi grup dihapus.");
  }

  if (input.action === "photo_set") {
    const url = photoUrl(input.url);

    if (!url) {
      return fail("invalid_input", "Berikan URL gambar https untuk foto grup.");
    }

    await socket.updateProfilePicture(id, { url });

    return done("Foto grup diperbarui.");
  }

  if (input.action === "photo_remove") {
    await socket.removeProfilePicture(id);

    return done("Foto grup dihapus.");
  }

  if (input.action === "ephemeral") {
    const seconds = input.seconds ?? 0;

    if (!EPHEMERAL_SECONDS.has(seconds)) {
      return fail(
        "invalid_input",
        "Durasi pesan sementara hanya boleh 0, 86400, 604800 atau 7776000 detik."
      );
    }

    await socket.groupToggleEphemeral(id, seconds);

    return done(
      seconds === 0
        ? "Pesan sementara dimatikan."
        : `Pesan sementara diatur ${seconds} detik.`
    );
  }

  return await applyGroupSwitch(socket, id, input.action, done);
}

const SETTING_UPDATES = {
  announce_off: "not_announcement",
  announce_on: "announcement",
  locked_off: "unlocked",
  locked_on: "locked",
} as const;

const SWITCH_DETAILS = {
  announce_off: "Semua anggota boleh mengirim pesan.",
  announce_on: "Hanya admin yang boleh mengirim pesan.",
  join_approval_off: "Permintaan gabung tidak perlu disetujui.",
  join_approval_on: "Permintaan gabung harus disetujui admin.",
  locked_off: "Semua anggota boleh mengubah info grup.",
  locked_on: "Hanya admin yang boleh mengubah info grup.",
  member_add_admin_only: "Hanya admin yang boleh menambah anggota.",
  member_add_all: "Semua anggota boleh menambah anggota.",
} as const;

type GroupSwitchAction = keyof typeof SWITCH_DETAILS;

function isSettingUpdateAction(
  action: GroupSwitchAction
): action is keyof typeof SETTING_UPDATES {
  return Object.hasOwn(SETTING_UPDATES, action);
}

function isGroupSwitch(action: GroupSettingAction): action is GroupSwitchAction {
  return Object.hasOwn(SWITCH_DETAILS, action);
}

async function applyGroupSwitch(
  socket: GroupAdminSocket,
  id: string,
  action: GroupSettingAction,
  done: (detail: string) => GroupSettingSuccess
): Promise<GroupSettingResult> {
  if (!isGroupSwitch(action)) {
    return fail("invalid_input", `Aksi "${action}" tidak dikenal.`);
  }

  const setting = isSettingUpdateAction(action)
    ? SETTING_UPDATES[action]
    : null;

  if (setting) {
    await socket.groupSettingUpdate(id, setting);

    return done(SWITCH_DETAILS[action]);
  }

  if (action === "join_approval_on" || action === "join_approval_off") {
    await socket.groupJoinApprovalMode(
      id,
      action === "join_approval_on" ? "on" : "off"
    );

    return done(SWITCH_DETAILS[action]);
  }

  await socket.groupMemberAddMode(
    id,
    action === "member_add_admin_only" ? "admin_add" : "all_member_add"
  );

  return done(SWITCH_DETAILS[action]);
}
