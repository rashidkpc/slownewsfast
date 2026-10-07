-- Introduce a generic "producer" layer so a feed's entries can be produced by
-- more than one mechanism (inbound email today, scheduled digests, more later)
-- without hanging type-specific columns off `feeds` or branching the output.

-- Generic output-entry fields. A thumbnail and an Atom summary are properties
-- of any entry, regardless of how it was produced.
ALTER TABLE feed_entries ADD COLUMN image TEXT;
ALTER TABLE feed_entries ADD COLUMN summary TEXT;

-- Feed metadata discovered from a source (used by digest feeds).
ALTER TABLE feeds ADD COLUMN description TEXT;
ALTER TABLE feeds ADD COLUMN link TEXT;
ALTER TABLE feeds ADD COLUMN source_title TEXT;
ALTER TABLE feeds ADD COLUMN source_icon TEXT;

-- Ingested attachments/images remember where they came from (dedup + provenance).
ALTER TABLE feed_enclosures ADD COLUMN source_url TEXT;

-- How a feed's entries get produced.
CREATE TABLE feed_producers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  feed_id INTEGER NOT NULL REFERENCES feeds(id) ON DELETE CASCADE,
  kind TEXT NOT NULL,
  config TEXT NOT NULL DEFAULT '{}',
  state TEXT NOT NULL DEFAULT '{}',
  last_run_at TEXT,
  next_run_at TEXT,
  error TEXT,
  enabled INTEGER NOT NULL DEFAULT 1,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX idx_producers_feed ON feed_producers(feed_id);
CREATE INDEX idx_producers_kind_next ON feed_producers(kind, next_run_at);

-- Transient inbox for batch producers. Rows are deleted as soon as they have
-- been composed into a published entry; only `entry_source_items` (below) keeps
-- the identities around, and that lives and dies with the entry.
CREATE TABLE source_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  producer_id INTEGER NOT NULL REFERENCES feed_producers(id) ON DELETE CASCADE,
  guid TEXT NOT NULL,
  url TEXT,
  title TEXT,
  author TEXT,
  image TEXT,
  content TEXT,
  summary TEXT,
  published TEXT,
  discovered_at TEXT DEFAULT (datetime('now')),
  UNIQUE(producer_id, guid)
);

CREATE INDEX idx_source_items_producer ON source_items(producer_id, published);

-- The identities of the source items that were folded into a published entry.
-- This is the dedup memory that prevents re-ingesting items still sitting in the
-- upstream feed; it is bounded by the output-entry retention cap.
CREATE TABLE entry_source_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  entry_id INTEGER NOT NULL REFERENCES feed_entries(id) ON DELETE CASCADE,
  guid TEXT NOT NULL,
  url TEXT
);

CREATE INDEX idx_entry_source_items_entry ON entry_source_items(entry_id);

-- Every existing feed gets an email producer.
INSERT INTO feed_producers (feed_id, kind) SELECT id, 'email' FROM feeds;
