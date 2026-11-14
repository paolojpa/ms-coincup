"use client";

import { useState } from "react";

export default function LoginPage() {
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const res = await fetch("/api/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ password }),
    });
    setBusy(false);
    if (res.ok) window.location.href = "/";
    else setError(((await res.json().catch(() => ({}))) as { error?: string }).error ?? "Error.");
  }

  return (
    <main>
      <form className="panel login" onSubmit={submit}>
        <div className="brand" style={{ marginBottom: 16 }}>
          <span className="dot" />
          <h1 style={{ fontSize: 20 }}>Coin payouts</h1>
        </div>
        <input type="password" placeholder="Password" value={password} onChange={(e) => setPassword(e.target.value)} autoFocus />
        <button className="primary" style={{ width: "100%", marginTop: 12 }} disabled={busy || !password}>
          Sign in
        </button>
        {error && <div className="err">{error}</div>}
      </form>
    </main>
  );
}
