import { Cron } from "croner";

export const PUBLIC_ID_LENGTH = 20;
export const PUBLIC_ID_CHARS = "abcdefghijklmnopqrstuvwxyz0123456789";
export const RATE_LIMIT = 30;
export const POLL_BATCH = 10;
export const ENTRY_FEED_LIMIT = 200;
export const MAX_ENTRIES = 50;
export const MAX_DIGEST_CHARS = 400_000;
export const IMAGE_INGEST_BUDGET = 30;
export const DEFAULT_TITLE_TEMPLATE = "{date}";
export const DEFAULT_CRON = "0 0 * * *";
export const DEFAULT_TZ = "UTC";
export const DEFAULT_POLL_INTERVAL_MINUTES = 30;
export const USER_AGENT = "slownews/2.0 (+https://slownews.funkadelic.net)";
export const ACCEPT =
  "application/atom+xml, application/rss+xml, application/xml, text/xml";
export const SESSION_DURATION = 30 * 24 * 60 * 60 * 1000;

// ---------------------------------------------------------------------------
// Shared types
// ---------------------------------------------------------------------------

export interface FeedData {
  title: string;
  description: string;
  link: string;
  icon: string;
  entries: EntryData[];
}

export interface EntryData {
  guid: string;
  title: string;
  url: string;
  author: string;
  content: string;
  summary: string;
  published: string;
  image: string;
}

export interface DigestConfig {
  sourceUrl: string;
  cron: string;
  tz: string;
  titleTemplate: string;
  includeContent: boolean;
  initialSync: "backfill" | "from_now";
  pollIntervalMinutes: number;
  ingestImages: boolean;
  eligibleFrom: string | null;
  titleCustom: boolean;
}

export interface DigestState {
  etag?: string;
  lastModified?: string;
  lastPolled?: string;
  nextDigestAt?: string;
  lastDigestTick?: string;
}

export const DEFAULT_DIGEST_CONFIG: Omit<DigestConfig, "sourceUrl"> = {
  cron: DEFAULT_CRON,
  tz: DEFAULT_TZ,
  titleTemplate: DEFAULT_TITLE_TEMPLATE,
  includeContent: true,
  initialSync: "backfill",
  pollIntervalMinutes: DEFAULT_POLL_INTERVAL_MINUTES,
  ingestImages: true,
  eligibleFrom: null,
  titleCustom: false,
};

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------

export function generatePublicId(): string {
  const bytes = new Uint8Array(PUBLIC_ID_LENGTH);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => PUBLIC_ID_CHARS[b % PUBLIC_ID_CHARS.length]).join("");
}

export function escapeXml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

export function cdata(s: string): string {
  return s.replace(/]]>/g, "]]]]><![CDATA[>");
}

export function imageMime(url: string): string {
  const ext = url.split("?")[0].split(".").pop()?.toLowerCase();
  switch (ext) {
    case "png":
      return "image/png";
    case "gif":
      return "image/gif";
    case "webp":
      return "image/webp";
    case "avif":
      return "image/avif";
    case "svg":
      return "image/svg+xml";
    default:
      return "image/jpeg";
  }
}

export function getStr(o: Record<string, unknown>, key: string): string {
  const v = o[key];
  return v == null ? "" : String(v);
}

export function getNum(o: Record<string, unknown>, key: string): number {
  const v = o[key];
  return v == null ? 0 : Number(v);
}

// SQLite `datetime('now')` renders as "YYYY-MM-DD HH:MM:SS"; make it ISO 8601.
export function sqliteToIso(raw: string): string {
  if (!raw) return new Date(0).toISOString();
  if (raw.includes("T")) return raw.endsWith("Z") ? raw : `${raw}Z`;
  return `${raw.replace(" ", "T")}Z`;
}

export function parseJson<T>(value: unknown, fallback: T): T {
  if (value == null || value === "") return fallback;
  try {
    const parsed = JSON.parse(String(value));
    return (parsed ?? fallback) as T;
  } catch {
    return fallback;
  }
}

export function hostnameOf(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return "";
  }
}

export function feedIconFromUrl(feedUrl: string): string {
  const host = hostnameOf(feedUrl);
  return host ? `https://${host}/favicon.ico` : "";
}

export function buildCron(expr: string, tz: string): Cron {
  return new Cron(expr, { timezone: tz, paused: true });
}

export function isValidSchedule(expr: string, tz: string): boolean {
  try {
    return buildCron(expr, tz).nextRun(new Date()) !== null;
  } catch {
    return false;
  }
}

export function nextCronRun(expr: string, tz: string): string | null {
  try {
    const next = buildCron(expr, tz).nextRun(new Date());
    return next ? next.toISOString() : null;
  } catch {
    return null;
  }
}

export function formatInTz(
  iso: string,
  tz: string,
  opts: Intl.DateTimeFormatOptions,
): string {
  try {
    return new Intl.DateTimeFormat("en-US", { ...opts, timeZone: tz }).format(new Date(iso));
  } catch {
    return new Date(iso).toISOString();
  }
}

export function renderTemplate(tpl: string, vars: Record<string, string>): string {
  return tpl.replace(/\{(\w+)\}/g, (_m, key: string) => vars[key] ?? "");
}
