import { useState, useEffect } from "react";
import { Routes, Route, useNavigate, Navigate, Link } from "react-router-dom";
import { Home as HomeIcon } from "lucide-react";
import Home from "./pages/Home";
import FeedSettings from "./pages/FeedSettings";
import Feeds from "./pages/Feeds";
import FeedEntries from "./pages/FeedEntries";
import SourceEntries from "./pages/SourceEntries";

function LoginForm({ onLogin }: { onLogin: () => void }) {
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      if (!res.ok) {
        const data: { error?: string } = await res.json();
        setError(data.error || "Invalid password");
        return;
      }
      onLogin();
    } catch {
      setError("Network error");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-[60vh] items-center justify-center">
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-sm rounded-lg border-2 border-stone-300 bg-white p-8 space-y-4"
      >
        <h1 className="text-xl font-bold text-stone-900">slownews</h1>
        <p className="text-sm text-stone-500">Enter the password to continue.</p>
        <div>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Password"
            className="w-full border-2 border-stone-300 bg-stone-50 px-4 py-2.5 text-stone-800 placeholder:text-stone-400 focus:border-stone-500 focus:outline-none"
            autoFocus
          />
        </div>
        {error && <p className="text-sm text-red-600">{error}</p>}
        <button
          type="submit"
          disabled={loading || !password}
          className="w-full border-2 border-stone-800 bg-stone-800 px-6 py-2.5 text-sm font-bold text-white hover:bg-stone-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors cursor-pointer"
        >
          {loading ? "Checking..." : "Sign in"}
        </button>
      </form>
    </div>
  );
}

export default function App() {
  const [authed, setAuthed] = useState<boolean | null>(null);
  const navigate = useNavigate();

  useEffect(() => {
    fetch("/api/auth-check")
      .then((r) => r.json() as unknown as { authenticated: boolean })
      .then((data) => setAuthed(data.authenticated === true))
      .catch(() => setAuthed(false));
  }, []);

  const handleLogout = async () => {
    await fetch("/api/logout", { method: "POST" });
    setAuthed(false);
    navigate("/");
  };

  const handleLogin = () => {
    setAuthed(true);
    navigate("/feeds", { replace: true });
  };

  if (authed === null) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-stone-50">
        <p className="text-stone-500">Loading...</p>
      </div>
    );
  }

  if (!authed) {
    return (
      <div className="min-h-screen bg-stone-50 text-stone-800">
        <LoginForm onLogin={handleLogin} />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-stone-50 text-stone-800">
      <header className="border-b-2 border-stone-300 bg-white px-6 py-4">
        <div className="mx-auto flex max-w-5xl items-center justify-between">
          <Link to="/feeds" className="text-xl font-bold tracking-tight text-stone-900">
            slownews
          </Link>
          <div className="flex items-center gap-3">
            <Link
              to="/feeds"
              className="text-stone-500 hover:text-stone-800 transition-colors"
              title="Feeds"
            >
              <HomeIcon size={18} />
            </Link>
            <button
              onClick={handleLogout}
              className="text-sm text-stone-500 hover:text-stone-800 transition-colors cursor-pointer"
            >
              Log out
            </button>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-3xl px-6 py-12">
        <Routes>
          <Route path="/" element={<Navigate to="/feeds" replace />} />
          <Route path="/new" element={<Home />} />
          <Route path="/feeds" element={<Feeds />} />
          <Route path="/feeds/:publicId" element={<FeedSettings />} />
          <Route path="/feeds/:publicId/entries" element={<FeedEntries />} />
          <Route path="/feeds/:publicId/sources" element={<SourceEntries />} />
        </Routes>
      </main>
    </div>
  );
}
