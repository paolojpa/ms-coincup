"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { computePayouts, DEFAULT_TIERS, splitCoins, type Mode, type Tier } from "@/lib/payout";
import type { Plan } from "@/lib/plan";

type FileItem = { name: string; text: string };
type HistoryItem = {
  id: string;
  name: string;
  mode: Mode;
  files: string[];
  status: "pending" | "done" | "reverted";
  season: number;
  totalCoins: number;
  createdAt: string;
  revertedAt: string | null;
};

const fmt = (n: number) => n.toLocaleString("es-ES");

async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: { "content-type": "application/json", ...(init?.headers ?? {}) },
  });
  if (res.status === 401) {
    window.location.href = "/login";
    throw new Error("Not signed in.");
  }
  const data = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) throw new Error(data.error ?? (res.status >= 500 ? "Server error. Check the database settings (MONGODB_URI)." : `Error ${res.status}`));
  return data;
}

export default function Panel() {
  const [name, setName] = useState("");
  // Sempre uma tabela final somando todos os CSVs (o modo "separate" saiu do painel).
  const mode = "sum" as Mode;
  const [files, setFiles] = useState<FileItem[]>([]);
  const [tiers, setTiers] = useState<Tier[]>(DEFAULT_TIERS);
  const [savedTiers, setSavedTiers] = useState<string>(JSON.stringify(DEFAULT_TIERS));
  const [plan, setPlan] = useState<Plan | null>(null);
  const [alreadyPaid, setAlreadyPaid] = useState<{ name: string; at: string } | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [over, setOver] = useState(false);
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const input = useRef<HTMLInputElement>(null);

  const loadHistory = useCallback(async () => {
    const data = await api<{ payouts: HistoryItem[] }>("/api/payouts");
    setHistory(data.payouts);
  }, []);

  useEffect(() => {
    api<{ tiers: Tier[] }>("/api/tiers")
      .then((d) => {
        setTiers(d.tiers);
        setSavedTiers(JSON.stringify(d.tiers));
      })
      .catch((e: Error) => setError(e.message));
    loadHistory().catch(() => {});
  }, [loadHistory]);

  // Qualquer mudança invalida a prévia: o pagamento tem que ser do que se vê.
  useEffect(() => {
    setPlan(null);
    setConfirming(false);
    setAlreadyPaid(null);
  }, [files, tiers, mode]);

  async function addFiles(list: FileList | null) {
    if (!list) return;
    const read = await Promise.all(
      [...list]
        .filter((f) => f.name.toLowerCase().endsWith(".csv") || f.type.includes("csv"))
        .map(async (f) => ({ name: f.name, text: await f.text() })),
    );
    setFiles((prev) => [...prev, ...read.filter((r) => !prev.some((p) => p.name === r.name && p.text === r.text))]);
  }

  function setTier(i: number, key: keyof Tier, value: string) {
    setTiers((prev) =>
      prev.map((t, idx) =>
        idx !== i ? t : { ...t, [key]: key === "to" && value === "" ? null : Math.max(0, Math.floor(Number(value) || 0)) },
      ),
    );
  }

  async function saveTiers() {
    setError("");
    try {
      const d = await api<{ tiers: Tier[] }>("/api/tiers", { method: "PUT", body: JSON.stringify({ tiers }) });
      setTiers(d.tiers);
      setSavedTiers(JSON.stringify(d.tiers));
      setNotice("Prize table saved.");
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function preview() {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const d = await api<{ plan: Plan; alreadyPaid: { name: string; at: string } | null }>("/api/preview", {
        method: "POST",
        body: JSON.stringify({ files, tiers, mode, name }),
      });
      setPlan(d.plan);
      setAlreadyPaid(d.alreadyPaid);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function pay() {
    setBusy(true);
    setError("");
    try {
      const d = await api<{ totalCoins: number; players: number }>("/api/payout", {
        method: "POST",
        body: JSON.stringify({ files, tiers, mode, name }),
      });
      setNotice(`Paid ${fmt(d.totalCoins)} coins to ${fmt(d.players)} players.`);
      setFiles([]);
      setName("");
      await loadHistory();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
      setConfirming(false);
    }
  }

  async function undo(item: HistoryItem) {
    if (!window.confirm(`Undo "${item.name}"? ${fmt(item.totalCoins)} coins will be taken back (never below 0).`)) return;
    setError("");
    try {
      await api("/api/revert", { method: "POST", body: JSON.stringify({ id: item.id }) });
      setNotice(`Undone: ${item.name}.`);
      await loadHistory();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function clearUndone() {
    const count = history.filter((h) => h.status === "reverted").length;
    if (!window.confirm(`Delete ${count} undone ${count === 1 ? "payout" : "payouts"} from the history? Paid ones stay.`)) return;
    setError("");
    try {
      const d = await api<{ deleted: number }>("/api/payouts", { method: "DELETE" });
      setNotice(`Removed ${d.deleted} undone ${d.deleted === 1 ? "payout" : "payouts"} from the history.`);
      await loadHistory();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function logout() {
    await fetch("/api/logout", { method: "POST" });
    window.location.href = "/login";
  }

  const tiersChanged = JSON.stringify(tiers) !== savedTiers;

  // Tabela geral: calculada no navegador a cada CSV, sem tocar no banco.
  const standings = useMemo(() => (files.length ? computePayouts(files, tiers, mode) : []), [files, tiers, mode]);
  const [boardFile, setBoardFile] = useState(0);
  const [query, setQuery] = useState("");
  const board = standings[Math.min(boardFile, Math.max(0, standings.length - 1))];
  const boardRows = useMemo(() => {
    if (!board) return [];
    const q = query.trim().toLowerCase();
    return board.teams.filter(
      (t) =>
        !q ||
        t.members.some((m) => [m.epicName, m.discordName, m.discordId].some((v) => v?.toLowerCase().includes(q))),
    );
  }, [board, query]);

  // Transmissão: com "Live on stream" ligado, cada mudança na tabela vai para /stream.
  const [live, setLive] = useState(false);
  const [liveNote, setLiveNote] = useState("");
  useEffect(() => {
    if (!live || !board) return;
    const id = setTimeout(async () => {
      try {
        await api("/api/board", {
          method: "PUT",
          body: JSON.stringify({
            title: name,
            subtitle: mode === "sum" ? `${files.length} ${files.length === 1 ? "partida" : "partidas"}` : board.file ?? "",
            showPoints: mode === "sum",
            rows: board.teams.slice(0, 500).map((t) => ({
              place: t.place,
              players: t.members.map((m) => m.epicName ?? m.discordName ?? "?"),
              games: t.games,
              kills: t.kills,
              wins: t.wins,
              points: t.points,
              prize: t.coins,
            })),
          }),
        });
        setLiveNote(`Stream updated ${new Date().toLocaleTimeString()}`);
      } catch (e) {
        setLiveNote((e as Error).message);
      }
    }, 800);
    return () => clearTimeout(id);
  }, [live, board, name, mode, files.length]);

  return (
    <main>
      <div className="top">
        <div className="brand">
          <span className="dot" />
          <h1>Coin payouts</h1>
        </div>
        <button className="ghost" onClick={logout}>
          Sign out
        </button>
      </div>

      <div className="grid">
        <section className="panel">
          <h2>1 · Tournament</h2>
          <input type="text" placeholder="Name (optional, for the history)" value={name} onChange={(e) => setName(e.target.value)} />
          <div style={{ marginTop: 14 }}>
            <p className="muted" style={{ fontSize: 13, margin: "8px 0 0" }}>
              Points, wins and kills of the same team are added up across all files; the final table ranks by points (ties:
              wins, kills, best placement).
            </p>
          </div>

          <div
            className={`drop${over ? " over" : ""}`}
            style={{ marginTop: 16 }}
            onClick={() => input.current?.click()}
            onDragOver={(e) => {
              e.preventDefault();
              setOver(true);
            }}
            onDragLeave={() => setOver(false)}
            onDrop={(e) => {
              e.preventDefault();
              setOver(false);
              addFiles(e.dataTransfer.files);
            }}
          >
            Drop the Yunite CSV files here, or tap to choose
            <input
              ref={input}
              type="file"
              accept=".csv,text/csv"
              multiple
              hidden
              onChange={(e) => {
                addFiles(e.target.files);
                e.target.value = "";
              }}
            />
          </div>
          {files.length > 0 && (
            <ul className="files">
              {files.map((f, i) => (
                <li key={`${f.name}-${i}`}>
                  <span>{f.name}</span>
                  <button className="ghost" onClick={() => setFiles((prev) => prev.filter((_, idx) => idx !== i))}>
                    Remove
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="panel">
          <h2>2 · Prizes per team</h2>
          <table className="tiers">
            <thead>
              <tr>
                <th>From</th>
                <th>To</th>
                <th className="num">Coins</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {tiers.map((t, i) => (
                <tr key={i}>
                  <td>
                    <input type="number" min={1} value={t.from} onChange={(e) => setTier(i, "from", e.target.value)} />
                  </td>
                  <td>
                    <input
                      type="number"
                      min={1}
                      placeholder="∞"
                      value={t.to ?? ""}
                      onChange={(e) => setTier(i, "to", e.target.value)}
                    />
                  </td>
                  <td>
                    <input type="number" min={0} value={t.coins} onChange={(e) => setTier(i, "coins", e.target.value)} />
                  </td>
                  <td>
                    <button className="ghost" aria-label="Remove row" onClick={() => setTiers((p) => p.filter((_, idx) => idx !== i))}>
                      ✕
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="row" style={{ marginTop: 10 }}>
            <button
              onClick={() => {
                const last = tiers[tiers.length - 1];
                const from = last ? (last.to ?? last.from) + 1 : 1;
                setTiers([...tiers, { from, to: from, coins: 0 }]);
              }}
            >
              Add row
            </button>
            <button onClick={() => setTiers(DEFAULT_TIERS)}>Reset</button>
            <button className="primary" disabled={!tiersChanged} onClick={saveTiers}>
              Save as default
            </button>
          </div>
          <p className="muted" style={{ fontSize: 13, margin: "10px 0 0" }}>
            Coins are per team and split equally among the members (a trio splits by 3).
          </p>
        </section>
      </div>

      {board && (
        <section className="panel">
          <div className="row" style={{ justifyContent: "space-between", marginBottom: 12 }}>
            <h2 style={{ margin: 0 }}>
              General table · {mode === "sum" ? `${files.length} ${files.length === 1 ? "file" : "files"} so far` : board.file}
            </h2>
            <input
              type="text"
              placeholder="Search player"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              style={{ maxWidth: 240 }}
            />
          </div>
          <div className="row" style={{ marginBottom: 12 }}>
            <label className="row" style={{ gap: 6, cursor: "pointer" }}>
              <input type="checkbox" checked={live} onChange={(e) => setLive(e.target.checked)} />
              Live on stream
            </label>
            <a href="/stream" target="_blank" rel="noreferrer" style={{ color: "var(--signal)" }}>
              Open stream page
            </a>
            <button
              className="ghost"
              onClick={async () => {
                setLive(false);
                await api("/api/board", { method: "DELETE" }).catch(() => {});
                setLiveNote("Stream cleared.");
              }}
            >
              Clear stream
            </button>
            {liveNote && <span className="muted" style={{ fontSize: 13 }}>{liveNote}</span>}
          </div>
          {mode === "separate" && standings.length > 1 && (
            <div className="seg" style={{ marginBottom: 12 }}>
              {standings.map((s, i) => (
                <button key={i} className={i === boardFile ? "on" : ""} onClick={() => setBoardFile(i)}>
                  {s.file}
                </button>
              ))}
            </div>
          )}
          <div className="scroll">
            <table>
              <thead>
                <tr>
                  <th className="num">Top</th>
                  <th>Team</th>
                  <th className="num">Games</th>
                  <th className="num">Kills</th>
                  <th className="num">W</th>
                  {mode === "sum" && <th className="num">Points</th>}
                  <th className="num">Coins each</th>
                </tr>
              </thead>
              <tbody>
                {boardRows.slice(0, 1000).map((t) => {
                  const each = splitCoins(t.coins, board.teamSize, t.members.length)[0] ?? 0;
                  return (
                    <tr key={t.key} className={t.place <= 3 ? `podium p${t.place}` : undefined}>
                      <td className="num">
                        <b>{t.place}</b>
                      </td>
                      <td style={{ fontWeight: 600 }}>{t.members.map((m) => m.epicName ?? m.discordName ?? m.discordId).join(" + ")}</td>
                      <td className="num">{fmt(t.games)}</td>
                      <td className="num">{fmt(t.kills)}</td>
                      <td className="num">{fmt(t.wins)}</td>
                      {mode === "sum" && <td className="num">{fmt(t.points)}</td>}
                      <td className="num">{fmt(each)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {boardRows.length > 1000 && (
            <p className="muted" style={{ fontSize: 13 }}>
              Showing the first 1,000 of {fmt(boardRows.length)} teams. Use the search to find the rest.
            </p>
          )}
        </section>
      )}

      <section className="panel">
        <div className="row" style={{ justifyContent: "space-between" }}>
          <h2 style={{ margin: 0 }}>3 · Preview and pay</h2>
          <button className="primary" disabled={!files.length || busy} onClick={preview}>
            {busy && !plan ? "Calculating…" : "Preview"}
          </button>
        </div>
        {error && <div className="err">{error}</div>}
        {notice && <div className="ok">{notice}</div>}

        {plan && (
          <div style={{ marginTop: 16 }}>
            <div className="stats">
              <div className="stat">
                <small>Teams</small>
                <b>{fmt(plan.totals.teams)}</b>
              </div>
              <div className="stat">
                <small>Players paid</small>
                <b>{fmt(plan.totals.paidPlayers)}</b>
              </div>
              <div className="stat">
                <small>Players not found</small>
                <b style={{ color: plan.totals.unpaidPlayers ? "var(--danger)" : undefined }}>{fmt(plan.totals.unpaidPlayers)}</b>
              </div>
              <div className="stat">
                <small>Total coins</small>
                <b>{fmt(plan.totals.coins)}</b>
              </div>
            </div>

            {alreadyPaid && (
              <div className="warn">
                These exact files were already paid ({alreadyPaid.name}, {new Date(alreadyPaid.at).toLocaleString()}). Undo it
                in the history to pay again.
              </div>
            )}
            {plan.warnings.length > 0 && (
              <div className="warn">
                Check before paying:
                <ul>
                  {plan.warnings.slice(0, 12).map((w, i) => (
                    <li key={i}>{w}</li>
                  ))}
                  {plan.warnings.length > 12 && <li>…and {plan.warnings.length - 12} more.</li>}
                </ul>
              </div>
            )}

            <div className="scroll">
              <table>
                <thead>
                  <tr>
                    <th className="num">#</th>
                    {mode === "separate" && <th>File</th>}
                    {mode === "sum" && <th className="num">Points</th>}
                    <th>Players (coins each)</th>
                    <th className="num">Team</th>
                  </tr>
                </thead>
                <tbody>
                  {plan.lines.slice(0, 1500).map((l, i) => (
                    <tr key={i}>
                      <td className="num">{l.place}</td>
                      {mode === "separate" && <td className="muted">{l.file}</td>}
                      {mode === "sum" && <td className="num">{fmt(l.points)}</td>}
                      <td>
                        {l.players.map((p, j) => (
                          <span
                            key={j}
                            className={`player${p.discordId ? "" : " unpaid"}`}
                            title={p.discordId ? `Discord ${p.discordId}` : "No Discord ID and no verified Epic name: not paid"}
                          >
                            {p.label}
                            <span className="muted">{fmt(p.coins)}</span>
                            {p.via === "epic" && <span className="tag">by Epic</span>}
                          </span>
                        ))}
                      </td>
                      <td className="num">{fmt(l.teamCoins)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {plan.lines.length > 1500 && (
              <p className="muted" style={{ fontSize: 13 }}>
                Showing the first 1,500 teams; all {fmt(plan.lines.length)} are paid.
              </p>
            )}

            <div className="row" style={{ marginTop: 16, justifyContent: "flex-end" }}>
              {!confirming ? (
                <button className="primary" disabled={busy || !plan.totals.coins || !!alreadyPaid} onClick={() => setConfirming(true)}>
                  Pay {fmt(plan.totals.coins)} coins
                </button>
              ) : (
                <>
                  <span className="muted">
                    Credit {fmt(plan.totals.coins)} coins to {fmt(Object.keys(plan.credits).length)} wallets?
                  </span>
                  <button onClick={() => setConfirming(false)} disabled={busy}>
                    Cancel
                  </button>
                  <button className="primary" onClick={pay} disabled={busy}>
                    {busy ? "Paying…" : "Confirm payment"}
                  </button>
                </>
              )}
            </div>
          </div>
        )}
      </section>

      <section className="panel">
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
          <h2>History</h2>
          {history.some((h) => h.status === "reverted") && (
            <button className="danger" onClick={clearUndone}>
              Clear undone
            </button>
          )}
        </div>
        {history.length === 0 ? (
          <p className="muted" style={{ margin: 0 }}>
            No payouts yet.
          </p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Date</th>
                <th>Name</th>
                <th className="num">Coins</th>
                <th>Status</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {history.map((h) => (
                <tr key={h.id}>
                  <td className="muted" style={{ whiteSpace: "nowrap" }}>
                    {new Date(h.createdAt).toLocaleString()}
                  </td>
                  <td>
                    {h.name}
                    <div className="muted" style={{ fontSize: 12 }}>
                      {h.mode === "sum" ? "Combined" : "Separate"} · {h.files.length} files · season {h.season}
                    </div>
                  </td>
                  <td className="num">{fmt(h.totalCoins)}</td>
                  <td>{h.status === "done" ? "Paid" : h.status === "reverted" ? "Undone" : "Incomplete"}</td>
                  <td className="num">
                    {h.status === "done" && (
                      <button className="danger" onClick={() => undo(h)}>
                        Undo
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </main>
  );
}
