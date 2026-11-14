"use client";

import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import type { Board } from "@/lib/board";

/**
 * Tabela para a transmissão (fonte de navegador no OBS). Mesmo visual das
 * páginas de leaderboard e torneios do site: pódio do top 3 e a tabela abaixo.
 * Atualiza sozinha a cada poucos segundos e, quando não cabe, passa as páginas.
 *
 * Parâmetros: ?lang=pt (padrão es), ?rows=8 (linhas por página),
 * ?rotate=12 (segundos por página), ?top=50 (mostra só até essa posição).
 */

const TEXT = {
  es: { board: "Tabla general", team: "Jugadores", games: "Partidas", prize: "Premio", updated: "Actualizado", waiting: "Esperando resultados…", of: "de" },
  pt: { board: "Tabela geral", team: "Jogadores", games: "Partidas", prize: "Prêmio", updated: "Atualizado", waiting: "Aguardando resultados…", of: "de" },
};

const MEDAL = ["#ffd700", "#d8dde6", "#e08a4f"];

export default function StreamBoard() {
  const params = useSearchParams();
  const lang = params.get("lang") === "pt" ? "pt" : "es";
  const t = TEXT[lang];
  const perPage = Math.min(20, Math.max(4, Number(params.get("rows")) || 8));
  const rotate = Math.min(120, Math.max(4, Number(params.get("rotate")) || 12)) * 1000;
  const top = Number(params.get("top")) || 0;

  const [board, setBoard] = useState<Board | null>(null);
  const [page, setPage] = useState(0);
  const number = useMemo(() => new Intl.NumberFormat(lang === "es" ? "es-AR" : "pt-BR"), [lang]);

  useEffect(() => {
    let alive = true;
    const load = () =>
      fetch("/api/board", { cache: "no-store" })
        .then((r) => r.json())
        .then((d: { board: Board | null }) => alive && setBoard(d.board))
        .catch(() => {});
    load();
    const id = setInterval(load, 8000);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, []);

  const rows = useMemo(() => (board?.rows ?? []).filter((r) => !top || r.place <= top), [board, top]);
  const podium = rows.slice(0, 3);
  const rest = rows.slice(3);
  const pages = Math.max(1, Math.ceil(rest.length / perPage));

  useEffect(() => {
    if (pages <= 1) return setPage(0);
    const id = setInterval(() => setPage((p) => (p + 1) % pages), rotate);
    return () => clearInterval(id);
  }, [pages, rotate]);

  const current = page % pages;
  const shown = rest.slice(current * perPage, current * perPage + perPage);
  const showPoints = board?.showPoints !== false;
  const names = (players: string[]) => players.join(" + ");
  const updated = board ? new Date(board.updatedAt).toLocaleTimeString(lang === "es" ? "es-CL" : "pt-BR", { hour: "2-digit", minute: "2-digit" }) : "";

  return (
    <div className="stream">
      <header className="s-head">
        <div>
          <p className="s-eyebrow">
            <span className="s-dot" /> {t.board}
          </p>
          <h1 className="s-title">{board?.title || "Major Scrims"}</h1>
        </div>
        {board && (
          <p className="s-meta">
            {board.subtitle && <span>{board.subtitle} · </span>}
            {t.updated} {updated}
          </p>
        )}
      </header>

      {!board || !rows.length ? (
        <p className="s-waiting">{t.waiting}</p>
      ) : (
        <>
          <ol className="s-podium">
            {podium.map((r, i) => (
              <li
                key={r.place}
                className={`s-card${i === 0 ? " first" : ""}`}
                style={{
                  order: i === 0 ? 2 : i === 1 ? 1 : 3,
                  borderColor: `${MEDAL[i]}66`,
                  background: `radial-gradient(120% 80% at 50% 0%, ${MEDAL[i]}30, transparent 70%), rgba(255,255,255,.02)`,
                  boxShadow: i === 0 ? `0 0 60px ${MEDAL[i]}25` : undefined,
                }}
              >
                {i === 0 && <span className="s-crown">👑</span>}
                <span className="s-rank" style={{ color: MEDAL[i] }}>
                  #{r.place}
                </span>
                <span className="s-names">
                  {r.players.map((p, j) => (
                    <span key={j}>{p}</span>
                  ))}
                </span>
                {showPoints && (
                  <span className="s-pts">
                    {number.format(r.points)} <small>PTS</small>
                  </span>
                )}
                <span className="s-sub">
                  {number.format(r.kills)} kills · {number.format(r.wins)} W · {number.format(r.games)} {t.games.toLowerCase()}
                </span>
                {r.prize > 0 && <span className="s-prize">{number.format(r.prize)} coins</span>}
              </li>
            ))}
          </ol>

          {rest.length > 0 && (
            <div className="s-table">
              <div className={`s-row s-th${showPoints ? "" : " nopts"}`}>
                <span>#</span>
                <span>{t.team}</span>
                <span>{t.games}</span>
                <span>Kills</span>
                <span>W</span>
                {showPoints && <span>Pts</span>}
                <span>{t.prize}</span>
              </div>
              {shown.map((r) => (
                <div key={`${current}-${r.place}`} className={`s-row${showPoints ? "" : " nopts"}`}>
                  <span className="s-pos">{r.place}</span>
                  <span className="s-team">{names(r.players)}</span>
                  <span>{number.format(r.games)}</span>
                  <span>{number.format(r.kills)}</span>
                  <span>{number.format(r.wins)}</span>
                  {showPoints && <span className="s-green">{number.format(r.points)}</span>}
                  <span>{r.prize > 0 ? number.format(r.prize) : "—"}</span>
                </div>
              ))}
              {pages > 1 && (
                <p className="s-pager">
                  {shown[0]?.place}–{shown[shown.length - 1]?.place} {t.of} {rows[rows.length - 1]?.place}
                  <span className="s-dots">
                    {Array.from({ length: pages }, (_, i) => (
                      <i key={i} className={i === current ? "on" : ""} />
                    ))}
                  </span>
                </p>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
