import { useState, type FormEvent } from "react";

export function AdminLogin({
  error,
  busy,
  onLogin,
}: {
  error: string | null;
  busy: boolean;
  onLogin: (event: FormEvent, password: string) => Promise<void>;
}) {
  const [password, setPassword] = useState("");

  return (
    <div className="min-h-screen">
      <div className="mx-auto w-full max-w-md px-6 py-20">
        <h1 className="text-4xl font-bold">Vortyx Admin</h1>
        <p className="mt-3 opacity-80">
          Sign in to manage sites, posts, and content generation.
        </p>
        <form
          onSubmit={(event) => void onLogin(event, password)}
          className="mt-8 space-y-4 rounded-2xl border border-white/10 bg-white/5 p-6"
        >
          <label className="block">
            <span className="font-mono text-xs uppercase tracking-[0.2em] opacity-70">
              Password
            </span>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="mt-2 w-full rounded-lg border border-white/15 bg-black/30 px-3 py-2"
              autoComplete="current-password"
              required
            />
          </label>
          {error && <p className="text-sm text-red-400">{error}</p>}
          <button
            type="submit"
            disabled={busy}
            className="w-full rounded-lg bg-violet-600 px-4 py-2 font-medium hover:bg-violet-500 disabled:opacity-50"
          >
            {busy ? "Signing in…" : "Sign in"}
          </button>
        </form>
      </div>
    </div>
  );
}
