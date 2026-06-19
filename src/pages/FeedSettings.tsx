import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";

interface FeedData {
  publicId: string;
  title: string;
  icon: string | null;
  emailIcon: string | null;
  email: string;
  feedUrl: string;
  createdAt: string;
}

function CopyButton({ text, label }: { text: string; label: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <button
      onClick={handleCopy}
      className="ml-2 rounded bg-zinc-800 px-2 py-0.5 text-xs text-zinc-400 hover:bg-zinc-700 hover:text-zinc-200 transition-colors"
    >
      {copied ? "copied" : `copy ${label}`}
    </button>
  );
}

export default function FeedSettings() {
  const { publicId } = useParams<{ publicId: string }>();
  const navigate = useNavigate();
  const [feed, setFeed] = useState<FeedData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [title, setTitle] = useState("");
  const [icon, setIcon] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState("");
  const [deleteConfirm, setDeleteConfirm] = useState("");
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    async function load() {
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
      } catch {
        setError("Failed to load feed");
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [publicId]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;

    setSaving(true);
    setSaveMessage("");

    try {
      const res = await fetch(`/api/feeds/${publicId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: title.trim(),
          icon: icon.trim() || null,
        }),
      });

      if (!res.ok) {
        const data: { error?: string } = await res.json();
        setSaveMessage(data.error || "Save failed");
        return;
      }

      setSaveMessage("Saved");
      setTimeout(() => setSaveMessage(""), 2000);
    } catch {
      setSaveMessage("Network error");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (deleteConfirm !== feed?.title) return;

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

      navigate("/");
    } catch {
      setError("Network error");
    } finally {
      setDeleting(false);
    }
  };

  if (loading) {
    return <p className="text-zinc-400">Loading...</p>;
  }

  if (error || !feed) {
    return (
      <div>
        <p className="text-red-400 mb-4">{error || "Feed not found"}</p>
        <a href="/" className="text-zinc-400 hover:text-zinc-200 transition-colors">
          ← Back home
        </a>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <a href="/" className="text-sm text-zinc-400 hover:text-zinc-200 transition-colors">
        ← Back home
      </a>

      <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-6 space-y-4">
        <div>
          <label className="block text-sm font-medium text-zinc-400 mb-1">
            Email address
          </label>
          <div className="flex items-center">
            <code className="rounded bg-zinc-800 px-3 py-2 text-sm text-zinc-200 break-all">
              {feed.email}
            </code>
            <CopyButton text={feed.email} label="email" />
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-zinc-400 mb-1">
            Atom feed URL
          </label>
          <div className="flex items-center">
            <code className="rounded bg-zinc-800 px-3 py-2 text-sm text-zinc-200 break-all">
              {feed.feedUrl}
            </code>
            <CopyButton text={feed.feedUrl} label="url" />
          </div>
        </div>
      </div>

      <form onSubmit={handleSave} className="rounded-xl border border-zinc-800 bg-zinc-900 p-6 space-y-4">
        <h2 className="text-lg font-semibold text-white">Settings</h2>

        <div>
          <label htmlFor="title" className="block text-sm font-medium text-zinc-300 mb-1">
            Feed title
          </label>
          <input
            id="title"
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-4 py-2.5 text-zinc-200 placeholder:text-zinc-500 focus:border-zinc-500 focus:outline-none"
            required
          />
        </div>

        <div>
          <label htmlFor="icon" className="block text-sm font-medium text-zinc-300 mb-1">
            Icon URL
          </label>
          <input
            id="icon"
            type="url"
            value={icon}
            onChange={(e) => setIcon(e.target.value)}
            placeholder="https://example.com/icon.png"
            className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-4 py-2.5 text-zinc-200 placeholder:text-zinc-500 focus:border-zinc-500 focus:outline-none"
          />
          <p className="mt-1 text-xs text-zinc-500">
            Optional. If not set, the sender's favicon is used automatically.
          </p>
        </div>

        <div className="flex items-center gap-4">
          <button
            type="submit"
            disabled={saving || !title.trim()}
            className="rounded-lg bg-white px-6 py-2.5 text-sm font-semibold text-zinc-950 hover:bg-zinc-200 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {saving ? "Saving..." : "Save"}
          </button>
          {saveMessage && (
            <span className={saveMessage === "Saved" ? "text-green-400 text-sm" : "text-red-400 text-sm"}>
              {saveMessage}
            </span>
          )}
        </div>
      </form>

      <div className="rounded-xl border border-red-900/50 bg-zinc-900 p-6 space-y-4">
        <h2 className="text-lg font-semibold text-red-400">Delete feed</h2>
        <p className="text-sm text-zinc-400">
          This permanently deletes the feed, all entries, and attachments. The
          email address will stop working.
        </p>
        <div>
          <label htmlFor="confirm" className="block text-sm font-medium text-zinc-300 mb-1">
            Type the feed title <span className="text-red-400 font-semibold">{feed.title}</span> to confirm
          </label>
          <input
            id="confirm"
            type="text"
            value={deleteConfirm}
            onChange={(e) => setDeleteConfirm(e.target.value)}
            className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-4 py-2.5 text-zinc-200 focus:border-red-500 focus:outline-none"
          />
        </div>
        <button
          onClick={handleDelete}
          disabled={deleting || deleteConfirm !== feed.title}
          className="rounded-lg bg-red-600 px-6 py-2.5 text-sm font-semibold text-white hover:bg-red-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {deleting ? "Deleting..." : "Delete feed"}
        </button>
      </div>
    </div>
  );
}
