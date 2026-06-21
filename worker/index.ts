import { Hono } from "hono";
import PostalMime from "postal-mime";

const RATE_LIMIT = 10;
const MAX_ENTRIES = 50;
const PUBLIC_ID_LENGTH = 20;
const PUBLIC_ID_CHARS = "abcdefghijklmnopqrstuvwxyz0123456789";

function generatePublicId(): string {
  const bytes = new Uint8Array(PUBLIC_ID_LENGTH);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => PUBLIC_ID_CHARS[b % PUBLIC_ID_CHARS.length]).join("");
}

function escapeXml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function textToHtml(text: string): string {
  return `<pre>${escapeXml(text)}</pre>`;
}

function getStr(o: Record<string, unknown>, key: string): string {
  const v = o[key];
  return v == null ? "" : String(v);
}

function getNum(o: Record<string, unknown>, key: string): number {
  const v = o[key];
  return v == null ? 0 : Number(v);
}

function generateFeedXml(
  feed: Record<string, unknown>,
  entries: Record<string, unknown>[],
  enclosuresByEntry: Map<number, Record<string, unknown>[]>,
  hostname: string,
): string {
  const icon = getStr(feed, "icon") || getStr(feed, "email_icon");
  const updated = entries.length > 0 ? getStr(entries[0], "created_at") : getStr(feed, "created_at");

  let xml = `<?xml version="1.0" encoding="utf-8"?>\n`;
  xml += `<feed xmlns="http://www.w3.org/2005/Atom">\n`;
  xml += `  <id>urn:slownewsfast:${escapeXml(getStr(feed, "public_id"))}</id>\n`;
  xml += `  <link rel="self" href="https://${hostname}/feeds/${escapeXml(getStr(feed, "public_id"))}.xml"/>\n`;
  if (icon) {
    xml += `  <icon>${escapeXml(icon)}</icon>\n`;
  }
  xml += `  <updated>${escapeXml(updated)}</updated>\n`;
  xml += `  <title>${escapeXml(getStr(feed, "title"))}</title>\n`;

  for (const entry of entries) {
    const entryEnclosures = enclosuresByEntry.get(getNum(entry, "id")) || [];
    xml += `  <entry>\n`;
    xml += `    <id>urn:slownewsfast:${escapeXml(getStr(entry, "public_id"))}</id>\n`;
    xml += `    <link rel="alternate" type="text/html" href="https://${hostname}/feeds/${escapeXml(getStr(feed, "public_id"))}/entries/${escapeXml(getStr(entry, "public_id"))}.html"/>\n`;

    for (const enc of entryEnclosures) {
      xml += `    <link rel="enclosure" type="${escapeXml(getStr(enc, "type"))}" length="${getNum(enc, "length")}" href="https://${hostname}/files/${escapeXml(getStr(enc, "public_id"))}/${encodeURIComponent(getStr(enc, "name"))}"/>\n`;
    }

    xml += `    <published>${escapeXml(getStr(entry, "created_at"))}</published>\n`;
    xml += `    <updated>${escapeXml(getStr(entry, "created_at"))}</updated>\n`;
    xml += `    <author>\n`;
    xml += `      <name>${escapeXml(getStr(entry, "author") || "Unknown")}</name>\n`;
    if (getStr(entry, "author").includes("@")) {
      xml += `      <email>${escapeXml(getStr(entry, "author"))}</email>\n`;
    }
    xml += `    </author>\n`;
    xml += `    <title>${escapeXml(getStr(entry, "title"))}</title>\n`;
    xml += `    <content type="html"><![CDATA[${entry["content"] || ""}]]></content>\n`;
    xml += `  </entry>\n`;
  }

  xml += `</feed>\n`;
  return xml;
}

