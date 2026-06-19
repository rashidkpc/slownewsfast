CREATE TABLE feeds (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  public_id TEXT UNIQUE NOT NULL,
  title TEXT NOT NULL,
  icon TEXT,
  email_icon TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE feed_entries (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  public_id TEXT UNIQUE NOT NULL,
  feed_id INTEGER NOT NULL REFERENCES feeds(id) ON DELETE CASCADE,
  created_at TEXT DEFAULT (datetime('now')),
  author TEXT,
  title TEXT,
  content TEXT
);

CREATE INDEX idx_entries_feed ON feed_entries(feed_id, id DESC);

CREATE TABLE feed_enclosures (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  public_id TEXT UNIQUE NOT NULL,
  type TEXT,
  length INTEGER,
  name TEXT,
  r2_key TEXT
);

CREATE TABLE feed_entry_enclosure_links (
  entry_id INTEGER NOT NULL REFERENCES feed_entries(id) ON DELETE CASCADE,
  enclosure_id INTEGER NOT NULL REFERENCES feed_enclosures(id) ON DELETE CASCADE,
  PRIMARY KEY (entry_id, enclosure_id)
);

CREATE TABLE feed_visualizations (
  feed_id INTEGER NOT NULL REFERENCES feeds(id) ON DELETE CASCADE,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX idx_visualizations_feed ON feed_visualizations(feed_id, created_at);
