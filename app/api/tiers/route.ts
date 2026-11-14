import { cleanTiers, DEFAULT_TIERS, type Tier } from "@/lib/payout";
import { db, signedIn, unauthorized } from "@/lib/server";

type Config = { _id: string; tiers: Tier[]; updatedAt: Date };

/** Tabela de prêmios salva (`coin_payout_config`). Sem nada salvo, a padrão. */
export async function GET() {
  if (!(await signedIn())) return unauthorized();
  const doc = await (await db()).collection<Config>("coin_payout_config").findOne({ _id: "tiers" });
  return Response.json({ tiers: doc?.tiers ?? DEFAULT_TIERS });
}

export async function PUT(req: Request) {
  if (!(await signedIn())) return unauthorized();
  const tiers = cleanTiers(((await req.json().catch(() => ({}))) as { tiers?: unknown }).tiers);
  if (!tiers) return Response.json({ error: "Invalid prize table." }, { status: 400 });
  await (await db())
    .collection<Config>("coin_payout_config")
    .updateOne({ _id: "tiers" }, { $set: { tiers, updatedAt: new Date() } }, { upsert: true });
  return Response.json({ tiers });
}
