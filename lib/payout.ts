/**
 * Cálculo do pagamento de moedas a partir dos CSVs do Yunite.
 *
 * Roda igual no navegador (prévia instantânea) e no servidor (que recalcula
 * tudo antes de gravar, para não confiar no que veio do formulário).
 *
 * Formato esperado: o mesmo CSV de leaderboard que o bot já lê, com
 * "Placement", "Points" e, por jogador N, "Discord ID Player N",
 * "Discord Mention N", "Epic Name Player N" e "Discord Name Player N".
 */

export type Tier = { from: number; to: number | null; coins: number };

export type Mode = "sum" | "separate";

export type CsvInput = { name: string; text: string };

export type Member = {
  key: string;
  discordId: string | null;
  epicName: string | null;
  discordName: string | null;
};

export type Team = {
  key: string;
  members: Member[];
  /** Nome da equipe no CSV ("Team Name"), quando existe. */
  name: string | null;
  points: number;
  games: number;
  wins: number;
  kills: number;
  bestPlacement: number;
  files: string[];
};

export type RankedTeam = Team & { place: number; coins: number };

export type Payout = {
  file: string | null;
  teamSize: number;
  teams: RankedTeam[];
  warnings: string[];
};

export const DEFAULT_TIERS: Tier[] = [
  { from: 1, to: 1, coins: 150_000 },
  { from: 2, to: 2, coins: 100_000 },
  { from: 3, to: 5, coins: 50_000 },
  { from: 6, to: 10, coins: 30_000 },
  { from: 11, to: 25, coins: 17_500 },
  { from: 26, to: 50, coins: 10_000 },
  { from: 51, to: 100, coins: 5_500 },
  { from: 101, to: 250, coins: 3_000 },
  { from: 251, to: 500, coins: 1_750 },
  { from: 501, to: 1000, coins: 1_500 },
  { from: 1001, to: null, coins: 1_000 },
];

/** CSV com aspas, vírgulas e quebras de linha dentro de campo. */
export function parseCsv(text: string): Record<string, string>[] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  const src = text.replace(/^﻿/, "");
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (quoted) {
      if (ch === '"') {
        if (src[i + 1] === '"') {
          field += '"';
          i++;
        } else quoted = false;
      } else field += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ",") {
      row.push(field);
      field = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && src[i + 1] === "\n") i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else field += ch;
  }
  if (field !== "" || row.length) {
    row.push(field);
    rows.push(row);
  }
  const nonEmpty = rows.filter((r) => r.some((c) => c.trim() !== ""));
  if (!nonEmpty.length) return [];
  const header = nonEmpty[0].map((h) => h.trim());
  return nonEmpty.slice(1).map((r) => {
    const out: Record<string, string> = {};
    header.forEach((h, idx) => (out[h] = (r[idx] ?? "").trim()));
    return out;
  });
}

function num(value: string | undefined): number {
  const n = Number(String(value ?? "").replace(/[^\d.-]/g, ""));
  return Number.isFinite(n) ? n : 0;
}

/** Acha a coluna pelo nome, sem diferenciar maiúsculas. */
function col(row: Record<string, string>, ...names: string[]): string | undefined {
  const keys = Object.keys(row);
  for (const name of names) {
    const hit = keys.find((k) => k.toLowerCase() === name.toLowerCase());
    if (hit) return row[hit];
  }
  return undefined;
}

export function detectTeamSize(row: Record<string, string>): number {
  for (let n = 4; n >= 1; n--) {
    if (
      col(row, `Discord ID Player ${n}`, `Discord Mention ${n}`, `Epic Name Player ${n}`, `Discord Name Player ${n}`) !==
      undefined
    )
      return n;
  }
  return 0;
}

const SNOWFLAKE = /^\d{17,20}$/;

function memberFrom(row: Record<string, string>, n: number): Member | null {
  const rawId = col(row, `Discord ID Player ${n}`) ?? "";
  const mention = col(row, `Discord Mention ${n}`) ?? "";
  const fromMention = mention.match(/(\d{17,20})/)?.[1] ?? "";
  const discordId = SNOWFLAKE.test(rawId) ? rawId : fromMention || null;
  const epicName = col(row, `Epic Name Player ${n}`) || null;
  const discordName = col(row, `Discord Name Player ${n}`) || null;
  if (discordId) return { key: `discord:${discordId}`, discordId, epicName, discordName };
  if (epicName) return { key: `epic:${epicName.toLowerCase()}`, discordId: null, epicName, discordName };
  if (discordName) return { key: `name:${discordName.toLowerCase()}`, discordId: null, epicName, discordName };
  return null;
}

