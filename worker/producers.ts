import {
  type DigestConfig,
  type DigestState,
  type FeedData,
  IMAGE_INGEST_BUDGET,
  MAX_DIGEST_CHARS,
  USER_AGENT,
  ACCEPT,
  DEFAULT_DIGEST_CONFIG,
  escapeXml,
  feedIconFromUrl,
  formatInTz,
  generatePublicId,
  getNum,
  getStr,
  nextCronRun,
  parseJson,
  renderTemplate,
} from "./util";
import { parseFeedXml, sanitizeContent, stripLeadImage } from "./parse";

export type ProducerRow = Record<string, unknown>;

// ---------------------------------------------------------------------------
// Producer registry
//
// A producer is the thing that turns *something* into feed entries. The output
// side (feed_entries + render.ts) is generic, so adding a producer kind means
// adding a handler here and a config form in the UI - not touching the schema.
// ---------------------------------------------------------------------------

export interface ProducerHandler {
  kind: string;
  /** Fetch new source items into the transient inbox. */
  poll?: (env: Env, feed: ProducerRow, producer: ProducerRow) => Promise<void>;
  /** Fold the inbox into one published entry. Returns true if one was made. */
  publish?: (env: Env, feed: ProducerRow, producer: ProducerRow, windowEnd: string) => Promise<boolean>;
  /** Next scheduled publish time for a producer with this config. */
  nextRun?: (config: DigestConfig) => string | null;
}

// ---------------------------------------------------------------------------
// Config / state helpers
// ---------------------------------------------------------------------------

export function producerConfig(producer: ProducerRow): DigestConfig {
  const raw = parseJson<Partial<DigestConfig>>(producer["config"], {});
  return { ...DEFAULT_DIGEST_CONFIG, sourceUrl: "", ...raw } as DigestConfig;
}

export function producerState(producer: ProducerRow): DigestState {
  return parseJson<DigestState>(producer["state"], {});
}

export async function updateProducer(
  db: D1Database,
  producerId: number,
  fields: {
    config?: DigestConfig;
    state?: DigestState;
    error?: string | null;
    lastRunAt?: string | null;
    nextRunAt?: string | null;
  },
): Promise<void> {
  const sets: string[] = [];
  const params: unknown[] = [];
  if (fields.config !== undefined) {
    sets.push("config = ?");
    params.push(JSON.stringify(fields.config));
  }
  if (fields.state !== undefined) {
    sets.push("state = ?");
    params.push(JSON.stringify(fields.state));
  }
  if (fields.error !== undefined) {
    sets.push("error = ?");
    params.push(fields.error);
  }
  if (fields.lastRunAt !== undefined) {
    sets.push("last_run_at = ?");
    params.push(fields.lastRunAt);
  }
  if (fields.nextRunAt !== undefined) {
    sets.push("next_run_at = ?");
    params.push(fields.nextRunAt);
  }
  if (sets.length === 0) return;
  params.push(producerId);
  await db.prepare(`UPDATE feed_producers SET ${sets.join(", ")} WHERE id = ?`).bind(...params).run();
}

export function feedDisplayTitle(feed: Record<string, unknown>): string {
  return getStr(feed, "title") || getStr(feed, "source_title") || getStr(feed, "public_id") || "Untitled";
}

// ---------------------------------------------------------------------------
// Digest producer: poll the source into the inbox
// ---------------------------------------------------------------------------

