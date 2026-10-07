import { useState } from "react";
import { Link } from "react-router-dom";
import { Mail, Newspaper } from "lucide-react";
import ScheduleFields from "../components/ScheduleFields";
import CopyButton from "../components/CopyButton";

interface FeedResult {
  publicId: string;
  title: string;
  kind: string;
  email: string | null;
  feedUrl: string;
}

type Mode = "email" | "digest";

export default function Home() {
  const [mode, setMode] = useState<Mode | null>(null);
  const [result, setResult] = useState<FeedResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // Newsletter form
  const [title, setTitle] = useState("");

  // Digest form
  const [sourceUrl, setSourceUrl] = useState("");
  const [digestTitle, setDigestTitle] = useState("");
  const [cron, setCron] = useState("0 0 * * *");
  const [tz, setTz] = useState(Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC");
  const [titleTemplate, setTitleTemplate] = useState("{date}");
  const [includeContent, setIncludeContent] = useState(true);
  const [ingestImages, setIngestImages] = useState(true);
  const [initialSync, setInitialSync] = useState("backfill");
  const [pollInterval, setPollInterval] = useState(30);

  const create = async (body: Record<string, unknown>, done: (r: FeedResult) => void) => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/feeds", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const data: { error?: string } = await res.json();
        setError(data.error || "Something went wrong");
        return;
      }
      done((await res.json()) as FeedResult);
    } catch {
      setError("Network error. Try again.");
    } finally {
      setLoading(false);
    }
  };

  const createEmail = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;
    create({ kind: "email", title: title.trim() }, setResult);
  };

  const createDigest = (e: React.FormEvent) => {
    e.preventDefault();
    if (!sourceUrl.trim()) return;
    create(
      {
        kind: "digest",
        sourceUrl: sourceUrl.trim(),
        title: digestTitle.trim(),
        scheduleCron: cron.trim(),
        scheduleTz: tz.trim(),
        titleTemplate: titleTemplate.trim() || "{date}",
        includeContent,
        ingestImages,
        initialSync,
        pollIntervalMinutes: Number(pollInterval) || 30,
      },
      setResult,
    );
  };

  if (result) {
    return (
      <div className="space-y-6 border-2 border-stone-300 bg-white p-6">
        <h2 className="text-lg font-bold text-stone-900">{result.title}</h2>
        {result.kind === "email" && result.email && (
          <div>
            <label className="block text-sm font-bold text-stone-700 mb-1">Email address</label>
            <div className="flex items-center">
              <code className="border border-stone-300 bg-stone-50 px-3 py-2 text-sm text-stone-800 break-all">
                {result.email}
              </code>
              <CopyButton text={result.email} label="email" />
            </div>
            <p className="mt-1 text-xs text-stone-500">Use this address when subscribing to newsletters.</p>
          </div>
        )}
        <div>
          <label className="block text-sm font-bold text-stone-700 mb-1">Atom feed URL</label>
          <div className="flex items-center">
            <code className="border border-stone-300 bg-stone-50 px-3 py-2 text-sm text-stone-800 break-all">
              {result.feedUrl}
            </code>
            <CopyButton text={result.feedUrl} label="url" />
          </div>
          <p className="mt-1 text-xs text-stone-500">Add this to your feed reader.</p>
        </div>
        <div className="flex flex-wrap items-center gap-4">
          <Link
            to={`/feeds/${result.publicId}`}
            className="border-2 border-stone-300 bg-white px-6 py-2.5 text-sm font-bold text-stone-700 hover:bg-stone-100 transition-colors"
          >
            Manage feed
          </Link>
          <Link
            to={`/feeds/${result.publicId}/entries`}
            className="text-sm text-stone-600 hover:text-stone-900 underline transition-colors"
          >
            View entries →
          </Link>
          <button
            onClick={() => {
              setResult(null);
              setMode(null);
              setTitle("");
              setSourceUrl("");
              setDigestTitle("");
            }}
            className="text-sm text-stone-500 hover:text-stone-800 underline transition-colors cursor-pointer"
          >
            Create another
          </button>
        </div>
      </div>
    );
  }

  if (mode === null) {
    return (
      <div>
        <h1 className="text-2xl font-bold text-stone-900 mb-2">Create a feed</h1>
        <p className="text-stone-600 mb-8">
          Turn a newsletter into a feed, or consolidate an existing feed into a single scheduled digest.
        </p>
        <div className="grid gap-4 sm:grid-cols-2">
          <button
            onClick={() => setMode("email")}
            className="border-2 border-stone-300 bg-white p-6 text-left hover:border-stone-500 transition-colors cursor-pointer"
          >
            <Mail className="text-stone-700 mb-3" size={22} />
            <h2 className="text-lg font-bold text-stone-900">Newsletter feed</h2>
            <p className="mt-1 text-sm text-stone-600">
              Get an email address and subscribe to newsletters with it. Each email becomes an entry.
            </p>
          </button>
          <button
            onClick={() => setMode("digest")}
            className="border-2 border-stone-300 bg-white p-6 text-left hover:border-stone-500 transition-colors cursor-pointer"
          >
            <Newspaper className="text-stone-700 mb-3" size={22} />
            <h2 className="text-lg font-bold text-stone-900">Digest feed</h2>
            <p className="mt-1 text-sm text-stone-600">
              Point at an RSS or Atom feed. It polls often, then publishes one entry per schedule.
            </p>
          </button>
        </div>
      </div>
    );
  }

  return (
    <div>
      <button
        onClick={() => {
          setMode(null);
          setError("");
        }}
        className="text-sm text-stone-600 hover:text-stone-900 underline transition-colors mb-6 cursor-pointer"
      >
        ← Choose another type
      </button>

      {mode === "email" ? (
        <div>
          <h1 className="text-2xl font-bold text-stone-900 mb-2">Newsletter feed</h1>
          <p className="text-stone-600 mb-8">
            Create a feed, get an email address, and subscribe to newsletters with it. Each email becomes an
            entry in your Atom feed.
          </p>
          <form onSubmit={createEmail} className="space-y-4 border-2 border-stone-300 bg-white p-6">
            <div>
              <label htmlFor="title" className="block text-sm font-bold text-stone-700 mb-1">
                Feed title
              </label>
              <input
                id="title"
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="My Newsletter Feed"
                className="w-full border-2 border-stone-300 bg-white px-4 py-2.5 text-stone-800 placeholder:text-stone-400 focus:border-stone-500 focus:outline-none"
                required
              />
            </div>
            {error && <p className="text-red-600 text-sm">{error}</p>}
            <button
              type="submit"
              disabled={loading || !title.trim()}
              className="border-2 border-stone-800 bg-stone-800 px-6 py-2.5 text-sm font-bold text-white hover:bg-stone-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors cursor-pointer"
            >
              {loading ? "Creating..." : "Create feed"}
            </button>
          </form>
        </div>
      ) : (
        <div>
          <h1 className="text-2xl font-bold text-stone-900 mb-2">Digest feed</h1>
          <p className="text-stone-600 mb-8">
            Point at an RSS or Atom feed. It polls frequently to catch everything, then publishes one entry
            per scheduled tick bundling what it collected.
          </p>
          <form onSubmit={createDigest} className="space-y-4 border-2 border-stone-300 bg-white p-6">
            <div>
              <label htmlFor="sourceUrl" className="block text-sm font-bold text-stone-700 mb-1">
                Source feed URL
              </label>
              <input
                id="sourceUrl"
                type="url"
                value={sourceUrl}
                onChange={(e) => setSourceUrl(e.target.value)}
                placeholder="https://example.com/feed/"
                className="w-full border-2 border-stone-300 bg-white px-4 py-2.5 text-stone-800 placeholder:text-stone-400 focus:border-stone-500 focus:outline-none"
                required
              />
            </div>
            <div>
              <label htmlFor="digestTitle" className="block text-sm font-bold text-stone-700 mb-1">
                Title <span className="font-normal text-stone-400">(optional)</span>
              </label>
              <input
                id="digestTitle"
                type="text"
                value={digestTitle}
                onChange={(e) => setDigestTitle(e.target.value)}
                placeholder="Defaults to the source feed's title"
                className="w-full border-2 border-stone-300 bg-white px-4 py-2.5 text-stone-800 placeholder:text-stone-400 focus:border-stone-500 focus:outline-none"
              />
            </div>

            <ScheduleFields cron={cron} tz={tz} onCronChange={setCron} onTzChange={setTz} />

            <div>
              <label htmlFor="template" className="block text-sm font-bold text-stone-700 mb-1">
                Digest title template
              </label>
              <input
                id="template"
                type="text"
                value={titleTemplate}
                onChange={(e) => setTitleTemplate(e.target.value)}
                className="w-full border-2 border-stone-300 bg-white px-4 py-2.5 font-mono text-sm text-stone-800 focus:border-stone-500 focus:outline-none"
              />
              <p className="mt-1 text-xs text-stone-500">
                Placeholders: <code>{"{date}"}</code>, <code>{"{iso}"}</code>, <code>{"{feed}"}</code>,{" "}
                <code>{"{count}"}</code>.
              </p>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label htmlFor="interval" className="block text-sm font-bold text-stone-700 mb-1">
                  Poll interval (minutes)
                </label>
                <input
                  id="interval"
                  type="number"
                  min={5}
                  value={pollInterval}
                  onChange={(e) => setPollInterval(Number(e.target.value))}
                  className="w-full border-2 border-stone-300 bg-white px-4 py-2.5 text-stone-800 focus:border-stone-500 focus:outline-none"
                />
              </div>
              <div>
                <label htmlFor="initsync" className="block text-sm font-bold text-stone-700 mb-1">
                  First digest
                </label>
                <select
                  id="initsync"
                  value={initialSync}
                  onChange={(e) => setInitialSync(e.target.value)}
                  className="w-full border-2 border-stone-300 bg-white px-4 py-2.5 text-stone-800 focus:border-stone-500 focus:outline-none"
                >
                  <option value="backfill">Backfill everything now</option>
                  <option value="from_now">Start from now</option>
                </select>
              </div>
            </div>

            <label className="flex items-center gap-2 text-sm text-stone-700">
              <input
                type="checkbox"
                checked={includeContent}
                onChange={(e) => setIncludeContent(e.target.checked)}
                className="h-4 w-4"
              />
              Include full article content in digests
            </label>
            <label className="flex items-center gap-2 text-sm text-stone-700">
              <input
                type="checkbox"
                checked={ingestImages}
                onChange={(e) => setIngestImages(e.target.checked)}
                className="h-4 w-4"
              />
              Store lead images locally (so they don't disappear from the source)
            </label>

            {error && <p className="text-red-600 text-sm">{error}</p>}
            <button
              type="submit"
              disabled={loading || !sourceUrl.trim()}
              className="border-2 border-stone-800 bg-stone-800 px-6 py-2.5 text-sm font-bold text-white hover:bg-stone-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors cursor-pointer"
            >
              {loading ? "Fetching & building first digest..." : "Create digest feed"}
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
