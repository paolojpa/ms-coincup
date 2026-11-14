import "server-only";
import { computePayouts, splitCoins, type CsvInput, type Mode, type Payout, type Tier } from "./payout";
import { db } from "./server";

/**
 * Plano de pagamento: o cálculo do CSV mais a identificação de cada jogador.
 * Quem veio sem Discord ID no CSV é procurado pelo nome da Epic entre os
 * verificados do site (`verified_players`). Quem não for encontrado aparece na
 * prévia como "not paid" e não recebe nada.
 */

export type PlanLine = {
  place: number;
  file: string | null;
  teamCoins: number;
  points: number;
  players: {
    label: string;
    discordId: string | null;
    coins: number;
    via: "csv" | "epic" | null;
  }[];
};

export type Plan = {
  lines: PlanLine[];
  warnings: string[];
  totals: { teams: number; paidPlayers: number; unpaidPlayers: number; coins: number };
  /** Moedas por Discord ID, já somadas (um jogador pode ganhar em mais de um CSV). */
  credits: Record<string, number>;
};

export async function buildPlan(inputs: CsvInput[], tiers: Tier[], mode: Mode): Promise<Plan> {
  const payouts: Payout[] = computePayouts(inputs, tiers, mode);

  const epicNames = new Set<string>();
  for (const p of payouts)
    for (const t of p.teams)
      for (const m of t.members) if (!m.discordId && m.epicName) epicNames.add(m.epicName.toLowerCase());

  const byEpic = new Map<string, string>();
  if (epicNames.size) {
    const found = await (await db())
      .collection<{ discordId: string; epicNameLower?: string }>("verified_players")
      .find({ epicNameLower: { $in: [...epicNames] } }, { projection: { discordId: 1, epicNameLower: 1 } })
      .toArray();
    for (const f of found) if (f.epicNameLower && f.discordId) byEpic.set(f.epicNameLower, f.discordId);
  }

  const lines: PlanLine[] = [];
  const credits: Record<string, number> = {};
  let paidPlayers = 0;
  let unpaidPlayers = 0;
  let coins = 0;

  for (const p of payouts) {
    for (const t of p.teams) {
      const shares = splitCoins(t.coins, p.teamSize, t.members.length);
      const players = t.members.map((m, i) => {
        const viaEpic = !m.discordId && m.epicName ? byEpic.get(m.epicName.toLowerCase()) ?? null : null;
        const discordId = m.discordId ?? viaEpic;
        const share = discordId ? shares[i] : 0;
        if (discordId && share > 0) {
          credits[discordId] = (credits[discordId] ?? 0) + share;
          coins += share;
          paidPlayers++;
        } else if (!discordId && shares[i] > 0) unpaidPlayers++;
        return {
          label: m.epicName ?? m.discordName ?? m.discordId ?? "?",
          discordId,
          coins: share,
          via: m.discordId ? ("csv" as const) : viaEpic ? ("epic" as const) : null,
        };
      });
      lines.push({ place: t.place, file: p.file, teamCoins: t.coins, points: t.points, players });
    }
  }

  return {
    lines,
    warnings: payouts.flatMap((p) => p.warnings),
    totals: { teams: lines.length, paidPlayers, unpaidPlayers, coins },
    credits,
  };
}
