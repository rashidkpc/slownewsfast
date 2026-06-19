import { useState } from "react";

interface FeedResult {
  publicId: string;
  email: string;
  feedUrl: string;
  title: string;
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

export default function Home() {
  const [title, setTitle] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<FeedResult | null>(null);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;

    setLoading(true);
    setError("");

    try {
      const res = await fetch("/api/feeds", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: title.trim() }),
      });

      if (!res.ok) {
        const data: { error?: string } = await res.json();
        setError(data.error || "Something went wrong");
        return;
      }

      const data: FeedResult = await res.json();
      setResult(data);
    } catch {
      setError("Network error. Try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      <h1 className="text-2xl font-bold text-white mb-2">
        Convert email newsletters into Atom feeds
      </h1>
      <p className="text-zinc-400 mb-8">
        Create a feed, get an email address, and subscribe to newsletters with
        it. Each email becomes an entry in your Atom feed — readable in any feed
        reader.
      </p>

      {!result ? (
        <form onSubmit={handleCreate} className="space-y-4">
          <div>
            <label htmlFor="title" className="block text-sm font-medium text-zinc-300 mb-1">
              Feed title
            </label>
            <input
              id="title"
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="My Newsletter Feed"
              className="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-4 py-2.5 text-zinc-200 placeholder:text-zinc-500 focus:border-zinc-500 focus:outline-none"
              required
            />
          </div>
          {error && (
            <p className="text-red-400 text-sm">{error}</p>
          )}
          <button
            type="submit"
            disabled={loading || !title.trim()}
            className="rounded-lg bg-white px-6 py-2.5 text-sm font-semibold text-zinc-950 hover:bg-zinc-200 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {loading ? "Creating..." : "Create feed"}
          </button>
        </form>
      ) : (
        <div className="space-y-6 rounded-xl border border-zinc-800 bg-zinc-900 p-6">
          <h2 className="text-lg font-semibold text-white">{result.title}</h2>

          <div>
            <label className="block text-sm font-medium text-zinc-400 mb-1">
              Email address
            </label>
            <div className="flex items-center">
              <code className="rounded bg-zinc-800 px-3 py-2 text-sm text-zinc-200 break-all">
                {result.email}
              </code>
              <CopyButton text={result.email} label="email" />
            </div>
            <p className="mt-1 text-xs text-zinc-500">
              Use this address when subscribing to newsletters.
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium text-zinc-400 mb-1">
              Atom feed URL
            </label>
            <div className="flex items-center">
              <code className="rounded bg-zinc-800 px-3 py-2 text-sm text-zinc-200 break-all">
                {result.feedUrl}
              </code>
              <CopyButton text={result.feedUrl} label="url" />
            </div>
            <p className="mt-1 text-xs text-zinc-500">
              Add this to your feed reader.
            </p>
          </div>

          <a
            href={`/feeds/${result.publicId}`}
            className="inline-block text-sm text-zinc-400 hover:text-zinc-200 transition-colors"
          >
            Manage feed settings →
          </a>

          <button
            onClick={() => {
              setResult(null);
              setTitle("");
            }}
            className="ml-4 text-sm text-zinc-500 hover:text-zinc-300 transition-colors"
          >
            Create another
          </button>
        </div>
      )}
    </div>
  );
}
