import { useState, useEffect } from "react";
import { useParams, Link } from "react-router-dom";
import FeedIcon from "../components/FeedIcon";

interface SourceItem {
  guid: string;
  title: string;
  author: string;
  url: string;
  published: string;
  digested: boolean;
  digestTitle: string;
}

interface FeedData {
  publicId: string;
  title: string;
  kind: string;
  icon: string | null;
}

function formatDate(iso: string): string {
  if (!iso) return "";
  try {
    return new Date(iso.includes("T") ? iso : iso.replace(" ", "T") + "Z").toLocaleString();
  } catch {
    return iso;
  }
}

export default function SourceEntries() {
  const { publicId } = useParams<{ publicId: string }>();
  const [feed, setFeed] = useState<FeedData | null>(null);
  const [items, setItems] = useState<SourceItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      fetch(`/api/feeds/${publicId}`).then((r) => r.json() as unknown as FeedData),
      fetch(`/api/feeds/${publicId}/sources`).then((r) => r.json() as unknown as SourceItem[]),
    ])
      .then(([f, s]) => {
        setFeed(f);
        setItems(s);
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
        <FeedIcon title={feed.title} icon={feed.icon} size="md" />
        <h1 className="text-lg font-bold text-stone-900">{feed.title} — source entries</h1>
      </div>

      {items.length === 0 ? (
        <p className="text-stone-500 text-center py-8">No source entries collected yet.</p>
      ) : (
        <div className="divide-y-2 divide-stone-300 border-2 border-stone-300 bg-white">
          {items.map((item, i) => (
            <div key={`${item.guid}-${i}`} className="px-5 py-3">
              <div className="flex items-start justify-between gap-4">
                {item.url ? (
                  <a
                    href={item.url}
                    target="_blank"
                    rel="noreferrer"
                    className="flex-1 text-sm text-stone-800 hover:text-stone-600"
                  >
                    {item.title || item.url}
                  </a>
                ) : (
                  <span className="flex-1 text-sm text-stone-800">{item.title || "(untitled)"}</span>
                )}
                <span
                  className={`shrink-0 text-xs px-2 py-0.5 border ${
                    item.digested
                      ? "border-green-300 bg-green-50 text-green-700"
                      : "border-amber-300 bg-amber-50 text-amber-700"
                  }`}
                >
                  {item.digested ? "digested" : "pending"}
                </span>
              </div>
              <p className="text-xs text-stone-500 mt-0.5">
                {item.author ? `${item.author} · ` : ""}
                {formatDate(item.published)}
                {item.digested && item.digestTitle ? ` · in “${item.digestTitle}”` : ""}
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