async function pollDigestProducer(env: Env, feed: ProducerRow, producer: ProducerRow): Promise<void> {
  const db = env.DB;
  const config = producerConfig(producer);
  const state = producerState(producer);
  const feedId = getNum(feed, "id");
  const producerId = getNum(producer, "id");
  const sourceUrl = config.sourceUrl;
  const now = new Date().toISOString();

  const headers: Record<string, string> = { "User-Agent": USER_AGENT, Accept: ACCEPT };
  if (state.etag) headers["If-None-Match"] = state.etag;
  if (state.lastModified) headers["If-Modified-Since"] = state.lastModified;

  let res: Response;
  try {
    res = await fetch(sourceUrl, { headers, redirect: "follow" });
  } catch (err) {
    state.lastPolled = now;
    await updateProducer(db, producerId, {
      state,
      error: `Fetch failed: ${err instanceof Error ? err.message : "unknown"}`,
    });
    return;
  }

  if (res.status === 304) {
    state.lastPolled = now;
    await updateProducer(db, producerId, { state, error: null });
    return;
  }

  if (!res.ok) {
    state.lastPolled = now;
    await updateProducer(db, producerId, { state, error: `HTTP ${res.status}` });
    return;
  }

  const xml = await res.text();
  let data: FeedData;
  try {
    data = parseFeedXml(xml, sourceUrl);
  } catch (err) {
    state.lastPolled = now;
    await updateProducer(db, producerId, {
      state,
      error: `Parse failed: ${err instanceof Error ? err.message : "unknown"}`,
    });
    return;
  }

  state.etag = res.headers.get("etag") || state.etag;
  state.lastModified = res.headers.get("last-modified") || state.lastModified;
  state.lastPolled = now;

  // Refresh source metadata. A user-set title/icon is preserved.
  const userTitle = getStr(feed, "title");
  const title = config.titleCustom && userTitle ? userTitle : data.title;
  await db
    .prepare(
      `UPDATE feeds SET title = ?, description = ?, link = ?, source_title = ?, source_icon = ? WHERE id = ?`,
    )
    .bind(
      title,
      data.description,
      data.link,
      data.title,
      data.icon || feedIconFromUrl(sourceUrl),
      feedId,
    )
    .run();

  // Guids already folded into a published entry must never be re-ingested.
  const consumed = await db
    .prepare(
      `SELECT esi.guid AS guid FROM entry_source_items esi
       INNER JOIN feed_entries e ON e.id = esi.entry_id
       WHERE e.feed_id = ?`,
    )
    .bind(feedId)
    .all();
  const consumedGuids = new Set(
    (consumed.results as Record<string, unknown>[]).map((r) => getStr(r, "guid")),
  );

  for (const entry of data.entries) {
    if (!entry.guid) continue;
    if (config.eligibleFrom && entry.published < config.eligibleFrom) continue;
    if (consumedGuids.has(entry.guid)) continue;
    const sanitized = entry.content
      ? await sanitizeContent(entry.content, data.link || sourceUrl)
      : "";
    await db
      .prepare(
        `INSERT OR IGNORE INTO source_items
           (producer_id, guid, url, title, author, image, content, summary, published, discovered_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        producerId,
        entry.guid,
        entry.url,
        entry.title,
        entry.author,
        entry.image,
        sanitized,
        entry.summary,
        entry.published,
        now,
      )
      .run();
  }

  await updateProducer(db, producerId, { state, error: null });
}

// ---------------------------------------------------------------------------
// Image ingestion: fetch a lead image into R2 and return a local URL.
// ---------------------------------------------------------------------------

interface Ingested {
  id: number;
  url: string;
}

function extFor(type: string): string {
  if (type.includes("png")) return ".png";
  if (type.includes("gif")) return ".gif";
  if (type.includes("webp")) return ".webp";
  if (type.includes("avif")) return ".avif";
  if (type.includes("svg")) return ".svg";
  return ".jpg";
}

function filenameFor(url: string, type: string): string {
  let base = "image";
  try {
    const last = new URL(url).pathname.split("/").filter(Boolean).pop();
    if (last) base = decodeURIComponent(last);
  } catch {
    /* keep default */
  }
  base = base.replace(/[^a-zA-Z0-9._-]/g, "_");
  if (!/\.[a-z0-9]+$/i.test(base)) base += extFor(type);
  return base;
}

async function ingestImage(
  env: Env,
  url: string,
  cache: Map<string, Ingested | null>,
): Promise<Ingested | null> {
  const key = url.split("?")[0];
  if (cache.has(key)) return cache.get(key) ?? null;
  let result: Ingested | null = null;
  try {
    const existing = await env.DB.prepare(
      "SELECT id, public_id, name FROM feed_enclosures WHERE source_url = ? LIMIT 1",
    )
      .bind(key)
      .first();
    if (existing) {
      const e = existing as Record<string, unknown>;
      result = {
        id: getNum(e, "id"),
        url: `https://${env.DOMAIN}/files/${getStr(e, "public_id")}/${encodeURIComponent(getStr(e, "name"))}`,
      };
    } else {
      const res = await fetch(url, { headers: { "User-Agent": USER_AGENT }, redirect: "follow" });
      if (res.ok) {
        const type = res.headers.get("content-type") || "";
        if (type.startsWith("image/")) {
          const buf = await res.arrayBuffer();
          if (buf.byteLength > 0 && buf.byteLength <= 8_000_000) {
            const publicId = generatePublicId();
            const name = filenameFor(url, type);
            const r2Key = `enclosures/${publicId}/${name}`;
            await env.ATTACHMENTS.put(r2Key, buf, { httpMetadata: { contentType: type } });
            const ins = await env.DB.prepare(
              `INSERT INTO feed_enclosures (public_id, type, length, name, r2_key, source_url)
               VALUES (?, ?, ?, ?, ?, ?)`,
            )
              .bind(publicId, type, buf.byteLength, name, r2Key, key)
              .run();
            result = {
              id: Number(ins.meta.last_row_id),
              url: `https://${env.DOMAIN}/files/${publicId}/${encodeURIComponent(name)}`,
            };
          }
        }
      }
    }
  } catch {
    result = null;
  }
  cache.set(key, result);
  return result;
}