/** Equipes de um CSV. A chave da equipe é o conjunto dos jogadores. */
export function teamsFromCsv(input: CsvInput): { teams: Team[]; teamSize: number; warnings: string[] } {
  const rows = parseCsv(input.text);
  const warnings: string[] = [];
  if (!rows.length) return { teams: [], teamSize: 0, warnings: [`${input.name}: empty file.`] };
  const teamSize = detectTeamSize(rows[0]);
  if (!teamSize) warnings.push(`${input.name}: no player columns found.`);
  if (col(rows[0], "Points", "Total Points", "Puntos", "Pontos") === undefined)
    warnings.push(`${input.name}: no "Points" column, ranking uses the "Placement" column only.`);

  const teams: Team[] = [];
  rows.forEach((row, idx) => {
    const members: Member[] = [];
    for (let n = 1; n <= teamSize; n++) {
      const m = memberFrom(row, n);
      if (m && !members.some((x) => x.key === m.key)) members.push(m);
    }
    if (!members.length) {
      warnings.push(`${input.name}: row ${idx + 2} has no players, skipped.`);
      return;
    }
    const placement = num(col(row, "Placement", "Place", "Rank")) || idx + 1;
    teams.push({
      key: members.map((m) => m.key).sort().join("|"),
      members,
      name: col(row, "Team Name", "Team", "Nombre del equipo") || null,
      games: num(col(row, "Games", "Matches", "Partidas")),
      points: num(col(row, "Points", "Total Points", "Puntos", "Pontos")),
      wins: num(col(row, "Wins")),
      kills: num(col(row, "Kills", "Elims", "Eliminations")),
      bestPlacement: placement,
      files: [input.name],
    });
  });
  return { teams, teamSize, warnings };
}

export function coinsForPlace(place: number, tiers: Tier[]): number {
  const tier = tiers.find((t) => place >= t.from && (t.to === null || place <= t.to));
  return tier?.coins ?? 0;
}

/**
 * Divide as moedas da equipe entre os integrantes: cada um recebe a mesma parte,
 * calculada sobre o tamanho do modo (um trio divide por 3 mesmo que falte alguém
 * no CSV). A sobra da divisão inteira vai uma moeda por vez a partir do 1º.
 */
export function splitCoins(coins: number, teamSize: number, count: number): number[] {
  const size = Math.max(teamSize, count, 1);
  const base = Math.floor(coins / size);
  const rest = coins - base * size;
  return Array.from({ length: count }, (_, i) => base + (i < rest ? 1 : 0));
}

function rank(teams: Team[], tiers: Tier[], byPoints: boolean): RankedTeam[] {
  const sorted = [...teams].sort((a, b) =>
    byPoints
      ? b.points - a.points || b.wins - a.wins || b.kills - a.kills || a.bestPlacement - b.bestPlacement
      : a.bestPlacement - b.bestPlacement,
  );
  return sorted.map((t, i) => {
    const place = byPoints ? i + 1 : t.bestPlacement;
    return { ...t, place, coins: coinsForPlace(place, tiers) };
  });
}

/**
 * "sum": junta os CSVs numa tabela final, somando pontos/vitórias/kills de cada
 * equipe (mesmos jogadores). "separate": cada CSV é um torneio e paga sozinho,
 * pela posição do próprio CSV.
 */
export function computePayouts(inputs: CsvInput[], tiers: Tier[], mode: Mode): Payout[] {
  const parsed = inputs.map((input) => ({ input, ...teamsFromCsv(input) }));

  if (mode === "separate") {
    return parsed.map((p) => ({
      file: p.input.name,
      teamSize: p.teamSize,
      teams: rank(p.teams, tiers, false),
      warnings: p.warnings,
    }));
  }

  const warnings = parsed.flatMap((p) => p.warnings);
  const sizes = new Set(parsed.map((p) => p.teamSize).filter(Boolean));
  if (sizes.size > 1) warnings.push(`Files have different team sizes (${[...sizes].join(", ")}).`);
  const teamSize = Math.max(0, ...parsed.map((p) => p.teamSize));

  const merged = new Map<string, Team>();
  for (const p of parsed) {
    for (const t of p.teams) {
      const prev = merged.get(t.key);
      if (!prev) merged.set(t.key, { ...t, members: [...t.members], files: [...t.files] });
      else {
        prev.points += t.points;
        prev.games += t.games;
        prev.name = prev.name ?? t.name;
        prev.wins += t.wins;
        prev.kills += t.kills;
        prev.bestPlacement = Math.min(prev.bestPlacement, t.bestPlacement);
        prev.files.push(...t.files);
      }
    }
  }

  // Jogador que aparece em duas equipes diferentes: trocou de trio no meio.
  const seen = new Map<string, number>();
  for (const t of merged.values()) for (const m of t.members) seen.set(m.key, (seen.get(m.key) ?? 0) + 1);
  for (const [key, count] of seen)
    if (count > 1) warnings.push(`${key} appears in ${count} different teams; each team is ranked on its own.`);

  const anyPoints = parsed.some((p) => p.teams.some((t) => t.points !== 0));
  if (!anyPoints) warnings.push("No points found in any file, so the final table cannot be combined reliably.");
  return [{ file: null, teamSize, teams: rank([...merged.values()], tiers, true), warnings }];
}

/** Valida a tabela de prêmios vinda do formulário. */
export function cleanTiers(raw: unknown): Tier[] | null {
  if (!Array.isArray(raw) || !raw.length || raw.length > 50) return null;
  const tiers: Tier[] = [];
  for (const t of raw) {
    const from = Number((t as Tier)?.from);
    const toRaw = (t as Tier)?.to;
    const to = toRaw === null || toRaw === undefined || (toRaw as unknown) === "" ? null : Number(toRaw);
    const coins = Number((t as Tier)?.coins);
    if (!Number.isInteger(from) || from < 1) return null;
    if (to !== null && (!Number.isInteger(to) || to < from)) return null;
    if (!Number.isInteger(coins) || coins < 0 || coins > 10_000_000) return null;
    tiers.push({ from, to, coins });
  }
  return tiers.sort((a, b) => a.from - b.from);
}
