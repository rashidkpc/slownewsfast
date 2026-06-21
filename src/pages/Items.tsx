import { useState, useEffect } from "react";
import FeedIcon from "../components/FeedIcon";

interface EntryItem {
  publicId: string;
  title: string;
  author: string;
  createdAt: string;
  read: boolean;
  feedPublicId: string;
  feedTitle: string;
  icon: string | null;
  emailIcon: string | null;
}

export default function Items() {
  const [entries, setEntries] = useState<EntryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  useEffect(() => {
    fetch("/api/entries")
      .then((r) => r.json() as unknown as EntryItem[])
      .then((data) => setEntries(data))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const markRead = async (publicId: string, read: boolean) => {
    await fetch(`/api/entries/${publicId}/read`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ read }),
    });
    setEntries((prev) =>
      prev.map((e) => (e.publicId === publicId ? { ...e, read } : e)),
    );
  };

  const handleClick = (entry: EntryItem) => {
    markRead(entry.publicId, true);
    window.location.href = `/feeds/${entry.feedPublicId}/entries/${entry.publicId}.html`;
  };

  const filtered = entries.filter(
    (e) =>
      e.title.toLowerCase().includes(search.toLowerCase()) ||
      e.feedTitle.toLowerCase().includes(search.toLowerCase()),
  );

  if (loading) {
    return <p className="text-stone-500">Loading...</p>;
  }

  return (
    <div className="space-y-4">
      <input
        type="text"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Search feed items..."
        className="w-full border-2 border-stone-300 bg-white px-4 py-2.5 text-stone-800 placeholder:text-stone-400 focus:border-stone-500 focus:outline-none"
      />

      {filtered.length === 0 ? (
        <p className="text-stone-500 text-center py-8">
          {search ? "No matching items." : "No items yet."}
        </p>
      ) : (
        <div className="divide-y-2 divide-stone-300 border-2 border-stone-300 bg-white">
          {filtered.map((entry) => (
            <div
              key={entry.publicId}
              className="flex items-start px-5 py-3 hover:bg-stone-100 transition-colors"
            >
              <div
                className="flex-1 cursor-pointer"
                onClick={() => handleClick(entry)}
              >
                <div className="flex items-center gap-2">
                  <FeedIcon
                    title={entry.feedTitle}
                    icon={entry.icon}
                    emailIcon={entry.emailIcon}
                    size="sm"
                  />
                  <span className="text-xs font-bold text-stone-600 uppercase tracking-wide">
                    {entry.feedTitle}
                  </span>
                </div>
                <p
                  className={`text-sm mt-0.5 ${
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
