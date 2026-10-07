import { XMLParser } from "fast-xml-parser";
import {
  type EntryData,
  type FeedData,
  feedIconFromUrl,
  getStr,
} from "./util";

const feedParser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  removeNSPrefix: false,
  isArray: (name) => ["item", "entry"].includes(name),
});

function textOf(node: unknown): string {
  if (!node || typeof node !== "object") return "";
  const n = node as Record<string, unknown>;
  if (typeof n["#text"] === "string") return n["#text"] as string;
  if (typeof n["_"] === "string") return n["_"] as string;
  return "";
}

function valOf(node: unknown): string {
  if (typeof node === "string") return node;
  if (typeof node === "number") return String(node);
  return textOf(node);
}

function parseDate(raw: string): string {
  if (!raw) return new Date().toISOString();
  const d = new Date(raw);
  return isNaN(d.getTime()) ? new Date().toISOString() : d.toISOString();
}

const HTML_ENTITIES: Record<string, string> = {
  amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ",
  mdash: "\u2014", ndash: "\u2013", hellip: "\u2026", middot: "\u00b7",
  lsquo: "\u2018", rsquo: "\u2019", ldquo: "\u201c", rdquo: "\u201d",
  laquo: "\u00ab", raquo: "\u00bb", copy: "\u00a9", reg: "\u00ae",
  trade: "\u2122", deg: "\u00b0", times: "\u00d7", divide: "\u00f7",
};

export function decodeEntities(text: string): string {
  return text.replace(/&(#x[0-9a-fA-F]+|#[0-9]+|[a-zA-Z]+);/g, (match, code: string) => {
    if (code[0] === "#") {
      const isHex = code[1] === "x" || code[1] === "X";
      const num = parseInt(code.slice(isHex ? 2 : 1), isHex ? 16 : 10);
      if (!Number.isNaN(num) && num > 0 && num <= 0x10ffff) {
        try {
          return String.fromCodePoint(num);
        } catch {
          return match;
        }
      }
      return match;
    }
    return HTML_ENTITIES[code.toLowerCase()] ?? match;
  });
}

export function extractText(html: string): string {
  return decodeEntities(
    html
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<[^>]*>/g, " "),
  )
    .replace(/\s+/g, " ")
    .trim();
}

export function extractImage(html: string): string {
  const m = html.match(/<img[^>]+?src=["']([^"']+)["']/i);
  return m ? m[1] : "";
}

// Remove the first <img> whose src matches the header photo so the same picture
// isn't shown twice (once as the header, once inline in the article body).
export function stripLeadImage(html: string, image: string): string {
  const base = image.split("?")[0];
  if (!base) return html;
  let removed = false;
  const withoutImg = html.replace(/<img\b[^>]*>/gi, (tag) => {
    if (!removed && tag.includes(base)) {
      removed = true;
      return "";
    }
    return tag;
  });
  if (!removed) return withoutImg;
  return withoutImg.replace(/<p\b[^>]*>\s*<\/p>/gi, "");
}

function findAtomLink(
  links: unknown,
  rel?: string,
): Record<string, unknown> | undefined {
  if (!links) return undefined;
  const arr = Array.isArray(links) ? links : [links];
  for (const l of arr) {
    if (!l || typeof l !== "object") continue;
    const link = l as Record<string, unknown>;
    if (!rel) return link;
    if (String(link["@_rel"] || "") === rel) return link;
  }
  return undefined;
}

export function parseFeedXml(xml: string, feedUrl: string): FeedData {
  const doc = feedParser.parse(xml) as Record<string, unknown>;
  const rss = doc.rss as Record<string, unknown> | undefined;
  const atom = doc.feed as Record<string, unknown> | undefined;
  if (rss) return parseRss(rss.channel as Record<string, unknown>, feedUrl);
  if (atom) return parseAtom(atom, feedUrl);
  throw new Error("Unrecognized feed format");
}

