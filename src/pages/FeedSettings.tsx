import { useState, useEffect } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { RefreshCw, Sparkles, ExternalLink } from "lucide-react";
import FeedIcon from "../components/FeedIcon";
import CopyButton from "../components/CopyButton";
import ScheduleFields from "../components/ScheduleFields";

interface FeedData {
  publicId: string;
  kind: string;
  title: string;
  sourceTitle: string;
  description: string;
  icon: string | null;
  emailIcon: string | null;
  email: string | null;
  feedUrl: string;
  sourceUrl: string;
  scheduleCron: string;
  scheduleTz: string;
  titleTemplate: string;
  includeContent: boolean;
  ingestImages: boolean;
  pollIntervalMinutes: number;
  nextDigestAt: string | null;
  lastPolled: string | null;
  error: string;
  createdAt: string;
  entryCount?: number;
}

function fmt(iso: string | null): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

export default function FeedSettings() {
  const { publicId } = useParams<{ publicId: string }>();
  const navigate = useNavigate();

  const [feed, setFeed] = useState<FeedData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [title, setTitle] = useState("");
  const [icon, setIcon] = useState("");
  const [sourceUrl, setSourceUrl] = useState("");
  const [cron, setCron] = useState("0 0 * * *");
  const [tz, setTz] = useState("UTC");
  const [titleTemplate, setTitleTemplate] = useState("{date}");
  const [includeContent, setIncludeContent] = useState(true);
  const [ingestImages, setIngestImages] = useState(true);
  const [pollInterval, setPollInterval] = useState(30);

  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState("");
  const [deleteConfirm, setDeleteConfirm] = useState("");
  const [deleting, setDeleting] = useState(false);

  const load = async () => {
    try {
      const res = await fetch(`/api/feeds/${publicId}`);
      if (!res.ok) {
        setError("Feed not found");
        return;
      }
      const data: FeedData = await res.json();
      setFeed(data);
      setTitle(data.title);
      setIcon(data.icon || "");
      setSourceUrl(data.sourceUrl);
      setCron(data.scheduleCron);
      setTz(data.scheduleTz);
      setTitleTemplate(data.titleTemplate);
      setIncludeContent(data.includeContent);
      setIngestImages(data.ingestImages);
      setPollInterval(data.pollIntervalMinutes);
    } catch {
      setError("Failed to load feed");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [publicId]);

  const isDigest = feed?.kind === "feed_digest";

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setMessage("");
    try {
      const body: Record<string, unknown> = { title, icon: icon.trim() || null };
      if (isDigest) {
        Object.assign(body, {
          sourceUrl: sourceUrl.trim(),
          scheduleCron: cron.trim(),
          scheduleTz: tz.trim(),
          titleTemplate: titleTemplate.trim() || "{date}",
          includeContent,
          ingestImages,
          pollIntervalMinutes: Number(pollInterval) || 30,
        });
      }
      const res = await fetch(`/api/feeds/${publicId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const data: { error?: string } = await res.json();
        setMessage(data.error || "Save failed");
        return;
      }
      const data: FeedData = await res.json();
      setFeed(data);
      setMessage("Saved");
      setTimeout(() => setMessage(""), 2000);
    } catch {
      setMessage("Network error");
    } finally {
      setSaving(false);
    }
  };

  const action = async (path: string, label: string) => {
    setBusy(label);
    setMessage("");
    try {
      const res = await fetch(`/api/feeds/${publicId}/${path}`, { method: "POST" });
      const data: { created?: boolean; message?: string; error?: string } = await res.json();
      if (!res.ok) setMessage(data.error || "Action failed");
      else if (data.created === false) setMessage("Nothing new to digest");
      else setMessage(data.message || "Done");
      await load();
      setTimeout(() => setMessage(""), 3000);
    } catch {
      setMessage("Network error");
    } finally {
      setBusy("");
    }
  };

  const handleDelete = async () => {
    if (!feed || deleteConfirm !== feed.title) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/feeds/${publicId}`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirmation: deleteConfirm }),
      });
      if (!res.ok) {
        const data: { error?: string } = await res.json();
        setError(data.error || "Delete failed");
        return;
      }
      navigate("/feeds");
    } catch {
      setError("Network error");
    } finally {
      setDeleting(false);
    }
  };

  if (loading) return <p className="text-stone-500">Loading...</p>;
  if (error || !feed) {
    return (
      <div>
        <p className="text-red-600 mb-4">{error || "Feed not found"}</p>
        <Link to="/feeds" className="text-stone-600 hover:text-stone-900 underline transition-colors">
          ← Back to feeds
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <Link to="/feeds" className="text-sm text-stone-600 hover:text-stone-900 underline transition-colors">
        ← Back to feeds
      </Link>

      <div className="border-2 border-stone-300 bg-white p-6 space-y-2">
        <div className="flex items-center gap-2">
          <FeedIcon title={feed.title} icon={feed.icon} emailIcon={feed.emailIcon} size="md" />
          <h1 className="text-lg font-bold text-stone-900">{feed.title}</h1>
          <span
            className={`text-xs px-2 py-0.5 border ${
              isDigest
                ? "border-blue-300 bg-blue-50 text-blue-700"
                : "border-amber-300 bg-amber-50 text-amber-700"
            }`}
          >
            {isDigest ? "Digest" : "Newsletter"}
          </span>
        </div>
        {isDigest ? (
          <>
            <p className="text-xs text-stone-500 break-all">Source: {feed.sourceUrl}</p>
            <div className="text-xs text-stone-500 flex flex-wrap gap-x-4">
              <span>Last polled: {fmt(feed.lastPolled)}</span>
              <span>Next digest: {fmt(feed.nextDigestAt)}</span>
            </div>
          </>
        ) : (
          <div className="flex items-center">
            <code className="border border-stone-300 bg-stone-50 px-3 py-2 text-sm text-stone-800 break-all">
              {feed.email}
            </code>
            <CopyButton text={feed.email || ""} label="email" />
          </div>
        )}
        {feed.error && <p className="text-xs text-red-600">Error: {feed.error}</p>}

        <div>
          <label className="block text-sm font-bold text-stone-700 mb-1 mt-3">Atom feed URL</label>
          <div className="flex items-center">
            <code className="border border-stone-300 bg-stone-50 px-3 py-2 text-sm text-stone-800 break-all">
              {feed.feedUrl}
            </code>
            <CopyButton text={feed.feedUrl} label="url" />
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-4 pt-2">
          {isDigest && (
            <>
              <button
                onClick={() => action("poll", "poll")}
                disabled={busy !== ""}
                className="flex items-center gap-2 border-2 border-stone-300 bg-white px-4 py-2 text-sm font-bold text-stone-700 hover:bg-stone-100 disabled:opacity-50 transition-colors cursor-pointer"
              >
                <RefreshCw size={16} /> {busy === "poll" ? "Polling..." : "Poll now"}
              </button>
              <button
                onClick={() => action("digest", "digest")}
                disabled={busy !== ""}
                className="flex items-center gap-2 border-2 border-stone-300 bg-white px-4 py-2 text-sm font-bold text-stone-700 hover:bg-stone-100 disabled:opacity-50 transition-colors cursor-pointer"
              >
                <Sparkles size={16} /> {busy === "digest" ? "Building..." : "Generate digest now"}
              </button>
              <Link
                to={`/feeds/${publicId}/sources`}
                className="text-sm text-stone-600 hover:text-stone-900 underline"
              >
                Source entries
              </Link>
            </>
          )}
          <Link
            to={`/feeds/${publicId}/entries`}
            className="text-sm text-stone-600 hover:text-stone-900 underline"
          >
            {isDigest ? "Digests" : "Entries"}
          </Link>
          <a
            href={feed.feedUrl}
            target="_blank"
            rel="noreferrer"
            className="flex items-center gap-1 text-sm text-stone-600 hover:text-stone-900 underline"
          >
            Open feed <ExternalLink size={14} />
          </a>
          {message && <span className="text-sm text-green-700">{message}</span>}
        </div>
      </div>

      <form onSubmit={handleSave} className="border-2 border-stone-300 bg-white p-6 space-y-4">
        <h2 className="text-lg font-bold text-stone-900">Settings</h2>

        <div>
          <label htmlFor="title" className="block text-sm font-bold text-stone-700 mb-1">
            Title
          </label>
          <input
            id="title"
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="w-full border-2 border-stone-300 bg-white px-4 py-2.5 text-stone-800 focus:border-stone-500 focus:outline-none"
            required
          />
          {isDigest && feed.sourceTitle && (
            <p className="mt-1 text-xs text-stone-500">Source title: {feed.sourceTitle}</p>
          )}
        </div>

        <div>
          <label htmlFor="icon" className="block text-sm font-bold text-stone-700 mb-1">
            Icon URL
          </label>
          <input
            id="icon"
            type="url"
            value={icon}
            onChange={(e) => setIcon(e.target.value)}
            placeholder="https://example.com/icon.png"
            className="w-full border-2 border-stone-300 bg-white px-4 py-2.5 text-stone-800 placeholder:text-stone-400 focus:border-stone-500 focus:outline-none"
          />
        </div>

        {isDigest && (
          <>
            <div>
              <label htmlFor="sourceUrl" className="block text-sm font-bold text-stone-700 mb-1">
                Source feed URL
              </label>
              <input
                id="sourceUrl"
                type="url"
                value={sourceUrl}
                onChange={(e) => setSourceUrl(e.target.value)}
                className="w-full border-2 border-stone-300 bg-white px-4 py-2.5 text-stone-800 focus:border-stone-500 focus:outline-none"
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
            </div>

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
              Store lead images locally
            </label>
          </>
        )}

        <div className="flex items-center gap-4">
          <button
            type="submit"
            disabled={saving || !title.trim()}
            className="border-2 border-stone-800 bg-stone-800 px-6 py-2.5 text-sm font-bold text-white hover:bg-stone-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors cursor-pointer"
          >
            {saving ? "Saving..." : "Save"}
          </button>
          {message && (
            <span className={message === "Saved" ? "text-green-700 text-sm" : "text-red-600 text-sm"}>
              {message}
            </span>
          )}
        </div>
      </form>

      <div className="border-2 border-red-300 bg-white p-6 space-y-4">
        <h2 className="text-lg font-bold text-red-700">Delete feed</h2>
        <p className="text-sm text-stone-600">
          This permanently deletes the feed, all entries, and attachments.
          {!isDigest && " The email address will stop working."}
        </p>
        <div>
          <label htmlFor="confirm" className="block text-sm font-bold text-stone-700 mb-1">
            Type the feed title <span className="text-red-700">{feed.title}</span> to confirm
          </label>
          <input
            id="confirm"
            type="text"
            value={deleteConfirm}
            onChange={(e) => setDeleteConfirm(e.target.value)}
            className="w-full border-2 border-stone-300 bg-white px-4 py-2.5 text-stone-800 focus:border-red-500 focus:outline-none"
          />
        </div>
        <button
          onClick={handleDelete}
          disabled={deleting || deleteConfirm !== feed.title}
          className="border-2 border-red-700 bg-red-700 px-6 py-2.5 text-sm font-bold text-white hover:bg-red-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors cursor-pointer"
        >
          {deleting ? "Deleting..." : "Delete feed"}
        </button>
      </div>
    </div>
  );
}
