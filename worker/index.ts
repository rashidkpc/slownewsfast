import { Hono } from "hono";
import PostalMime from "postal-mime";
import {
  ACCEPT,
  DEFAULT_CRON,
  DEFAULT_POLL_INTERVAL_MINUTES,
  DEFAULT_TITLE_TEMPLATE,
  DEFAULT_TZ,
  ENTRY_FEED_LIMIT,
  MAX_ENTRIES,
  POLL_BATCH,
  RATE_LIMIT,
  SESSION_DURATION,
  type DigestConfig,
  type DigestState,
  escapeXml,
  generatePublicId,
  getNum,
  getStr,
  hostnameOf,
  isValidSchedule,
  nextCronRun,
  parseJson,
} from "./util";
import { generateEntryHtml, generateFeedXml, type EnclosureRow } from "./render";
import {
  PRODUCERS,
  type ProducerRow,
  deliverEmail,
  feedDisplayTitle,
  producerConfig,
  producerState,
  updateProducer,
} from "./producers";

// ---------------------------------------------------------------------------
// Auth (HMAC session cookie)
// ---------------------------------------------------------------------------

async function signSession(secret: string): Promise<string> {
  const expires = Date.now() + SESSION_DURATION;
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(String(expires)));
  const sigHex = Array.from(new Uint8Array(sig), (b) => b.toString(16).padStart(2, "0")).join("");
  return `${expires}:${sigHex}`;
}

async function verifySession(cookie: string | undefined, secret: string): Promise<boolean> {
  if (!cookie) return false;
  const parts = cookie.split(":");
  if (parts.length !== 2) return false;
  const [expiresStr, sigHex] = parts;
  const expires = Number(expiresStr);
  if (isNaN(expires) || Date.now() > expires) return false;
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["verify"],
  );
  const sig = new Uint8Array(sigHex.match(/.{1,2}/g)?.map((b) => parseInt(b, 16)) || []);
  return crypto.subtle.verify("HMAC", key, sig, new TextEncoder().encode(expiresStr));
}

async function isAuthed(c: any): Promise<boolean> {
  const cookie = c.req.header("cookie") || "";
  const match = cookie.match(/(?:^|;\s*)session=([^;]+)/);
  return verifySession(match?.[1], c.env.PASSWORD);
}

async function requireAuth(c: any, next: any) {
  if (!c.env.PASSWORD) return c.json({ error: "Server not configured" }, 500);
  if (!(await isAuthed(c))) return c.json({ error: "Unauthorized" }, 401);
  await next();
}

// ---------------------------------------------------------------------------
// Serialization
// ---------------------------------------------------------------------------

async function loadProducer(db: D1Database, feedId: number): Promise<ProducerRow | null> {
  const row = await db
    .prepare("SELECT * FROM feed_producers WHERE feed_id = ? LIMIT 1")
    .bind(feedId)
    .first();
  return (row as ProducerRow) ?? null;
}

function feedToJson(
  feed: Record<string, unknown>,
  producer: ProducerRow | null,
  hostname: string,
  extra: Record<string, unknown> = {},
): Record<string, unknown> {
  const kind = producer ? getStr(producer, "kind") : "email";
  const config: Partial<DigestConfig> = producer ? producerConfig(producer) : {};
  const state: DigestState = producer ? producerState(producer) : {};
  const pid = getStr(feed, "public_id");
  const icon = getStr(feed, "icon") || getStr(feed, "source_icon") || getStr(feed, "email_icon");

  return {
    publicId: pid,
    kind,
    title: feedDisplayTitle(feed),
    sourceTitle: getStr(feed, "source_title"),
    description: getStr(feed, "description"),
    link: getStr(feed, "link"),
    icon: icon || null,
    emailIcon: getStr(feed, "email_icon") || null,
    email: kind === "email" ? `${pid}@${hostname}` : null,
    feedUrl: `https://${hostname}/feeds/${pid}.xml`,
    sourceUrl: config.sourceUrl || "",
    scheduleCron: config.cron || DEFAULT_CRON,
    scheduleTz: config.tz || DEFAULT_TZ,
    titleTemplate: config.titleTemplate || DEFAULT_TITLE_TEMPLATE,
    includeContent: config.includeContent !== false,
    ingestImages: config.ingestImages !== false,
    pollIntervalMinutes: config.pollIntervalMinutes || DEFAULT_POLL_INTERVAL_MINUTES,
    initialSync: config.initialSync || "backfill",
    nextDigestAt: state.nextDigestAt || null,
    lastPolled: state.lastPolled || null,
    error: producer ? getStr(producer, "error") : "",
    createdAt: getStr(feed, "created_at"),
    ...extra,
  };
}

