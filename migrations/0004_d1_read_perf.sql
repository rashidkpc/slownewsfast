-- Read-performance indexes.
--
-- These columns are filtered on in hot paths (the every-15-minutes cron sweep,
-- digest publishing, and feed deletion) but had no supporting index, so SQLite
-- fell back to full table scans. On a growing database that turns into millions
-- of rows read per cron tick.

-- The orphaned-enclosure sweep and enclosure cascades probe links by
-- enclosure_id; the composite primary key only covers (entry_id, enclosure_id).
CREATE INDEX IF NOT EXISTS idx_enclosure_links_enclosure
  ON feed_entry_enclosure_links(enclosure_id);

-- Image ingestion dedupes by source URL for every item in every digest.
CREATE INDEX IF NOT EXISTS idx_enclosures_source_url
  ON feed_enclosures(source_url);

-- The stats purge deletes by age; the existing index is (feed_id, created_at).
CREATE INDEX IF NOT EXISTS idx_visualizations_created
  ON feed_visualizations(created_at);

-- Digest polling checks which upstream guids have already been folded into a
-- published entry; this lets the lookup start from the (few) incoming guids
-- instead of reading every consumed guid for the feed.
CREATE INDEX IF NOT EXISTS idx_entry_source_items_guid
  ON entry_source_items(guid);

-- One-time cleanup: if foreign-key cascades were ever missed, stale rows keep
-- enclosures looking referenced forever, so they are never swept. The indexes
-- above make this cheap.
DELETE FROM entry_source_items
 WHERE entry_id NOT IN (SELECT id FROM feed_entries);

DELETE FROM feed_entry_enclosure_links
 WHERE entry_id NOT IN (SELECT id FROM feed_entries)
    OR enclosure_id NOT IN (SELECT id FROM feed_enclosures);
