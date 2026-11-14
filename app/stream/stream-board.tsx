"use client";

import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import type { Board } from "@/lib/board";

/**
 * Tabela para a transmissão (fonte de navegador no OBS). Mesmo visual do
 * ranking das Arenas do site (Archivo, número verde, selo inclinado): só a tabela, desde o 1º.
 * Atualiza sozinha a cada poucos segundos e, quando não cabe, passa as páginas.
 *
 * Parâmetros: ?lang=pt (padrão es), ?rows=14 (linhas por página),
 * ?rotate=12 (segundos por página), ?top=50 (mostra só até essa posição).
 */

const TEXT = {
  es: { board: "Tabla general", team: "Jugadores", games: "Partidas", updated: "Actualizado", waiting: "Esperando resultados…", of: "de" },
  pt: { board: "Tabela geral", team: "Jogadores", games: "Partidas", updated: "Atualizado", waiting: "Aguardando resultados…", of: "de" },
};


export default function StreamBoard() {
  const params = useSearchParams();
  const lang = params.get("lang") === "pt" ? "pt" : "es";
  const t = TEXT[lang];
  const perPage = Math.min(30, Math.max(4, Number(params.get("rows")) || 14));
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
  const rest = rows;
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

  return (
    <div className="stream">
      {!board || !rows.length ? (
        <p className="s-waiting">{t.waiting}</p>
      ) : (
        <>
          <div className="s-table">
            <div className={`s-row s-th${showPoints ? "" : " nopts"}`}>
              <span>#</span>
              <span>{t.team}</span>
              <span>{t.games}</span>
              <span>Kills</span>
              <span>W</span>
              {showPoints && <span>Pts</span>}
            </div>
            {shown.map((r) => (
              <div key={`${current}-${r.place}`} className={`s-row${showPoints ? "" : " nopts"}`} data-top={r.place <= 3 ? r.place : undefined}>
                <span className="s-pos">{r.place}</span>
                <span className="s-who">
                  <span className="s-team">{names(r.players)}</span>
                  {r.prize > 0 && <span className="s-slot">{number.format(r.prize)} coins</span>}
                </span>
                <span>{number.format(r.games)}</span>
                <span>{number.format(r.kills)}</span>
                <span>{number.format(r.wins)}</span>
                {showPoints && <span className="s-green">{number.format(r.points)}</span>}
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
        </>
      )}
    </div>
  );
}