// ---------------------------------------------------------------------------
// Hono app
// ---------------------------------------------------------------------------

const app = new Hono<{ Bindings: Env }>();

app.post("/api/login", async (c) => {
  const body = await c.req.json();
  const password = c.env.PASSWORD;
  if (!password) return c.json({ error: "Server not configured" }, 500);
  if (body.password !== password) return c.json({ error: "Invalid password" }, 401);
  const token = await signSession(password);
  return new Response(JSON.stringify({ success: true }), {
    headers: {
      "Content-Type": "application/json",
      "Set-Cookie": `session=${token}; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=${SESSION_DURATION / 1000}`,
    },
  });
});

app.post("/api/logout", async () => {
  return new Response(JSON.stringify({ success: true }), {
    headers: {
      "Content-Type": "application/json",
      "Set-Cookie": "session=; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=0",
    },
  });
});

app.get("/api/auth-check", async (c) => {
  if (!c.env.PASSWORD) return c.json({ authenticated: false, error: "Server not configured" }, 500);
  return c.json({ authenticated: await isAuthed(c) });
});

app.get("/api/presets", async (c) => {
  return c.json({
    presets: [
      { label: "Daily at midnight", cron: "0 0 * * *" },
      { label: "Daily at 6:00", cron: "0 6 * * *" },
      { label: "Daily at 8:00", cron: "0 8 * * *" },
      { label: "Twice daily (midnight & noon)", cron: "0 0,12 * * *" },
      { label: "Weekly (Sunday midnight)", cron: "0 0 * * 0" },
    ],
    timezones: [
      "UTC", "America/Los_Angeles", "America/Denver", "America/Chicago",
      "America/New_York", "Europe/London", "Europe/Berlin", "Europe/Paris",
      "Asia/Tokyo", "Australia/Sydney",
    ],
  });
});