async function sanitizeContent(html: string): Promise<string> {
  const stripped = html
    .replace(/background(-color)?\s*:\s*[^;"]+/gi, "")
    .replace(/(min-)?width\s*:\s*[^;"]+/gi, "");
  return new HTMLRewriter()
    .on("script, style", {
      element(e) {
        e.remove();
      },
    })
    .on("*", {
      element(e) {
        e.removeAttribute("width");
        for (const [name] of e.attributes) {
          if (/^on\w+/.test(name)) e.removeAttribute(name);
        }
      },
    })
    .transform(new Response(stripped))
    .text();
}

async function generateEntryHtml(entry: Record<string, unknown>, hostname: string): Promise<string> {
  const content = await sanitizeContent(getStr(entry, "content"));
  const feedTitle = escapeXml(getStr(entry, "feed_title"));
  const feedPublicId = escapeXml(getStr(entry, "feed_public_id"));
  const title = escapeXml(getStr(entry, "title"));
  const author = escapeXml(getStr(entry, "author") || "Unknown");
  const date = escapeXml(getStr(entry, "created_at"));

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${title} — ${feedTitle}</title>
  <style>
    * { box-sizing: border-box; }
    body {
      font-family: Georgia, "Times New Roman", serif;
      color: #1c1917;
      background: #fafaf9;
      margin: 0;
      padding: 0;
    }
    .container {
      max-width: 720px;
      margin: 0 auto;
      padding: 2rem 0;
      overflow-wrap: break-word;
      word-break: break-word;
      overflow-x: hidden;
    }
    .container * {
      max-width: 100% !important;
      min-width: 0 !important;
      box-sizing: border-box;
    }
    .container table {
      width: auto !important;
    }
    .container img,
    .container video {
      height: auto !important;
    }
    header {
      border-bottom: 2px solid #d6d3d1;
      padding: 0 1.5rem 1.5rem;
      margin-bottom: 2rem;
    }
    footer {
      border-top: 2px solid #d6d3d1;
      padding: 1.5rem 1.5rem 0;
      margin-top: 2rem;
    }
    @media (max-width: 480px) {
      header {
        padding: 0 0.75rem 1.5rem;
      }
      footer {
        padding: 1.5rem 0.75rem 0;
      }
    }
      margin-top: 2rem;
      font-size: 0.875rem;
      color: #78716c;
    }
    footer a {
      color: #57534e;
      text-underline-offset: 2px;
    }
    footer a:hover { color: #1c1917; }
    footer span { margin: 0 0.5rem; color: #d6d3d1; }
  </style>
</head>
<body>
  <div class="container">
    <header>
      <p class="feed-name">${feedTitle}</p>
      <h1>${title}</h1>
      <p class="byline">By <strong>${author}</strong> on ${date}</p>
    </header>
    ${content}
    <footer>
      <a href="https://${hostname}/feeds/${feedPublicId}.xml">Atom feed</a>
      <span>·</span>
      <a href="https://${hostname}/feeds/${feedPublicId}">Feed settings</a>
    </footer>
  </div>
</body>
</html>`;
}

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

const SESSION_DURATION = 30 * 24 * 60 * 60 * 1000;

async function signSession(secret: string): Promise<string> {
  const expires = Date.now() + SESSION_DURATION;
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(String(expires)),
  );
  const sigHex = Array.from(new Uint8Array(sig), (b) =>
    b.toString(16).padStart(2, "0"),
  ).join("");
  return `${expires}:${sigHex}`;
}

async function verifySession(
  cookie: string | undefined,
  secret: string,
): Promise<boolean> {
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
  const sig = new Uint8Array(
    sigHex.match(/.{1,2}/g)?.map((b) => parseInt(b, 16)) || [],
  );
  return crypto.subtle.verify(
    "HMAC",
    key,
    sig,
    new TextEncoder().encode(expiresStr),
  );
}

async function requireAuth(c: any, next: any) {
  const password = c.env.PASSWORD;
  if (!password) {
    return c.json({ error: "Server not configured" }, 500);
  }
  const cookie = c.req.header("cookie") || "";
  const match = cookie.match(/(?:^|;\s*)session=([^;]+)/);
  const valid = await verifySession(match?.[1], password);
  if (!valid) {
    return c.json({ error: "Unauthorized" }, 401);
  }
  await next();
}

const app = new Hono<{ Bindings: Env }>();

app.post("/api/login", async (c) => {
  const body = await c.req.json();
  const password = c.env.PASSWORD;
  if (!password) {
    return c.json({ error: "Server not configured" }, 500);
  }
  if (body.password !== password) {
    return c.json({ error: "Invalid password" }, 401);
  }
  const token = await signSession(password);
  return new Response(JSON.stringify({ success: true }), {
    headers: {
      "Content-Type": "application/json",
      "Set-Cookie": `session=${token}; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=${SESSION_DURATION / 1000}`,
    },
  });
});

app.post("/api/logout", async (_c) => {
  return new Response(JSON.stringify({ success: true }), {
    headers: {
      "Content-Type": "application/json",
      "Set-Cookie":
        "session=; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=0",
    },
  });
});

app.get("/api/auth-check", async (c) => {
  const password = c.env.PASSWORD;
  if (!password) {
    return c.json({ authenticated: false, error: "Server not configured" }, 500);
  }
  const cookie = c.req.header("cookie") || "";
  const match = cookie.match(/(?:^|;\s*)session=([^;]+)/);
  const valid = await verifySession(match?.[1], password);
  return c.json({ authenticated: valid });
});

app.post("/api/feeds", requireAuth, async (c) => {
  const body = await c.req.json();
  const title = body.title;

  if (!title || typeof title !== "string" || title.trim().length === 0) {
    return c.json({ error: "Title is required" }, 400);
  }

  const publicId = generatePublicId();
  await c.env.DB.prepare("INSERT INTO feeds (public_id, title) VALUES (?, ?)")
    .bind(publicId, title.trim())
    .run();

  const hostname = c.env.DOMAIN;
  return c.json(
    {
      publicId,
      email: `${publicId}@${hostname}`,
      feedUrl: `https://${hostname}/feeds/${publicId}.xml`,
      title: title.trim(),
    },
    201,
  );
});

app.get("/api/feeds", requireAuth, async (c) => {
  const feeds = await c.env.DB.prepare(
    "SELECT public_id, title, icon, email_icon, created_at FROM feeds ORDER BY created_at DESC",
  ).all();

  const hostname = c.env.DOMAIN;
  const result = feeds.results.map((feed) => {
    const f = feed as Record<string, unknown>;
    return {
      publicId: f["public_id"],
      title: f["title"],
      icon: f["icon"],
      emailIcon: f["email_icon"],
      email: `${f["public_id"]}@${hostname}`,
      feedUrl: `https://${hostname}/feeds/${f["public_id"]}.xml`,
      createdAt: f["created_at"],
    };
  });

  return c.json(result);
});

app.get("/api/entries", requireAuth, async (c) => {
  const entries = await c.env.DB.prepare(
    `SELECT fe.public_id, fe.title, fe.author, fe.created_at, fe.read,
            f.public_id as feed_public_id, f.title as feed_title,
            f.icon, f.email_icon
     FROM feed_entries fe
     INNER JOIN feeds f ON fe.feed_id = f.id
     ORDER BY fe.id DESC`,
  ).all();

  const result = entries.results.map((e) => {
    const r = e as Record<string, unknown>;
    return {
      publicId: r["public_id"],
      title: r["title"],
      author: r["author"],
      createdAt: r["created_at"],
      read: getNum(r, "read") === 1,
      feedPublicId: r["feed_public_id"],
      feedTitle: r["feed_title"],
      icon: r["icon"],
      emailIcon: r["email_icon"],
    };
  });

  return c.json(result);
});

app.get("/api/feeds/:publicId", requireAuth, async (c) => {
  const publicId = c.req.param("publicId");
  const feed = await c.env.DB.prepare("SELECT * FROM feeds WHERE public_id = ?")
    .bind(publicId)
    .first();

  if (!feed) return c.json({ error: "Feed not found" }, 404);

  const f = feed as Record<string, unknown>;
  const hostname = c.env.DOMAIN;
  return c.json({
    publicId: f["public_id"],
    title: f["title"],
    icon: f["icon"],
    emailIcon: f["email_icon"],
    email: `${f["public_id"]}@${hostname}`,
    feedUrl: `https://${hostname}/feeds/${f["public_id"]}.xml`,
    createdAt: f["created_at"],
  });
});

app.get("/api/feeds/:publicId/entries", requireAuth, async (c) => {
  const publicId = c.req.param("publicId");
  const feed = await c.env.DB.prepare("SELECT id FROM feeds WHERE public_id = ?")
    .bind(publicId)
    .first();

  if (!feed) return c.json({ error: "Feed not found" }, 404);

  const feedId = getNum(feed as Record<string, unknown>, "id");
  const entries = await c.env.DB.prepare(
    "SELECT public_id, title, author, created_at, read FROM feed_entries WHERE feed_id = ? ORDER BY id DESC",
  ).bind(feedId).all();

  const result = entries.results.map((e) => {
    const r = e as Record<string, unknown>;
    return {
      publicId: r["public_id"],
      title: r["title"],
      author: r["author"],
      createdAt: r["created_at"],
      read: getNum(r, "read") === 1,
    };
  });

  return c.json(result);
});

app.patch("/api/entries/:publicId/read", requireAuth, async (c) => {
  const publicId = c.req.param("publicId");
  const body = await c.req.json();

  await c.env.DB.prepare(
    "UPDATE feed_entries SET read = ? WHERE public_id = ?",
  ).bind(body.read ? 1 : 0, publicId).run();

  return c.json({ success: true });
});

app.patch("/api/feeds/:publicId", requireAuth, async (c) => {
  const publicId = c.req.param("publicId");
  const body = await c.req.json();

  const feed = await c.env.DB.prepare("SELECT * FROM feeds WHERE public_id = ?")
    .bind(publicId)
    .first();

  if (!feed) return c.json({ error: "Feed not found" }, 404);

  const updates: string[] = [];
  const params: unknown[] = [];

  if (body.title !== undefined) {
    if (typeof body.title !== "string" || body.title.trim().length === 0) {
      return c.json({ error: "Title cannot be empty" }, 400);
    }
    updates.push("title = ?");
    params.push(body.title.trim());
  }

  if (body.icon !== undefined) {
    if (body.icon === null || body.icon === "") {
      updates.push("icon = NULL");
    } else {
      try {
        new URL(body.icon);
        updates.push("icon = ?");
        params.push(body.icon);
      } catch {
        return c.json({ error: "Icon must be a valid URL" }, 400);
      }
    }
  }

  if (updates.length === 0) {
    return c.json({ error: "No valid fields to update" }, 400);
  }

  params.push(publicId);
  await c.env.DB.prepare(
    `UPDATE feeds SET ${updates.join(", ")} WHERE public_id = ?`,
  ).bind(...params).run();

  return c.json({ success: true });
});

app.delete("/api/feeds/:publicId", requireAuth, async (c) => {
  const publicId = c.req.param("publicId");
  const body = await c.req.json();
  const confirmation = body.confirmation;

  const feed = await c.env.DB.prepare("SELECT * FROM feeds WHERE public_id = ?")
    .bind(publicId)
    .first();

  if (!feed) return c.json({ error: "Feed not found" }, 404);

  const f = feed as Record<string, unknown>;

  if (confirmation !== f["title"]) {
    return c.json({ error: "Confirmation must match feed title" }, 400);
  }

  const feedId = getNum(f, "id");

  const enclosures = await c.env.DB.prepare(
    `SELECT fe.public_id, fe.r2_key FROM feed_enclosures fe
     INNER JOIN feed_entry_enclosure_links feel ON fe.id = feel.enclosure_id
     INNER JOIN feed_entries fent ON feel.entry_id = fent.id
     WHERE fent.feed_id = ?`,
  ).bind(feedId).all();

  for (const enc of enclosures.results) {
    const r = enc as Record<string, unknown>;
    if (r["r2_key"]) {
      await c.env.ATTACHMENTS.delete(r["r2_key"] as string);
    }
  }

  await c.env.DB.prepare("DELETE FROM feeds WHERE id = ?").bind(feedId).run();

  return c.json({ success: true });
});

app.get("/feeds/:publicId", async (c) => {
  const path = c.req.path;
  if (!path.endsWith(".xml")) {
    return c.env.ASSETS.fetch(c.req.raw);
  }
  const raw = c.req.param("publicId") || "";
  const publicId = raw.endsWith(".xml") ? raw.slice(0, -4) : raw;
  const db = c.env.DB;

  const feed = await db.prepare("SELECT * FROM feeds WHERE public_id = ?").bind(publicId).first();
  if (!feed) return c.notFound();

  const f = feed as Record<string, unknown>;
  const feedId = getNum(f, "id");

  const now = new Date();
  await db.prepare(
    "INSERT INTO feed_visualizations (feed_id, created_at) VALUES (?, ?)",
  ).bind(feedId, now.toISOString()).run();

  const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000).toISOString();
  const vizCount = await db.prepare(
    "SELECT COUNT(*) as count FROM feed_visualizations WHERE feed_id = ? AND created_at > ?",
  ).bind(feedId, oneHourAgo).first();

  if (vizCount) {
    const vc = vizCount as Record<string, unknown>;
    if (getNum(vc, "count") > RATE_LIMIT) {
      return c.text("Too many requests. Try again later.", 429);
    }
  }

  const entries = await db.prepare(
    "SELECT * FROM feed_entries WHERE feed_id = ? ORDER BY id DESC",
  ).bind(feedId).all();

  const entryIds: number[] = [];
  for (const e of entries.results) {
    entryIds.push(getNum(e as Record<string, unknown>, "id"));
  }

  const enclosuresByEntry = new Map<number, Record<string, unknown>[]>();

  if (entryIds.length > 0) {
    const placeholders = entryIds.map(() => "?").join(",");
    const links = await db.prepare(
      `SELECT feel.entry_id, fe.public_id, fe.type, fe.length, fe.name
       FROM feed_entry_enclosure_links feel
       INNER JOIN feed_enclosures fe ON feel.enclosure_id = fe.id
       WHERE feel.entry_id IN (${placeholders})`,
    ).bind(...entryIds).all();

    for (const link of links.results) {
      const l = link as Record<string, unknown>;
      const entryId = getNum(l, "entry_id");
      if (!enclosuresByEntry.has(entryId)) {
        enclosuresByEntry.set(entryId, []);
      }
      enclosuresByEntry.get(entryId)!.push(l);
    }
  }

  const hostname = c.env.DOMAIN;
  const xml = generateFeedXml(
    f,
    entries.results as Record<string, unknown>[],
    enclosuresByEntry,
    hostname,
  );

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
    `SELECT fe.*, f.title as feed_title, f.public_id as feed_public_id
     FROM feed_entries fe
     INNER JOIN feeds f ON fe.feed_id = f.id
     WHERE fe.public_id = ? AND f.public_id = ?`,
  ).bind(entryId, publicId).first();

  if (!entry) return c.notFound();

  const hostname = c.env.DOMAIN;
  const html = await generateEntryHtml(entry as Record<string, unknown>, hostname);

  return new Response(html, {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Content-Security-Policy":
        "default-src 'none'; img-src * data:; style-src 'unsafe-inline';",
    },
  });
});

