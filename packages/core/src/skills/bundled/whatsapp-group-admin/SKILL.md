---
name: whatsapp-group-admin
description: Act as an admin in a WhatsApp group — remove, add, promote or demote members, rename the group, set its description or photo, change its switches, summarize the discussion, read the roster, and read or change which of those actions are allowed. Use when a user in a WhatsApp group asks the bot to kick, add, promote, demote, rename, change the photo or description, or summarize the chat.
---

These tools work only in the WhatsApp group the current message came from. They cannot touch another group, and they are absent outside WhatsApp.

Two gates guard every action, and both are checked for you:

1. The action must be switched on. A disabled action is refused and the refusal names it.
2. The caller must be allowed to command the bot: the bot owner, a number on the allow list, or an admin of this group. Anybody else is refused.

Then WhatsApp itself imposes a third: the bot must be a group admin to change members.

- Read `whatsapp_group_info` first when you are unsure whether the bot is an admin, or when the user asks who the admins are. It reports `Saya admin di sini: ya` or `belum`.
- `whatsapp_group_remove` kicks members. `whatsapp_group_add` adds numbers. `whatsapp_group_promote` and `whatsapp_group_demote` change admin rights. Each takes `participants`: phone numbers as the user wrote them (`0812…`, `+62812…`) or full jids.
- When the bot is not an admin, the tool refuses with an Indonesian message asking to be made a group admin first. Pass that message on as the answer. Do not retry, and do not suggest a workaround — there is none.
- WhatsApp answers per participant. A number may be refused (privacy settings, already a member) while the rest succeed. Report exactly who went through and who did not, with the status code, as the tool returns it.
- Name the people you are about to act on in your reply, and act only on the ones the user named. Never widen a request: "kick the spammer" is one person, not everyone who posted a link.
- `whatsapp_group_set_subject` renames the group (1–100 characters). `whatsapp_group_set_topic` sets its description, and an empty text clears it. `whatsapp_group_set_photo` takes an **https** image URL; an http or malformed URL is refused. `whatsapp_group_remove_photo` clears the photo.
- `whatsapp_group_switch` sets one switch: `announce_on` / `announce_off` (only admins may post), `locked_on` / `locked_off` (only admins may edit group info), `join_approval_on` / `join_approval_off`, `member_add_admin_only` / `member_add_all`, and `ephemeral` with `seconds` of 0, 86400, 604800 or 7776000 — WhatsApp accepts no other duration.
- The user can ask for a summary in words, or send `/summary` (also `/ringkas`, optionally with a count such as `/summary 120`) which reaches you as a summary request.
- `listening` is the switch that governs saving this chat to memory. With it off you can still recall facts, but save nothing from here; `/perm off listening` is how a user stops the bot remembering a chat.
- `whatsapp_group_summary` returns the stored transcript of this chat. Summarize only what it contains: attribute each point to what was actually said, and never invent a message or a speaker. When it reports no stored messages, say that instead of guessing.
- Changing the group name, photo, description or switches is visible to every member and is not silently reversible. For a request that does not say what to change it to, ask first.
- `whatsapp_group_permissions` with no arguments lists which actions are on. With `action` and `enabled` it switches one. Only the owner and allow-listed numbers may switch an action; a group admin reading the list is fine. The user can also do this from the chat with `/perm`, `/perm on <aksi>` and `/perm off <aksi>`.
- Removing a member is not reversible by you: the person must be re-added, and that needs their privacy settings to permit it. For a request that is ambiguous about who, ask before acting.