app.post("/api/feeds", requireAuth, async (c) => {
  const body = await c.req.json();
  const kind = body.kind === "digest" ? "feed_digest" : "email";
  const hostname = c.env.DOMAIN;

  if (kind === "email") {
    const title = String(body.title || "").trim();
    if (!title) return c.json({ error: "Title is required" }, 400);

    const publicId = generatePublicId();
    const ins = await c.env.DB.prepare("INSERT INTO feeds (public_id, title) VALUES (?, ?)")
      .bind(publicId, title)
      .run();
    const feedId = Number(ins.meta.last_row_id);
    await c.env.DB.prepare("INSERT INTO feed_producers (feed_id, kind) VALUES (?, 'email')")
      .bind(feedId)
      .run();

    const feed = await c.env.DB.prepare("SELECT * FROM feeds WHERE id = ?").bind(feedId).first();
    const producer = await loadProducer(c.env.DB, feedId);
    return c.json(
      feedToJson(feed as Record<string, unknown>, producer, hostname),
      201,
    );
  }

  // Digest feed
  const sourceUrl = String(body.sourceUrl || "").trim();
  if (!sourceUrl) return c.json({ error: "Source feed URL is required" }, 400);
  try {
    const u = new URL(sourceUrl);
    if (u.protocol !== "http:" && u.protocol !== "https:") throw new Error("bad protocol");
  } catch {
    return c.json({ error: "Source feed URL must be a valid http(s) URL" }, 400);
  }

  const titleInput = String(body.title || "").trim();
  const cron = String(body.scheduleCron || DEFAULT_CRON).trim() || DEFAULT_CRON;
  const tz = String(body.scheduleTz || DEFAULT_TZ).trim() || DEFAULT_TZ;
  if (!isValidSchedule(cron, tz)) return c.json({ error: "Invalid schedule" }, 400);

  const now = new Date().toISOString();
  const initialSync = body.initialSync === "from_now" ? "from_now" : "backfill";
  const config: DigestConfig = {
    sourceUrl,
    cron,
    tz,
    titleTemplate: String(body.titleTemplate || DEFAULT_TITLE_TEMPLATE).trim() || DEFAULT_TITLE_TEMPLATE,
    includeContent: body.includeContent !== false,
    initialSync,
    pollIntervalMinutes: Math.max(5, Number(body.pollIntervalMinutes) || DEFAULT_POLL_INTERVAL_MINUTES),
    ingestImages: body.ingestImages !== false,
    eligibleFrom: initialSync === "from_now" ? now : null,
    titleCustom: titleInput.length > 0,
  };

  const publicId = generatePublicId();
  const placeholderTitle = titleInput || hostnameOf(sourceUrl) || "Digest";
  const ins = await c.env.DB.prepare("INSERT INTO feeds (public_id, title) VALUES (?, ?)")
    .bind(publicId, placeholderTitle)
    .run();
  const feedId = Number(ins.meta.last_row_id);
  await c.env.DB.prepare(
    "INSERT INTO feed_producers (feed_id, kind, config, state) VALUES (?, 'feed_digest', ?, '{}')",
  )
    .bind(feedId, JSON.stringify(config))
    .run();

  let producer = (await loadProducer(c.env.DB, feedId))!;
  let feed = (await c.env.DB.prepare("SELECT * FROM feeds WHERE id = ?").bind(feedId).first()) as Record<string, unknown>;

  await PRODUCERS.feed_digest.poll?.(c.env, feed, producer);

  if (initialSync === "backfill") {
    await PRODUCERS.feed_digest.publish?.(c.env, feed, producer, now);
  }

  // Re-read after polling so we keep the etag/lastPolled the poll wrote.
  producer = (await loadProducer(c.env.DB, feedId))!;
  feed = (await c.env.DB.prepare("SELECT * FROM feeds WHERE id = ?").bind(feedId).first()) as Record<string, unknown>;
  const next = nextCronRun(config.cron, config.tz);
  const state: DigestState = { ...producerState(producer), nextDigestAt: next ?? undefined, lastDigestTick: now };
  await updateProducer(c.env.DB, getNum(producer, "id"), { state, nextRunAt: next });
  producer = (await loadProducer(c.env.DB, feedId))!;

  return c.json(feedToJson(feed, producer, hostname), 201);
});

app.get("/api/feeds", requireAuth, async (c) => {
  const rows = await c.env.DB.prepare(
    `SELECT f.*, p.kind AS producer_kind, p.config AS producer_config,
            p.state AS producer_state, p.error AS producer_error,
            (SELECT COUNT(*) FROM feed_entries e WHERE e.feed_id = f.id) AS entry_count
       FROM feeds f
       LEFT JOIN feed_producers p ON p.feed_id = f.id
      ORDER BY f.created_at DESC`,
  ).all();

  const hostname = c.env.DOMAIN;
  return c.json(
    (rows.results as Record<string, unknown>[]).map((r) => {
      const producer: ProducerRow = {
        kind: r["producer_kind"],
        config: r["producer_config"],
        state: r["producer_state"],
        error: r["producer_error"],
      };
      return feedToJson(r, producer, hostname, { entryCount: getNum(r, "entry_count") });
    }),
  );
});

app.get("/api/feeds/:publicId", requireAuth, async (c) => {
  const feed = await c.env.DB.prepare("SELECT * FROM feeds WHERE public_id = ?")
    .bind(c.req.param("publicId"))
    .first();
  if (!feed) return c.json({ error: "Feed not found" }, 404);
  const f = feed as Record<string, unknown>;
  const producer = await loadProducer(c.env.DB, getNum(f, "id"));
  const count = await c.env.DB.prepare("SELECT COUNT(*) AS n FROM feed_entries WHERE feed_id = ?")
    .bind(getNum(f, "id"))
    .first();
  return c.json(
    feedToJson(f, producer, c.env.DOMAIN, {
      entryCount: getNum(count as Record<string, unknown>, "n"),
    }),
  );
});