function parseRss(channel: Record<string, unknown>, feedUrl: string): FeedData {
  const title = extractText(valOf(channel.title) || "Untitled");
  const description = extractText(valOf(channel.description));
  const link = valOf(channel.link);

  let icon = "";
  const image = channel.image as Record<string, unknown> | undefined;
  if (image?.url) icon = valOf(image.url);
  if (!icon) icon = feedIconFromUrl(feedUrl);

  const items = (channel.item || []) as Record<string, unknown>[];
  const entries: EntryData[] = [];

  for (const item of items) {
    const guid = valOf(item.guid) || valOf(item.link) || valOf(item.title);
    if (!guid) continue;

    const contentEncoded = item["content:encoded"] as Record<string, unknown> | string | undefined;
    const content =
      typeof contentEncoded === "string"
        ? contentEncoded
        : textOf(contentEncoded) || valOf(item.description) || "";
    const summary = extractText(valOf(item.description));

    let entryImage = "";
    const mediaThumb = item["media:thumbnail"] as Record<string, unknown> | undefined;
    const mediaContent = item["media:content"] as Record<string, unknown> | undefined;
    if (mediaThumb?.["@_url"]) entryImage = valOf(mediaThumb["@_url"]);
    else if (mediaContent?.["@_url"]) entryImage = valOf(mediaContent["@_url"]);
    if (!entryImage) {
      const enclosure = item.enclosure as Record<string, unknown> | undefined;
      if (enclosure?.["@_url"]) {
        const encType = String(enclosure["@_type"] || "");
        if (encType.startsWith("image/")) entryImage = valOf(enclosure["@_url"]);
      }
    }
    if (!entryImage) entryImage = extractImage(content);

    const author = extractText(valOf(item["dc:creator"]) || valOf(item.author) || "");

    entries.push({
      guid,
      title: extractText(valOf(item.title) || "(no title)"),
      url: valOf(item.link),
      author,
      content,
      summary,
      published: parseDate(valOf(item.pubDate)),
      image: entryImage,
    });
  }

  return { title, description, link, icon, entries };
}

function parseAtom(feed: Record<string, unknown>, feedUrl: string): FeedData {
  const title = extractText(valOf(feed.title) || "Untitled");
  const description = extractText(valOf(feed.subtitle) || valOf(feed.tagline));
  const linkEl = findAtomLink(feed.link, "alternate") || findAtomLink(feed.link);
  const link = linkEl?.["@_href"] ? valOf(linkEl["@_href"]) : "";

  let icon = valOf(feed.icon) || valOf(feed.logo);
  if (!icon) icon = feedIconFromUrl(feedUrl);

  const items = (feed.entry || []) as Record<string, unknown>[];
  const entries: EntryData[] = [];

  for (const item of items) {
    const altLink = findAtomLink(item.link, "alternate") || findAtomLink(item.link);
    const guid =
      valOf(item.id) ||
      (altLink?.["@_href"] ? valOf(altLink["@_href"]) : "") ||
      valOf(item.title);
    if (!guid) continue;

    const content = valOf(item.content) || valOf(item.summary) || "";
    const summary = extractText(valOf(item.summary) || valOf(item.content) || "");

    let entryImage = "";
    const enclosureLink = findAtomLink(item.link, "enclosure");
    if (enclosureLink?.["@_href"]) {
      const encType = String(enclosureLink["@_type"] || "");
      if (encType.startsWith("image/")) entryImage = valOf(enclosureLink["@_href"]);
    }
    if (!entryImage) entryImage = extractImage(content);

    const authorEl = item.author as Record<string, unknown> | undefined;
    const author = extractText(valOf(authorEl?.name) || "");

    entries.push({
      guid,
      title: extractText(valOf(item.title) || "(no title)"),
      url: altLink?.["@_href"] ? valOf(altLink["@_href"]) : "",
      author,
      content,
      summary,
      published: parseDate(valOf(item.published) || valOf(item.updated)),
      image: entryImage,
    });
  }

  return { title, description, link, icon, entries };
}

// ---------------------------------------------------------------------------
// Content sanitization
// ---------------------------------------------------------------------------

export async function sanitizeContent(html: string, baseUrl = ""): Promise<string> {
  if (!html) return "";
  const stripped = html
    .replace(/background(-color)?\s*:\s*[^;"]+/gi, "")
    .replace(/(min-)?width\s*:\s*[^;"]+/gi, "")
    .replace(/\son\w+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, "");
  return new HTMLRewriter()
    .on("script, style", {
      element(e) {
        e.remove();
      },
    })
    .on("img", {
      element(e) {
        const src = e.getAttribute("src");
        if (src && !/^(https?:|data:|\/\/)/i.test(src)) {
          try {
            e.setAttribute("src", new URL(src, baseUrl || "https://example.invalid").href);
          } catch {
            /* leave as-is */
          }
        }
      },
    })
    .on("*", {
      element(e) {
        e.removeAttribute("width");
      },
    })
    .transform(new Response(stripped))
    .text();
}
