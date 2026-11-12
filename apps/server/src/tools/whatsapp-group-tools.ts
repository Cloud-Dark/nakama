import {
  canChangeWhatsAppBotPermissions,
  createWhatsAppGroupClient,
  decideWhatsAppBotCommand,
  describeWhatsAppBotPermissions,
  loadWhatsAppConfigFile,
  resolveWhatsAppCallerRole,
  saveWhatsAppConfig,
  type ToolContext,
  type ToolDefinition,
  type WhatsAppBotAction,
  type WhatsAppGroupAction,
  type WhatsAppGroupInfoResult,
  whatsAppPermissionDeniedMessage,
} from "@nakama/core";
import { z } from "zod";

const ParticipantsInputSchema = z.object({
  groupJid: z.string().optional().catch(undefined),
  participants: z.array(z.string()).min(1).catch([]),
});

const PermissionInputSchema = z.object({
  action: z.string().optional().catch(undefined),
  enabled: z.boolean().optional().catch(undefined),
});

const groupClient = createWhatsAppGroupClient();

interface GroupTurn {
  chatJid: string;
  orgId: string;
  profileId: string;
  senderJids: string[];
}

/**
 * The group this turn is answering in. A tool may only act on that group, so a
 * message in one group cannot move members of another.
 */
function resolveGroupTurn(
  context: ToolContext,
  requestedJid: string | undefined
): GroupTurn {
  const message = context.whatsappMessage;

  if (!(message && message.isGroup)) {
    throw new Error(
      "Tindakan grup WhatsApp hanya bisa dilakukan di dalam grup WhatsApp."
    );
  }

  const wanted = requestedJid?.trim();

  if (wanted && wanted !== message.chatJid) {
    throw new Error(
      "Saya hanya bisa mengubah grup tempat pesan ini dikirim, bukan grup lain."
    );
  }

  if (!(context.orgId && context.profileId)) {
    throw new Error("Koneksi WhatsApp untuk agen ini belum siap.");
  }

  return {
    chatJid: message.chatJid,
    orgId: context.orgId,
    profileId: context.profileId,
    senderJids: message.senderJids,
  };
}

async function readGroupFacts(turn: GroupTurn) {
  const owner = { orgId: turn.orgId, profileId: turn.profileId };
  const config = await loadWhatsAppConfigFile(owner);

  if (!config) {
    throw new Error("Koneksi WhatsApp untuk agen ini belum dikonfigurasi.");
  }

  const info = await groupClient.info(owner, turn.chatJid);

  const groupAdminJids = info.ok
    ? info.participants
        .values()
        .filter((participant) => participant.admin !== null)
        .map((participant) => participant.id)
        .toArray()
    : [];

  return {
    config,
    facts: {
      allowedPhones: config.allowedPhones,
      callerJid: turn.senderJids[0] ?? null,
      groupAdminJids,
      ownerJids: [config.pairedJid, config.pairedLid],
    },
    info,
    owner,
  };
}

/** Refuses unless the action is switched on and the caller may command the bot. */
async function authorize(
  turn: GroupTurn,
  action: WhatsAppBotAction
): Promise<
  Awaited<ReturnType<typeof readGroupFacts>> & { role: "allowed" }
> {
  const resolved = await readGroupFacts(turn);

  const decision = decideWhatsAppBotCommand({
    action,
    facts: resolved.facts,
    permissions: resolved.config.botActions,
  });

  if (!decision.allowed) {
    throw new Error(whatsAppPermissionDeniedMessage(decision, action));
  }

  return { ...resolved, role: "allowed" };
}

function describeOutcome(
  action: WhatsAppGroupAction,
  results: { jid: string; ok: boolean; status: string }[]
): string {
  const done = results
    .values()
    .filter((entry) => entry.ok)
    .map((entry) => entry.jid)
    .toArray();

  const refused = results.filter((entry) => !entry.ok);

  const lines = [
    done.length > 0
      ? `Berhasil (${action}): ${done.join(", ")}`
      : `Tidak ada yang berhasil untuk ${action}.`,
  ];

  if (refused.length > 0) {
    lines.push(
      `Ditolak WhatsApp: ${refused
        .map((entry) => `${entry.jid} (kode ${entry.status})`)
        .join(", ")}`
    );
  }

  return lines.join("\n");
}

function participantsTool(
  action: WhatsAppGroupAction,
  name: string,
  description: string
): ToolDefinition {
  return {
    description,
    name,
    parallelSafe: false,
    parameters: {
      additionalProperties: false,
      properties: {
        groupJid: {
          description:
            "The group to act on. Omit it: the group of the current message is used.",
          type: "string",
        },
        participants: {
          description:
            "Phone numbers or jids, e.g. \"0812...\", \"+62812...\" or \"62812...@s.whatsapp.net\".",
          items: { type: "string" },
          type: "array",
        },
      },
      required: ["participants"],
      type: "object",
    },
    async run(input, context: ToolContext) {
      const parsed = ParticipantsInputSchema.parse(input);
      const turn = resolveGroupTurn(context, parsed.groupJid);

      if (parsed.participants.length === 0) {
        throw new Error("Sebutkan nomor atau anggota yang dimaksud.");
      }

      const { owner } = await authorize(turn, action);

      const result = await groupClient.updateParticipants(owner, {
        action,
        groupJid: turn.chatJid,
        participants: parsed.participants,
      });

      if (!result.ok) {
        throw new Error(result.error);
      }

      return describeOutcome(action, result.results);
    },
  } satisfies ToolDefinition;
}

