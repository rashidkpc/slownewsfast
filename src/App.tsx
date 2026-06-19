import { useState, useEffect } from "react";
import { Routes, Route, useNavigate } from "react-router-dom";
import Home from "./pages/Home";
import FeedSettings from "./pages/FeedSettings";

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
        className="w-full max-w-sm rounded-xl border border-zinc-800 bg-zinc-900 p-8 space-y-4"
      >
        <h1 className="text-xl font-bold text-white">slownewsfast</h1>
        <p className="text-sm text-zinc-400">Enter the password to continue.</p>
        <div>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Password"
            className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-4 py-2.5 text-zinc-200 placeholder:text-zinc-500 focus:border-zinc-500 focus:outline-none"
            autoFocus
          />
        </div>
        {error && <p className="text-sm text-red-400">{error}</p>}
        <button
          type="submit"
          disabled={loading || !password}
          className="w-full rounded-lg bg-white px-6 py-2.5 text-sm font-semibold text-zinc-950 hover:bg-zinc-200 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
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

  if (authed === null) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-zinc-950">
        <p className="text-zinc-500">Loading...</p>
      </div>
    );
  }

  if (!authed) {
    return (
      <div className="min-h-screen bg-zinc-950 text-zinc-200">
        <LoginForm onLogin={() => setAuthed(true)} />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-200">
      <header className="flex items-center justify-between border-b border-zinc-800 px-6 py-4">
        <div>
          <a href="/" className="text-lg font-semibold tracking-tight text-white">
            slownewsfast
          </a>
          <span className="ml-2 text-sm text-zinc-500">
            newsletters to feeds
          </span>
        </div>
        <button
          onClick={handleLogout}
          className="text-sm text-zinc-500 hover:text-zinc-300 transition-colors"
        >
          Log out
        </button>
      </header>
      <main className="mx-auto max-w-2xl px-6 py-12">
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/feeds/:publicId" element={<FeedSettings />} />
        </Routes>
      </main>
    </div>
  );
}
