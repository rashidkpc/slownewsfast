import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { Pencil, Plus } from "lucide-react";
import FeedIcon from "../components/FeedIcon";

interface FeedItem {
  publicId: string;
  title: string;
  icon: string | null;
  emailIcon: string | null;
  email: string;
  feedUrl: string;
  createdAt: string;
}

export default function Feeds() {
  const [feeds, setFeeds] = useState<FeedItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  useEffect(() => {
    fetch("/api/feeds")
      .then((r) => r.json() as unknown as FeedItem[])
      .then((data) => setFeeds(data))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const filtered = feeds.filter(
    (f) =>
      f.title.toLowerCase().includes(search.toLowerCase()) ||
      f.email.toLowerCase().includes(search.toLowerCase()),
  );

  if (loading) {
    return <p className="text-stone-500">Loading...</p>;
  }

  return (
    <div className="space-y-4">
      <div className="flex gap-3">
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search feeds..."
          className="flex-1 border-2 border-stone-300 bg-white px-4 py-2.5 text-stone-800 placeholder:text-stone-400 focus:border-stone-500 focus:outline-none"
        />
        <Link
          to="/new"
          className="flex items-center justify-center border-2 border-stone-300 bg-white px-3 text-stone-500 hover:text-stone-800 hover:border-stone-500 transition-colors"
          title="Create feed"
        >
          <Plus size={18} />
        </Link>
      </div>

      {filtered.length === 0 ? (
        <p className="text-stone-500 text-center py-8">
          {search ? "No matching feeds." : "No feeds yet."}
        </p>
      ) : (
        filtered.map((feed) => (
          <div
            key={feed.publicId}
            className="border-2 border-stone-300 bg-white p-5"
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <FeedIcon
                  title={feed.title}
                  icon={feed.icon}
                  emailIcon={feed.emailIcon}
                  size="md"
                />
                <Link
                  to={`/feeds/${feed.publicId}/entries`}
                  className="text-lg font-bold text-stone-900 hover:text-stone-600 transition-colors"
                >
                  {feed.title}
                </Link>
              </div>
              <Link
                to={`/feeds/${feed.publicId}`}
                className="text-stone-400 hover:text-stone-700 transition-colors"
                title="Edit feed"
              >
                <Pencil size={16} />
              </Link>
            </div>
          </div>
        ))
      )}
    </div>
  );
}