app.patch("/api/feeds/:publicId", requireAuth, async (c) => {
  const body = await c.req.json();
  const publicId = c.req.param("publicId");
  const feed = await c.env.DB.prepare("SELECT * FROM feeds WHERE public_id = ?").bind(publicId).first();
  if (!feed) return c.json({ error: "Feed not found" }, 404);
  const f = feed as Record<string, unknown>;
  const feedId = getNum(f, "id");
  const producer = await loadProducer(c.env.DB, feedId);

  const feedUpdates: string[] = [];
  const feedParams: unknown[] = [];

  if (body.title !== undefined) {
    const title = String(body.title).trim();
    if (!title) return c.json({ error: "Title cannot be empty" }, 400);
    feedUpdates.push("title = ?");
    feedParams.push(title);
  }

  if (body.icon !== undefined) {
    const icon = body.icon == null ? "" : String(body.icon).trim();
    if (icon) {
      try {
        new URL(icon);
      } catch {
        return c.json({ error: "Icon must be a valid URL" }, 400);
      }
    }
    feedUpdates.push("icon = ?");
    feedParams.push(icon || null);
  }

  if (feedUpdates.length > 0) {
    feedParams.push(feedId);
    await c.env.DB.prepare(`UPDATE feeds SET ${feedUpdates.join(", ")} WHERE id = ?`)
      .bind(...feedParams)
      .run();
  }

  // Producer config (digest feeds only).
  if (producer && getStr(producer, "kind") === "feed_digest") {
    const config = producerConfig(producer);
    let touched = false;
    let scheduleChanged = false;

    if (body.sourceUrl !== undefined) {
      const sourceUrl = String(body.sourceUrl).trim();
      try {
        const u = new URL(sourceUrl);
        if (u.protocol !== "http:" && u.protocol !== "https:") throw new Error("bad");
      } catch {
        return c.json({ error: "Source feed URL must be a valid http(s) URL" }, 400);
      }
      config.sourceUrl = sourceUrl;
      touched = true;
    }
    if (body.scheduleCron !== undefined) {
      config.cron = String(body.scheduleCron).trim() || DEFAULT_CRON;
      touched = true;
      scheduleChanged = true;
    }
    if (body.scheduleTz !== undefined) {
      config.tz = String(body.scheduleTz).trim() || DEFAULT_TZ;
      touched = true;
      scheduleChanged = true;
    }
    if (!isValidSchedule(config.cron, config.tz)) {
      return c.json({ error: "Invalid schedule" }, 400);
    }
    if (body.titleTemplate !== undefined) {
      config.titleTemplate = String(body.titleTemplate).trim() || DEFAULT_TITLE_TEMPLATE;
      touched = true;
    }
    if (body.includeContent !== undefined) {
      config.includeContent = !!body.includeContent;
      touched = true;
    }
    if (body.ingestImages !== undefined) {
      config.ingestImages = !!body.ingestImages;
      touched = true;
    }
    if (body.pollIntervalMinutes !== undefined) {
      config.pollIntervalMinutes = Math.max(5, Number(body.pollIntervalMinutes) || DEFAULT_POLL_INTERVAL_MINUTES);
      touched = true;
    }
    if (body.title !== undefined) {
      config.titleCustom = true;
      touched = true;
    }

    if (touched) {
      const state = producerState(producer);
      let nextRunAt: string | null | undefined;
      if (scheduleChanged) {
        nextRunAt = nextCronRun(config.cron, config.tz);
        state.nextDigestAt = nextRunAt ?? undefined;
        await updateProducer(c.env.DB, getNum(producer, "id"), { config, state, nextRunAt });
      } else {
        await updateProducer(c.env.DB, getNum(producer, "id"), { config });
      }
    }
  }

  const updated = await c.env.DB.prepare("SELECT * FROM feeds WHERE id = ?").bind(feedId).first();
  const updatedProducer = await loadProducer(c.env.DB, feedId);
  return c.json(feedToJson(updated as Record<string, unknown>, updatedProducer, c.env.DOMAIN));
});