// ---------------------------------------------------------------------------
// Digest producer: fold the inbox into a published entry
// ---------------------------------------------------------------------------

async function runDigest(
  env: Env,
  feed: ProducerRow,
  producer: ProducerRow,
  windowEnd: string,
): Promise<boolean> {
  const db = env.DB;
  const config = producerConfig(producer);
  const feedId = getNum(feed, "id");
  const producerId = getNum(producer, "id");
  const tz = config.tz;
  const feedTitle = feedDisplayTitle(feed);

  const pending = await db
    .prepare("SELECT * FROM source_items WHERE producer_id = ? ORDER BY published ASC")
    .bind(producerId)
    .all();
  const entries = pending.results as Record<string, unknown>[];
  if (entries.length === 0) return false;

  const iso = windowEnd.slice(0, 10);
  const dateStr = formatInTz(windowEnd, tz, {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });
  const title = renderTemplate(config.titleTemplate || "{date}", {
    date: dateStr,
    iso,
    feed: feedTitle,
    count: String(entries.length),
  });

  const imageCache = new Map<string, Ingested | null>();
  const linkedEnclosures = new Set<number>();
  let imageBudget = config.ingestImages ? IMAGE_INGEST_BUDGET : 0;
  let digestImage = "";
  let content = "";
  let capped = false;

  for (const e of entries) {
    const url = getStr(e, "url");
    const entryTitle = getStr(e, "title") || "(untitled)";
    const author = getStr(e, "author");
    const published = getStr(e, "published");
    const sourceImage = getStr(e, "image");

    let headerImage = sourceImage;
    if (sourceImage && config.ingestImages && imageBudget > 0) {
      imageBudget--;
      const ingested = await ingestImage(env, sourceImage, imageCache);
      if (ingested) {
        headerImage = ingested.url;
        linkedEnclosures.add(ingested.id);
      }
    }
    if (!digestImage && headerImage) digestImage = headerImage;

    let section = `<section class="digest-item">`;
    if (headerImage) {
      const photo = `<img src="${escapeXml(headerImage)}" alt="" loading="lazy">`;
      section += url
        ? `<a class="digest-photo" href="${escapeXml(url)}">${photo}</a>`
        : `<span class="digest-photo">${photo}</span>`;
    }
    section += url
      ? `<h2><a href="${escapeXml(url)}">${escapeXml(entryTitle)}</a></h2>`
      : `<h2>${escapeXml(entryTitle)}</h2>`;

    const meta = [
      author,
      published ? formatInTz(published, tz, { dateStyle: "medium", timeStyle: "short" }) : "",
    ]
      .filter(Boolean)
      .join(" \u00b7 ");
    if (meta) section += `<p class="digest-meta">${escapeXml(meta)}</p>`;

    const full = getStr(e, "content");
    const summary = getStr(e, "summary");
    if (config.includeContent && full) {
      section += headerImage ? stripLeadImage(full, headerImage) : full;
    } else if (summary) {
      section += `<p>${escapeXml(summary)}</p>`;
    } else if (url) {
      section += `<p><a href="${escapeXml(url)}">Read the original</a></p>`;
    }
    section += `</section>`;

    if (content.length + section.length > MAX_DIGEST_CHARS) {
      capped = true;
      const photo = headerImage
        ? `<a class="digest-photo" href="${escapeXml(url || headerImage)}"><img src="${escapeXml(headerImage)}" alt="" loading="lazy"></a>`
        : "";
      content += url
        ? `<section class="digest-item">${photo}<h2><a href="${escapeXml(url)}">${escapeXml(entryTitle)}</a></h2><p class="digest-meta">listed \u00b7 <a href="${escapeXml(url)}">read on the site</a></p></section>`
        : "";
      break;
    }
    content += section;
  }

  if (capped) {
    content += `<p class="digest-note"><em>Some items were abbreviated because this digest hit its size limit. Open the source links for the full posts.</em></p>`;
  }

  const summary = entries
    .map((e) => getStr(e, "title"))
    .filter(Boolean)
    .join(" \u00b7 ");

  const publicId = generatePublicId();
  const ins = await db
    .prepare(
      `INSERT INTO feed_entries (public_id, feed_id, created_at, author, title, content, image, summary)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(publicId, feedId, windowEnd, feedTitle, title, content, digestImage || null, summary)
    .run();
  const entryId = Number(ins.meta.last_row_id);

  // Record the identities this entry consumed (dedup memory that lives and dies
  // with the entry), then drop the transient inbox rows.
  for (const e of entries) {
    await db
      .prepare("INSERT INTO entry_source_items (entry_id, guid, url) VALUES (?, ?, ?)")
      .bind(entryId, getStr(e, "guid"), getStr(e, "url"))
      .run();
  }
  const ids = entries.map((e) => getNum(e, "id"));
  const placeholders = ids.map(() => "?").join(",");
  await db
    .prepare(`DELETE FROM source_items WHERE producer_id = ? AND id IN (${placeholders})`)
    .bind(producerId, ...ids)
    .run();

  for (const enclosureId of linkedEnclosures) {
    await db
      .prepare("INSERT INTO feed_entry_enclosure_links (entry_id, enclosure_id) VALUES (?, ?)")
      .bind(entryId, enclosureId)
      .run();
  }

  return true;
}

export const PRODUCERS: Record<string, ProducerHandler> = {
  email: { kind: "email" },
  feed_digest: {
    kind: "feed_digest",
    poll: pollDigestProducer,
    publish: runDigest,
    nextRun: (config) => nextCronRun(config.cron, config.tz),
  },
};

// ---------------------------------------------------------------------------
// Email producer
// ---------------------------------------------------------------------------

export async function deliverEmail(
  env: Env,
  feed: ProducerRow,
  message: ForwardableEmailMessage,
  parsed: {
    subject?: string | null;
    html?: string | null;
    text?: string | null;
    from?: { address?: string } | null;
    attachments?: { filename?: string | null; mimeType?: string | null; content: ArrayBuffer | string }[];
  },
  textToHtml: (text: string) => string,
): Promise<void> {
  const feedId = getNum(feed, "id");
  const subject = parsed.subject || "(no subject)";
  const author = parsed.from?.address || message.from;
  const htmlContent = parsed.html || (parsed.text ? textToHtml(parsed.text) : "No content.");

  const entryPublicId = generatePublicId();
  await env.DB.prepare(
    `INSERT INTO feed_entries (public_id, feed_id, author, title, content)
     VALUES (?, ?, ?, ?, ?)`,
  )
    .bind(entryPublicId, feedId, author, subject, htmlContent)
    .run();

  const entry = await env.DB.prepare("SELECT id FROM feed_entries WHERE public_id = ?")
    .bind(entryPublicId)
    .first();
  if (!entry) return;
  const entryId = getNum(entry as Record<string, unknown>, "id");

  const attachments = parsed.attachments || [];
  for (const att of attachments) {
    const enclosurePublicId = generatePublicId();
    const filename = att.filename || "attachment";
    const r2Key = `enclosures/${enclosurePublicId}/${filename}`;
    await env.ATTACHMENTS.put(r2Key, att.content, {
      httpMetadata: { contentType: att.mimeType || "application/octet-stream" },
    });
    await env.DB.prepare(
      `INSERT INTO feed_enclosures (public_id, type, length, name, r2_key)
       VALUES (?, ?, ?, ?, ?)`,
    )
      .bind(
        enclosurePublicId,
        att.mimeType || "application/octet-stream",
        typeof att.content === "string"
          ? new TextEncoder().encode(att.content).byteLength
          : att.content.byteLength,
        filename,
        r2Key,
      )
      .run();
    const enclosure = await env.DB.prepare(
      "SELECT id FROM feed_enclosures WHERE public_id = ?",
    )
      .bind(enclosurePublicId)
      .first();
    if (enclosure) {
      await env.DB.prepare(
        "INSERT INTO feed_entry_enclosure_links (entry_id, enclosure_id) VALUES (?, ?)",
      )
        .bind(entryId, getNum(enclosure as Record<string, unknown>, "id"))
        .run();
    }
  }

  const senderDomain = author.split("@")[1];
  if (senderDomain) {
    await env.DB.prepare("UPDATE feeds SET email_icon = ? WHERE id = ?")
      .bind(`https://${senderDomain}/favicon.ico`, feedId)
      .run();
  }
}