app.get("/files/:enclosureId/:filename", async (c) => {
  const { enclosureId, filename } = c.req.param();

  const enclosure = await c.env.DB.prepare(
    "SELECT * FROM feed_enclosures WHERE public_id = ? AND name = ?",
  ).bind(enclosureId, filename).first();

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

app.notFound((c) => {
  return c.env.ASSETS.fetch(c.req.raw);
});

export default {
  async email(
    message: ForwardableEmailMessage,
    env: Env,
    ctx: ExecutionContext,
  ): Promise<void> {
    const recipient = message.to;
    const atIndex = recipient.lastIndexOf("@");
    if (atIndex === -1) {
      message.setReject("Invalid recipient address");
      return;
    }

    const publicId = recipient.slice(0, atIndex).toLowerCase();

    const feed = await env.DB.prepare(
      "SELECT * FROM feeds WHERE public_id = ?",
    ).bind(publicId).first();

    if (!feed) {
      message.setReject("Unknown feed address");
      return;
    }

    const f = feed as Record<string, unknown>;
    const feedId = getNum(f, "id");

    const raw = await new Response(message.raw).arrayBuffer();
    const parsed = await PostalMime.parse(raw);

    const subject = parsed.subject || "(no subject)";
    const author = parsed.from?.address || message.from;
    const htmlContent = parsed.html || (parsed.text ? textToHtml(parsed.text) : "No content.");

    ctx.waitUntil(
      (async () => {
        const entryPublicId = generatePublicId();

        await env.DB.prepare(
          `INSERT INTO feed_entries (public_id, feed_id, author, title, content)
           VALUES (?, ?, ?, ?, ?)`,
        ).bind(entryPublicId, feedId, author, subject, htmlContent).run();

        const entry = await env.DB.prepare(
          "SELECT id FROM feed_entries WHERE public_id = ?",
        ).bind(entryPublicId).first();

        if (!entry) return;
        const entryId = getNum(entry as Record<string, unknown>, "id");

        if (parsed.attachments && parsed.attachments.length > 0) {
          for (const att of parsed.attachments) {
            const enclosurePublicId = generatePublicId();
            const r2Key =
              `enclosures/${enclosurePublicId}/${att.filename}`;

            await env.ATTACHMENTS.put(r2Key, att.content, {
              httpMetadata: {
                contentType: att.mimeType || "application/octet-stream",
              },
            });

            await env.DB.prepare(
              `INSERT INTO feed_enclosures (public_id, type, length, name, r2_key)
               VALUES (?, ?, ?, ?, ?)`,
            ).bind(
              enclosurePublicId,
              att.mimeType || "application/octet-stream",
              typeof att.content === "string"
                ? new TextEncoder().encode(att.content).byteLength
                : att.content.byteLength,
              att.filename,
              r2Key,
            ).run();

            const enclosure = await env.DB.prepare(
              "SELECT id FROM feed_enclosures WHERE public_id = ?",
            ).bind(enclosurePublicId).first();

            if (enclosure) {
              await env.DB.prepare(
                "INSERT INTO feed_entry_enclosure_links (entry_id, enclosure_id) VALUES (?, ?)",
              ).bind(entryId, getNum(enclosure as Record<string, unknown>, "id")).run();
            }
          }
        }

        const senderDomain = author.split("@")[1];
        if (senderDomain) {
          const emailIcon = `https://${senderDomain}/favicon.ico`;
          await env.DB.prepare(
            "UPDATE feeds SET email_icon = ? WHERE id = ?",
          ).bind(emailIcon, feedId).run();
        }
      })(),
    );
  },

  async fetch(
    request: Request,
    env: Env,
    ctx: ExecutionContext,
  ): Promise<Response> {
    return app.fetch(request, env, ctx);
  },

  async scheduled(
    _event: ScheduledEvent,
    env: Env,
    ctx: ExecutionContext,
  ): Promise<void> {
    ctx.waitUntil(
      (async () => {
        const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
        await env.DB.prepare(
          "DELETE FROM feed_visualizations WHERE created_at < ?",
        ).bind(oneHourAgo).run();

        const orphaned = await env.DB.prepare(
          `SELECT fe.id, fe.r2_key FROM feed_enclosures fe
           WHERE NOT EXISTS (
             SELECT 1 FROM feed_entry_enclosure_links feel
             WHERE feel.enclosure_id = fe.id
           )`,
        ).all();

        for (const enc of orphaned.results) {
          const r = enc as Record<string, unknown>;
          if (r["r2_key"]) {
            await env.ATTACHMENTS.delete(r["r2_key"] as string);
          }
          await env.DB.prepare("DELETE FROM feed_enclosures WHERE id = ?")
            .bind(getNum(r, "id")).run();
        }

        const feeds = await env.DB.prepare("SELECT id FROM feeds").all();
        for (const feed of feeds.results) {
          await trimFeedEntries(
            env.DB,
            getNum(feed as Record<string, unknown>, "id"),
          );
        }
      })(),
    );
  },
};