app.delete("/api/feeds/:publicId", requireAuth, async (c) => {
  const publicId = c.req.param("publicId");
  const body = await c.req.json().catch(() => ({}));
  const feed = await c.env.DB.prepare("SELECT * FROM feeds WHERE public_id = ?").bind(publicId).first();
  if (!feed) return c.json({ error: "Feed not found" }, 404);
  const f = feed as Record<string, unknown>;
  if (body.confirmation !== getStr(f, "title")) {
    return c.json({ error: "Confirmation must match feed title" }, 400);
  }
  const feedId = getNum(f, "id");

  // Capture the attachments this feed references, then remove the feed. An
  // enclosure may be shared with another feed (ingested images are deduped by
  // source URL), so only delete the ones nothing references any more.
  const linked = await c.env.DB.prepare(
    `SELECT DISTINCT fe.id, fe.r2_key FROM feed_enclosures fe
      INNER JOIN feed_entry_enclosure_links feel ON fe.id = feel.enclosure_id
      INNER JOIN feed_entries fent ON feel.entry_id = fent.id
      WHERE fent.feed_id = ?`,
  )
    .bind(feedId)
    .all();

  await c.env.DB.prepare("DELETE FROM feeds WHERE id = ?").bind(feedId).run();

  for (const enc of linked.results as Record<string, unknown>[]) {
    const still = await c.env.DB.prepare(
      "SELECT 1 FROM feed_entry_enclosure_links WHERE enclosure_id = ? LIMIT 1",
    )
      .bind(getNum(enc, "id"))
      .first();
    if (still) continue;
    if (enc["r2_key"]) await c.env.ATTACHMENTS.delete(enc["r2_key"] as string);
    await c.env.DB.prepare("DELETE FROM feed_enclosures WHERE id = ?").bind(getNum(enc, "id")).run();
  }

  return c.json({ success: true });
});

app.get("/api/feeds/:publicId/entries", requireAuth, async (c) => {
  const publicId = c.req.param("publicId");
  const feed = await c.env.DB.prepare("SELECT id FROM feeds WHERE public_id = ?").bind(publicId).first();
  if (!feed) return c.json({ error: "Feed not found" }, 404);
  const feedId = getNum(feed as Record<string, unknown>, "id");

  const rows = await c.env.DB.prepare(
    `SELECT e.public_id, e.title, e.author, e.created_at, e.image, e.summary,
            (SELECT COUNT(*) FROM entry_source_items esi WHERE esi.entry_id = e.id) AS item_count
       FROM feed_entries e WHERE e.feed_id = ? ORDER BY e.id DESC`,
  )
    .bind(feedId)
    .all();

  return c.json(
    (rows.results as Record<string, unknown>[]).map((r) => ({
      publicId: getStr(r, "public_id"),
      title: getStr(r, "title"),
      author: getStr(r, "author"),
      createdAt: getStr(r, "created_at"),
      image: getStr(r, "image"),
      summary: getStr(r, "summary"),
      itemCount: getNum(r, "item_count"),
    })),
  );
});

app.get("/api/feeds/:publicId/sources", requireAuth, async (c) => {
  const publicId = c.req.param("publicId");
  const feed = await c.env.DB.prepare("SELECT id FROM feeds WHERE public_id = ?").bind(publicId).first();
  if (!feed) return c.json({ error: "Feed not found" }, 404);
  const feedId = getNum(feed as Record<string, unknown>, "id");
  const producer = await loadProducer(c.env.DB, feedId);
  if (!producer) return c.json([]);

  const pending = await c.env.DB.prepare(
    `SELECT guid, title, author, url, published FROM source_items WHERE producer_id = ? ORDER BY published DESC`,
  )
    .bind(getNum(producer, "id"))
    .all();
  const digested = await c.env.DB.prepare(
    `SELECT esi.guid, esi.url, e.title AS entry_title, e.created_at
       FROM entry_source_items esi
       INNER JOIN feed_entries e ON e.id = esi.entry_id
      WHERE e.feed_id = ? ORDER BY e.id DESC LIMIT 200`,
  )
    .bind(feedId)
    .all();

  const out = [
    ...(pending.results as Record<string, unknown>[]).map((r) => ({
      guid: getStr(r, "guid"),
      title: getStr(r, "title"),
      author: getStr(r, "author"),
      url: getStr(r, "url"),
      published: getStr(r, "published"),
      digested: false,
      digestTitle: "",
    })),
    ...(digested.results as Record<string, unknown>[]).map((r) => ({
      guid: getStr(r, "guid"),
      title: "",
      author: "",
      url: getStr(r, "url"),
      published: getStr(r, "created_at"),
      digested: true,
      digestTitle: getStr(r, "entry_title"),
    })),
  ];
  return c.json(out);
});

