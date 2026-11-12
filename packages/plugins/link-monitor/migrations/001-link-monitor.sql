CREATE TABLE links (
  id TEXT PRIMARY KEY,
  url TEXT NOT NULL,
  normalized_url TEXT NOT NULL,
  domain TEXT NOT NULL,
  chat_id TEXT NOT NULL DEFAULT '',
  sender TEXT NOT NULL DEFAULT '',
  message TEXT NOT NULL DEFAULT '',
  verdict TEXT NOT NULL CHECK (verdict IN ('clean', 'spam', 'suspicious')),
  score INTEGER NOT NULL,
  signals TEXT NOT NULL,
  analysis TEXT NOT NULL DEFAULT '',
  overridden_by TEXT NOT NULL DEFAULT '',
  override_reason TEXT NOT NULL DEFAULT '',
  overridden_at INTEGER,
  first_seen_at INTEGER NOT NULL,
  last_seen_at INTEGER NOT NULL,
  seen_count INTEGER NOT NULL DEFAULT 1,
  analyzed_at INTEGER
);
CREATE UNIQUE INDEX links_normalized ON links(normalized_url, chat_id);
CREATE INDEX links_last_seen ON links(last_seen_at DESC);
CREATE INDEX links_verdict ON links(verdict, last_seen_at DESC);
CREATE INDEX links_domain ON links(domain, last_seen_at DESC);
CREATE INDEX links_chat ON links(chat_id, last_seen_at DESC);
