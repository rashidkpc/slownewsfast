import { cdata, escapeXml, getNum, getStr, imageMime, sqliteToIso } from "./util";

export interface EnclosureRow {
  public_id: string;
  type: string;
  length: number;
  name: string;
}

// A generic Atom renderer: it knows nothing about how an entry was produced.
// Any entry with an `image` gets a thumbnail/enclosure; any entry with a
// `summary` gets one. New producer kinds need no changes here.
export function generateFeedXml(
  feed: Record<string, unknown>,
  entries: Record<string, unknown>[],
  enclosuresByEntry: Map<number, EnclosureRow[]>,
  hostname: string,
): string {
  const pid = getStr(feed, "public_id");
  const title = getStr(feed, "title") || getStr(feed, "source_title") || "Untitled";
  const description = getStr(feed, "description");
  const link = getStr(feed, "link");
  const icon = getStr(feed, "icon") || getStr(feed, "source_icon") || getStr(feed, "email_icon");
  const updated =
    entries.length > 0 ? sqliteToIso(getStr(entries[0], "created_at")) : sqliteToIso(getStr(feed, "created_at"));

  let xml = `<?xml version="1.0" encoding="utf-8"?>\n`;
  xml += `<feed xmlns="http://www.w3.org/2005/Atom" xmlns:media="http://search.yahoo.com/mrss/">\n`;
  xml += `  <id>urn:slownewsfast:${escapeXml(pid)}</id>\n`;
  xml += `  <link rel="self" type="application/atom+xml" href="https://${hostname}/feeds/${escapeXml(pid)}.xml"/>\n`;
  if (link) xml += `  <link rel="alternate" type="text/html" href="${escapeXml(link)}"/>\n`;
  if (icon) {
    xml += `  <icon>${escapeXml(icon)}</icon>\n`;
    xml += `  <logo>${escapeXml(icon)}</logo>\n`;
  }
  xml += `  <updated>${escapeXml(updated)}</updated>\n`;
  xml += `  <title>${escapeXml(title)}</title>\n`;
  if (description) xml += `  <subtitle>${escapeXml(description)}</subtitle>\n`;
  xml += `  <author><name>${escapeXml(title)}</name></author>\n`;

  for (const entry of entries) {
    const epid = getStr(entry, "public_id");
    const eid = getNum(entry, "id");
    const author = getStr(entry, "author");
    const published = sqliteToIso(getStr(entry, "created_at"));
    const image = getStr(entry, "image");
    const summary = getStr(entry, "summary");
    const altUrl = `https://${hostname}/feeds/${escapeXml(pid)}/entries/${escapeXml(epid)}.html`;

    xml += `  <entry>\n`;
    xml += `    <id>urn:slownewsfast:${escapeXml(epid)}</id>\n`;
    xml += `    <link rel="alternate" type="text/html" href="${altUrl}"/>\n`;

    for (const enc of enclosuresByEntry.get(eid) || []) {
      const encUrl = `https://${hostname}/files/${escapeXml(enc.public_id)}/${encodeURIComponent(enc.name)}`;
      if (encUrl === image) continue; // the thumbnail is emitted below
      xml += `    <link rel="enclosure" type="${escapeXml(enc.type)}" length="${getNum(enc as unknown as Record<string, unknown>, "length")}" href="${encUrl}"/>\n`;
    }

    xml += `    <published>${escapeXml(published)}</published>\n`;
    xml += `    <updated>${escapeXml(published)}</updated>\n`;
    xml += `    <author>\n`;
    xml += `      <name>${escapeXml(author || "Unknown")}</name>\n`;
    if (author.includes("@")) xml += `      <email>${escapeXml(author)}</email>\n`;
    xml += `    </author>\n`;
    xml += `    <title>${escapeXml(getStr(entry, "title"))}</title>\n`;
    if (summary) xml += `    <summary type="text">${escapeXml(summary)}</summary>\n`;
    if (image) {
      xml += `    <link rel="enclosure" type="${imageMime(image)}" href="${escapeXml(image)}"/>\n`;
      xml += `    <media:thumbnail url="${escapeXml(image)}"/>\n`;
    }
    xml += `    <content type="html"><![CDATA[${cdata(getStr(entry, "content"))}]]></content>\n`;
    xml += `  </entry>\n`;
  }

  xml += `</feed>\n`;
  return xml;
}

// One entry page for every producer. Digest-specific styles are included so a
// composed digest renders nicely, while newsletter HTML still works.
export function generateEntryHtml(
  entry: Record<string, unknown>,
  feed: Record<string, unknown>,
  hostname: string,
): string {
  const feedTitle = escapeXml(getStr(feed, "title") || getStr(feed, "source_title") || "Untitled");
  const feedPublicId = escapeXml(getStr(feed, "public_id"));
  const title = escapeXml(getStr(entry, "title"));
  const author = escapeXml(getStr(entry, "author"));
  const date = escapeXml(sqliteToIso(getStr(entry, "created_at")));
  const content = getStr(entry, "content");
  const byline = author ? `By <strong>${author}</strong> on ${date}` : date;

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
      padding: 2rem 1.5rem;
      overflow-wrap: break-word;
      word-break: break-word;
      overflow-x: hidden;
    }
    .container * { max-width: 100% !important; min-width: 0 !important; box-sizing: border-box; }
    .container table { width: auto !important; }
    .container img, .container video { height: auto !important; }
    header { border-bottom: 2px solid #d6d3d1; padding-bottom: 1.5rem; margin-bottom: 2rem; }
    .feed-name { font-size: 0.8rem; text-transform: uppercase; letter-spacing: 0.08em; color: #78716c; margin: 0 0 0.5rem; }
    h1 { font-size: 1.6rem; line-height: 1.2; margin: 0 0 0.5rem; }
    .byline { font-size: 0.85rem; color: #78716c; margin: 0; }
    .digest-item { border-top: 2px solid #e7e5e4; padding-top: 1.5rem; margin-top: 2rem; }
    .digest-item:first-of-type { border-top: none; margin-top: 0; padding-top: 0; }
    .digest-photo { display: block; margin: 0 0 1rem; }
    .digest-photo img { width: 100%; height: auto; display: block; }
    .digest-item h2 { font-size: 1.25rem; line-height: 1.3; margin: 0 0 0.35rem; }
    .digest-meta { font-size: 0.8rem; color: #78716c; margin: 0 0 1rem; }
    .digest-note { font-size: 0.85rem; color: #78716c; border-top: 2px solid #e7e5e4; padding-top: 1rem; margin-top: 2rem; }
    a { color: #1c1917; text-underline-offset: 2px; }
    footer { border-top: 2px solid #d6d3d1; padding-top: 1.5rem; margin-top: 2rem; font-size: 0.85rem; color: #78716c; }
    footer a { color: #57534e; }
    footer span { margin: 0 0.5rem; color: #d6d3d1; }
  </style>
</head>
<body>
  <div class="container">
    <header>
      <p class="feed-name">${feedTitle}</p>
      <h1>${title}</h1>
      <p class="byline">${byline}</p>
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