app.post("/api/feeds/:publicId/poll", requireAuth, async (c) => {
  const feed = await c.env.DB.prepare("SELECT * FROM feeds WHERE public_id = ?")
    .bind(c.req.param("publicId"))
    .first();
  if (!feed) return c.json({ error: "Feed not found" }, 404);
  const producer = await loadProducer(c.env.DB, getNum(feed as Record<string, unknown>, "id"));
  if (!producer || !PRODUCERS[getStr(producer, "kind")]?.poll) {
    return c.json({ error: "This feed does not poll" }, 400);
  }
  await PRODUCERS[getStr(producer, "kind")].poll!(c.env, feed as Record<string, unknown>, producer);
  return c.json({ success: true });
});

app.post("/api/feeds/:publicId/digest", requireAuth, async (c) => {
  const feed = await c.env.DB.prepare("SELECT * FROM feeds WHERE public_id = ?")
    .bind(c.req.param("publicId"))
    .first();
  if (!feed) return c.json({ error: "Feed not found" }, 404);
  const f = feed as Record<string, unknown>;
  const producer = await loadProducer(c.env.DB, getNum(f, "id"));
  if (!producer || !PRODUCERS[getStr(producer, "kind")]?.publish) {
    return c.json({ error: "This feed does not produce digests" }, 400);
  }
  const now = new Date().toISOString();
  const created = await PRODUCERS[getStr(producer, "kind")].publish!(c.env, f, producer, now);
  const config = producerConfig(producer);
  const next = nextCronRun(config.cron, config.tz);
  const state: DigestState = { ...producerState(producer), nextDigestAt: next ?? undefined, lastDigestTick: now };
  await updateProducer(c.env.DB, getNum(producer, "id"), { state, lastRunAt: now, nextRunAt: next });
  return c.json({ success: true, created });
});

// ---------------------------------------------------------------------------
// Public output
// ---------------------------------------------------------------------------

app.get("/feeds/:publicId", async (c) => {
  const raw = c.req.param("publicId") || "";
  if (!raw.endsWith(".xml")) return c.env.ASSETS.fetch(c.req.raw);
  const publicId = raw.slice(0, -4);
  const db = c.env.DB;

  const feed = await db.prepare("SELECT * FROM feeds WHERE public_id = ?").bind(publicId).first();
  if (!feed) return c.notFound();
  const f = feed as Record<string, unknown>;
  const feedId = getNum(f, "id");

  const now = new Date();
  await db
    .prepare("INSERT INTO feed_visualizations (feed_id, created_at) VALUES (?, ?)")
    .bind(feedId, now.toISOString())
    .run();
  const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000).toISOString();
  const viz = await db
    .prepare("SELECT COUNT(*) as count FROM feed_visualizations WHERE feed_id = ? AND created_at > ?")
    .bind(feedId, oneHourAgo)
    .first();
  if (viz && getNum(viz as Record<string, unknown>, "count") > RATE_LIMIT) {
    return c.text("Too many requests. Try again later.", 429);
  }

  const entries = await db
    .prepare("SELECT * FROM feed_entries WHERE feed_id = ? ORDER BY id DESC LIMIT ?")
    .bind(feedId, ENTRY_FEED_LIMIT)
    .all();

  const entryIds = (entries.results as Record<string, unknown>[]).map((e) => getNum(e, "id"));
  const enclosuresByEntry = new Map<number, EnclosureRow[]>();
  if (entryIds.length > 0) {
    const placeholders = entryIds.map(() => "?").join(",");
    const links = await db
      .prepare(
        `SELECT feel.entry_id, fe.public_id, fe.type, fe.length, fe.name
           FROM feed_entry_enclosure_links feel
           INNER JOIN feed_enclosures fe ON feel.enclosure_id = fe.id
          WHERE feel.entry_id IN (${placeholders})`,
      )
      .bind(...entryIds)
      .all();
    for (const link of links.results as Record<string, unknown>[]) {
      const entryId = getNum(link, "entry_id");
      if (!enclosuresByEntry.has(entryId)) enclosuresByEntry.set(entryId, []);
      enclosuresByEntry.get(entryId)!.push({
        public_id: getStr(link, "public_id"),
        type: getStr(link, "type"),
        length: getNum(link, "length"),
        name: getStr(link, "name"),
      });
    }
  }

  const xml = generateFeedXml(f, entries.results as Record<string, unknown>[], enclosuresByEntry, c.env.DOMAIN);
  return new Response(xml, {
    headers: {
      "Content-Type": "application/atom+xml; charset=utf-8",
      "Cache-Control": "public, max-age=300",
    },
  });
});

