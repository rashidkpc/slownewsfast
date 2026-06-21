import { useState, useEffect } from "react";
import { useParams, Link } from "react-router-dom";
import FeedIcon from "../components/FeedIcon";

interface EntryItem {
  publicId: string;
  title: string;
  author: string;
  createdAt: string;
  read: boolean;
}

interface FeedData {
  publicId: string;
  title: string;
  icon: string | null;
  emailIcon: string | null;
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

  const markRead = async (entryPublicId: string, read: boolean) => {
    await fetch(`/api/entries/${entryPublicId}/read`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ read }),
    });
    setEntries((prev) =>
      prev.map((e) => (e.publicId === entryPublicId ? { ...e, read } : e)),
    );
  };

  const handleClick = (entry: EntryItem) => {
    markRead(entry.publicId, true);
    window.location.href = `/feeds/${feed!.publicId}/entries/${entry.publicId}.html`;
  };

  if (loading) {
    return <p className="text-stone-500">Loading...</p>;
  }

  if (!feed) {
    return <p className="text-stone-500">Feed not found.</p>;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <FeedIcon
          title={feed.title}
          icon={feed.icon}
          emailIcon={feed.emailIcon}
          size="md"
        />
        <h1 className="text-lg font-bold text-stone-900">{feed.title}</h1>
      </div>

      {entries.length === 0 ? (
        <p className="text-stone-500 text-center py-8">No entries yet.</p>
      ) : (
        <div className="divide-y-2 divide-stone-300 border-2 border-stone-300 bg-white">
          {entries.map((entry) => (
            <div
              key={entry.publicId}
              className="flex items-start px-5 py-3 hover:bg-stone-100 transition-colors"
            >
              <div
                className="flex-1 cursor-pointer"
                onClick={() => handleClick(entry)}
              >
                <p
                  className={`text-sm ${
                    entry.read ? "text-stone-400" : "text-stone-800"
                  }`}
                >
                  {entry.title}
                </p>
                <p className="text-xs text-stone-500 mt-0.5">
                  {new Date(entry.createdAt + "Z").toLocaleString()}
                </p>
              </div>
              {entry.read && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    markRead(entry.publicId, false);
                  }}
                  className="mt-1 text-xs text-stone-300 hover:text-stone-500 transition-colors shrink-0"
                >
                  Mark unread
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
