import { useState, useEffect } from "react";
import { useParams, Link } from "react-router-dom";
import FeedIcon from "../components/FeedIcon";

interface EntryItem {
  publicId: string;
  title: string;
  author: string;
  createdAt: string;
  image: string;
  summary: string;
  itemCount: number;
}

interface FeedData {
  publicId: string;
  title: string;
  kind: string;
  icon: string | null;
  emailIcon: string | null;
}

function formatDate(iso: string): string {
  if (!iso) return "";
  try {
    return new Date(iso.includes("T") ? iso : iso.replace(" ", "T") + "Z").toLocaleString();
  } catch {
    return iso;
  }
}

export default function FeedEntries() {
  const { publicId } = useParams<{ publicId: string }>();
  const [feed, setFeed] = useState<FeedData | null>(null);
  const [entries, setEntries] = useState<EntryItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      fetch(`/api/feeds/${publicId}`).then((r) => r.json() as unknown as FeedData),
      fetch(`/api/feeds/${publicId}/entries`).then((r) => r.json() as unknown as EntryItem[]),
    ])
      .then(([f, e]) => {
        setFeed(f);
        setEntries(e);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [publicId]);

  if (loading) return <p className="text-stone-500">Loading...</p>;
  if (!feed) return <p className="text-stone-500">Feed not found.</p>;

  return (
    <div className="space-y-4">
      <Link
        to={`/feeds/${publicId}`}
        className="text-sm text-stone-600 hover:text-stone-900 underline transition-colors inline-block"
      >
        ← Back to feed settings
      </Link>
      <div className="flex items-center gap-2">
        <FeedIcon title={feed.title} icon={feed.icon} emailIcon={feed.emailIcon} size="md" />
        <h1 className="text-lg font-bold text-stone-900">{feed.title}</h1>
      </div>

      {entries.length === 0 ? (
        <p className="text-stone-500 text-center py-8">No entries yet.</p>
      ) : (
        <div className="divide-y-2 divide-stone-300 border-2 border-stone-300 bg-white">
          {entries.map((entry) => (
            <a
              key={entry.publicId}
              href={`/feeds/${publicId}/entries/${entry.publicId}.html`}
              className="flex items-center gap-3 px-5 py-3 hover:bg-stone-100 transition-colors"
            >
              {entry.image ? (
                <img
                  src={entry.image}
                  alt=""
                  className="h-12 w-12 shrink-0 object-cover border border-stone-200"
                  onError={(e) => {
                    (e.currentTarget as HTMLImageElement).style.display = "none";
                  }}
                />
              ) : null}
              <div className="flex-1 min-w-0">
                <p className="text-sm text-stone-800 truncate">{entry.title}</p>
                <p className="text-xs text-stone-500 mt-0.5">
                  {entry.itemCount > 0 ? `${entry.itemCount} item${entry.itemCount === 1 ? "" : "s"} · ` : ""}
                  {entry.author ? `${entry.author} · ` : ""}
                  {formatDate(entry.createdAt)}
                </p>
              </div>
            </a>
          ))}
        </div>
      )}
    </div>
  );
}
