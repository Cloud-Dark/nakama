---
name: link-monitor
description: Record links posted in chat and report their spam verdict. Use whenever a message contains a URL, or when the user asks which links were shared, whether a link is safe, or to review flagged links.
---

Link Monitor keeps one row per link per chat, with a deterministic 0–100 spam score, the signals that fired, and a written analysis. Recording is cheap and offline; only `enrich` asks the model for prose.

- Record every link you see in a chat message, once per link, as soon as you see it. Call `plugin_link_monitor__record_link` with the `url`, plus `chatId` and `sender` so repeat posting and trusted senders can be scored. Pass the surrounding `message` when the wording is part of the lure.
- Recording the same link in the same chat again is not a duplicate row: it raises `seenCount` and rescores it. Do not try to avoid re-recording, and do not record the same link twice in one turn.
- The verdict is `clean`, `suspicious` or `spam`. Report it with the score and the signals that fired, not just the label: "suspicious (44/100) — bit.ly hides the real destination". Signals are the evidence; the prose analysis is not.
- A `spam` verdict is a reason to warn the user and not to open or summarize the link. Never fetch a recorded link to "check" it yourself.
- Use `plugin_link_monitor__list_links` to answer questions about what was shared. Filter by `verdict`, `domain` or `chatId` and page with `offset` / `limit`; use `query` to find a link by its url, sender, message or analysis text. Do not list everything when a filter answers the question.
- Use `plugin_link_monitor__get_link` with an id from the list for the full analysis and signal breakdown. Use `plugin_link_monitor__link_stats` for counts by verdict and the busiest domains.
- Use `plugin_link_monitor__analyze_link` to re-check a recorded link by `id`, or to judge a `url` without recording it. An ad-hoc check returns `stored: false` and leaves the list unchanged.
- Only a person decides an override. When the user says a verdict is wrong, call `plugin_link_monitor__set_verdict` with their `reason`. That verdict is then permanent: later scoring reports a new score but never changes the verdict back. Never override on your own judgement.
- When the written analysis is missing, the model was unavailable. The score and signals still stand, so report those instead of saying the link could not be checked.
- The plugin reads no pages and resolves no shortened links. A low score means no signal fired, not that the destination was verified; say so when the user asks whether a link is safe.