export const whatsappKickTool = participantsTool(
  "remove",
  "whatsapp_group_remove",
  "Remove (kick) members from the current WhatsApp group. Needs the bot to be a group admin; it refuses and asks to be made admin otherwise."
);

export const whatsappAddTool = participantsTool(
  "add",
  "whatsapp_group_add",
  "Add phone numbers to the current WhatsApp group. Needs the bot to be a group admin. A number whose privacy settings forbid it is reported per number."
);

export const whatsappPromoteTool = participantsTool(
  "promote",
  "whatsapp_group_promote",
  "Make members admins of the current WhatsApp group. Needs the bot to be a group admin."
);

export const whatsappDemoteTool = participantsTool(
  "demote",
  "whatsapp_group_demote",
  "Remove admin rights from members of the current WhatsApp group. Needs the bot to be a group admin."
);

function summarizeGroup(info: WhatsAppGroupInfoResult): string {
  const admins = info.participants.filter(
    (participant) => participant.admin !== null
  );

  return [
    `Grup: ${info.subject}`,
    `Saya admin di sini: ${info.botIsAdmin ? "ya" : "belum"}`,
    `Jumlah anggota: ${info.participants.length}`,
    `Admin: ${admins.map((participant) => participant.id).join(", ") || "tidak ada"}`,
    info.announce ? "Hanya admin yang boleh mengirim pesan." : "",
  ]
    .filter(Boolean)
    .join("\n");
}

export const whatsappGroupInfoTool = {
  description:
    "Read the current WhatsApp group: its name, member count, who the admins are, and whether the bot itself is an admin. Use it before asking to be made admin.",
  name: "whatsapp_group_info",
  parallelSafe: true,
  parameters: {
    additionalProperties: false,
    properties: {
      groupJid: {
        description:
          "The group to read. Omit it: the group of the current message is used.",
        type: "string",
      },
    },
    required: [],
    type: "object",
  },
  async run(input, context: ToolContext) {
    const parsed = ParticipantsInputSchema.partial().parse(input);
    const turn = resolveGroupTurn(context, parsed.groupJid);
    const { info } = await authorize(turn, "group_info");

    if (!info.ok) {
      throw new Error(info.error);
    }

    return summarizeGroup(info);
  },
} satisfies ToolDefinition;

export const whatsappGroupPermissionsTool = {
  description:
    "Read or change which WhatsApp group actions this bot may perform. Reading is open to anyone who may command the bot; changing is restricted to the bot owner and allow-listed numbers.",
  name: "whatsapp_group_permissions",
  parallelSafe: false,
  parameters: {
    additionalProperties: false,
    properties: {
      action: {
        description:
          "The action to switch: add, demote, group_info, promote, remove or reply. Omit it to read the current state.",
        type: "string",
      },
      enabled: {
        description: "True switches the action on, false switches it off.",
        type: "boolean",
      },
    },
    required: [],
    type: "object",
  },
  async run(input, context: ToolContext) {
    const parsed = PermissionInputSchema.parse(input);
    const turn = resolveGroupTurn(context, undefined);
    const { config, facts, owner } = await readGroupFacts(turn);
    const role = resolveWhatsAppCallerRole(facts);

    if (parsed.action === undefined || parsed.enabled === undefined) {
      if (role === "stranger") {
        throw new Error(
          whatsAppPermissionDeniedMessage(
            { allowed: false, reason: "not_authorized", role },
            "group_info"
          )
        );
      }

      return describeWhatsAppBotPermissions(config.botActions);
    }

    if (!canChangeWhatsAppBotPermissions(role)) {
      throw new Error(
        "Hanya pemilik bot dan nomor yang diizinkan boleh mengubah izin ini. Admin grup bisa menyuruh saya, tapi tidak bisa menambah izin saya."
      );
    }

    const action = parsed.action.trim().toLowerCase();

    if (!Object.hasOwn(config.botActions, action)) {
      throw new Error(
        `Aksi "${parsed.action}" tidak dikenal. Pilihan: ${Object.keys(config.botActions).join(", ")}`
      );
    }

    await saveWhatsAppConfig(
      { botActions: { [action]: parsed.enabled } },
      owner
    );

    const saved = await loadWhatsAppConfigFile(owner);

    return [
      `Aksi "${action}" sekarang ${parsed.enabled ? "aktif" : "mati"}.`,
      "",
      describeWhatsAppBotPermissions(saved?.botActions ?? config.botActions),
    ].join("\n");
  },
} satisfies ToolDefinition;

export const whatsappGroupTools: ToolDefinition[] = [
  whatsappAddTool,
  whatsappDemoteTool,
  whatsappGroupInfoTool,
  whatsappGroupPermissionsTool,
  whatsappKickTool,
  whatsappPromoteTool,
];