app.get("/feeds/:publicId/entries/:entryId", async (c) => {
  const publicId = c.req.param("publicId");
  const raw = c.req.param("entryId");
  if (!raw.endsWith(".html")) return c.notFound();
  const entryId = raw.slice(0, -5);

  const entry = await c.env.DB.prepare(
    `SELECT e.*, f.title AS feed_title, f.source_title AS feed_source_title, f.public_id AS feed_public_id
       FROM feed_entries e
       INNER JOIN feeds f ON e.feed_id = f.id
      WHERE e.public_id = ? AND f.public_id = ?`,
  )
    .bind(entryId, publicId)
    .first();
  if (!entry) return c.notFound();

  const r = entry as Record<string, unknown>;
  const feed = {
    public_id: r["feed_public_id"],
    title: r["feed_title"],
    source_title: r["feed_source_title"],
  };
  const html = generateEntryHtml(r, feed, c.env.DOMAIN);
  return new Response(html, {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Content-Security-Policy": "default-src 'none'; img-src * data:; style-src 'unsafe-inline';",
    },
  });
});

app.get("/files/:enclosureId/:filename", async (c) => {
  const { enclosureId, filename } = c.req.param();
  const enclosure = await c.env.DB.prepare(
    "SELECT * FROM feed_enclosures WHERE public_id = ? AND name = ?",
  )
    .bind(enclosureId, filename)
    .first();
  if (!enclosure) return c.notFound();
  const e = enclosure as Record<string, unknown>;
  const r2Key = e["r2_key"] as string | null;
  if (!r2Key) return c.notFound();
  const object = await c.env.ATTACHMENTS.get(r2Key);
  if (!object) return c.notFound();
  return new Response(object.body, {
    headers: {
      "Content-Type": getStr(e, "type") || "application/octet-stream",
      "Content-Length": String(getNum(e, "length")),
      "Cache-Control": "public, max-age=31536000, immutable",
    },
  });
});

app.notFound((c) => c.env.ASSETS.fetch(c.req.raw));

// ---------------------------------------------------------------------------
// Scheduled maintenance + producer orchestration
// ---------------------------------------------------------------------------

async function trimFeedEntries(db: D1Database, feedId: number): Promise<void> {
  await db
    .prepare(
      `DELETE FROM feed_entries WHERE feed_id = ? AND id NOT IN (
         SELECT id FROM feed_entries WHERE feed_id = ? ORDER BY id DESC LIMIT ?
       )`,
    )
    .bind(feedId, feedId, MAX_ENTRIES)
    .run();
}

export default {
  async email(message: ForwardableEmailMessage, env: Env, ctx: ExecutionContext): Promise<void> {
    const recipient = message.to;
    const atIndex = recipient.lastIndexOf("@");
    if (atIndex === -1) {
      message.setReject("Invalid recipient address");
      return;
    }
    const publicId = recipient.slice(0, atIndex).toLowerCase();

    const feed = await env.DB.prepare("SELECT * FROM feeds WHERE public_id = ?").bind(publicId).first();
    if (!feed) {
      message.setReject("Unknown feed address");
      return;
    }
    const f = feed as Record<string, unknown>;
    const producer = await loadProducer(env.DB, getNum(f, "id"));
    if (!producer || getStr(producer, "kind") !== "email") {
      message.setReject("This address does not accept mail");
      return;
    }

    const raw = await new Response(message.raw).arrayBuffer();
    const parsed = await PostalMime.parse(raw);

    ctx.waitUntil(
      deliverEmail(
        env,
        f,
        message,
        {
          subject: parsed.subject,
          html: parsed.html || undefined,
          text: parsed.text || undefined,
          from: parsed.from,
          attachments: parsed.attachments,
        },
        (text) => `<pre>${escapeXml(text)}</pre>`,
      ),
    );
  },

  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    return app.fetch(request, env, ctx);
  },

  async scheduled(_event: ScheduledEvent, env: Env, ctx: ExecutionContext): Promise<void> {
    ctx.waitUntil(
      (async () => {
        const db = env.DB;

        const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
        await db.prepare("DELETE FROM feed_visualizations WHERE created_at < ?").bind(oneHourAgo).run();

        const orphaned = await db
          .prepare(
            `SELECT fe.id, fe.r2_key FROM feed_enclosures fe
              WHERE NOT EXISTS (
                SELECT 1 FROM feed_entry_enclosure_links feel WHERE feel.enclosure_id = fe.id
              )`,
          )
          .all();
        for (const enc of orphaned.results as Record<string, unknown>[]) {
          if (enc["r2_key"]) await env.ATTACHMENTS.delete(enc["r2_key"] as string);
          await db.prepare("DELETE FROM feed_enclosures WHERE id = ?").bind(getNum(enc, "id")).run();
        }

        const feeds = await db.prepare("SELECT * FROM feeds").all();
        const feedRows = feeds.results as Record<string, unknown>[];
        const feedById = new Map<number, Record<string, unknown>>();
        for (const f of feedRows) feedById.set(getNum(f, "id"), f);

        const producers = await db
          .prepare(
            `SELECT p.* FROM feed_producers p
              WHERE p.enabled = 1 AND p.kind = 'feed_digest'`,
          )
          .all();
        const rows = producers.results as Record<string, unknown>[];

        // Poll sources that are due, oldest first.
        const nowMs = Date.now();
        const due: Record<string, unknown>[] = [];
        for (const p of rows) {
          const intervalMs = Math.max(5, producerConfig(p).pollIntervalMinutes) * 60000;
          const lastPolled = producerState(p).lastPolled;
          if (!lastPolled || nowMs - new Date(lastPolled).getTime() >= intervalMs) {
            due.push(p);
          }
        }
        due.sort((a, b) => {
          const la = producerState(a).lastPolled || "";
          const lb = producerState(b).lastPolled || "";
          return la < lb ? -1 : la > lb ? 1 : 0;
        });
        let polled = 0;
        for (const p of due) {
          if (polled >= POLL_BATCH) break;
          const feed = feedById.get(getNum(p, "feed_id"));
          if (!feed) continue;
          try {
            await PRODUCERS.feed_digest.poll?.(env, feed, p);
          } catch (err) {
            console.error(`poll: producer ${getNum(p, "id")} failed:`, err);
          }
          polled++;
        }

        // Publish anything whose scheduled tick has passed.
        const nowIso = new Date().toISOString();
        for (const p of rows) {
          const config = producerConfig(p);
          const state = producerState(p);
          const next = state.nextDigestAt;
          if (!next) {
            const nr = nextCronRun(config.cron, config.tz);
            await updateProducer(db, getNum(p, "id"), { state: { ...state, nextDigestAt: nr ?? undefined }, nextRunAt: nr });
            continue;
          }
          if (nowIso < next) continue;
          const feed = feedById.get(getNum(p, "feed_id"));
          if (!feed) continue;
          try {
            await PRODUCERS.feed_digest.publish?.(env, feed, p, next);
          } catch (err) {
            console.error(`digest: producer ${getNum(p, "id")} failed:`, err);
          }
          const nr = nextCronRun(config.cron, config.tz);
          await updateProducer(db, getNum(p, "id"), {
            state: { ...state, lastDigestTick: next, nextDigestAt: nr ?? undefined },
            lastRunAt: nowIso,
            nextRunAt: nr,
          });
        }

        for (const f of feedRows) {
          await trimFeedEntries(db, getNum(f, "id"));
        }
      })(),
    );
  },
};
