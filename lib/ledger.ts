import "server-only";
import { ObjectId, type AnyBulkWriteOperation } from "mongodb";
import { botConfig, db } from "./server";

/**
 * Registro de cada pagamento em `coin_payouts`. O campo `active` existe só em
 * pagamentos válidos, e um índice único parcial em `checksum` impede pagar duas
 * vezes os mesmos CSVs (mesmo com dois cliques ao mesmo tempo). Desfazer o
 * pagamento tira o `active`, liberando os mesmos arquivos para um novo pagamento.
 */

export type PayoutDoc = {
  _id: ObjectId;
  checksum: string;
  name: string;
  mode: "sum" | "separate";
  files: string[];
  status: "pending" | "done" | "reverted";
  active?: true;
  guildId: string;
  season: number;
  credits: { discordId: string; coins: number }[];
  totalCoins: number;
  createdAt: Date;
  revertedAt?: Date;
};

type PlayerDoc = {
  playerKey: string;
  guildId: string;
  season: number;
  discordId: string;
  wallet: number;
};

let indexed = false;
async function payouts() {
  const col = (await db()).collection<PayoutDoc>("coin_payouts");
  if (!indexed) {
    await col.createIndex({ checksum: 1 }, { unique: true, partialFilterExpression: { active: true } });
    await col.createIndex({ createdAt: -1 });
    indexed = true;
  }
  return col;
}

function walletOps(
  credits: { discordId: string; coins: number }[],
  config: { guildId: string; season: number },
  sign: 1 | -1,
): AnyBulkWriteOperation<PlayerDoc>[] {
  const now = new Date();
  return credits.map(({ discordId, coins }) => {
    const filter = { playerKey: `discord:${discordId}`, guildId: config.guildId, season: config.season };
    if (sign === 1)
      return {
        updateOne: {
          filter,
          // Mesmo formato do registro que o bot e o site criam.
          update: {
            $inc: { wallet: coins },
            $setOnInsert: {
              discordId,
              discordUsername: null,
              epicUsername: null,
              stats: { xp: 0, kills: 0, games: 0, wins: 0 },
              createdAt: now,
              __v: 0,
            },
          } as never,
          upsert: true,
        },
      };
    // Desfazer nunca deixa o saldo negativo (o jogador pode já ter gastado).
    return {
      updateOne: {
        filter,
        update: [{ $set: { wallet: { $max: [0, { $subtract: [{ $ifNull: ["$wallet", 0] }, coins] }] } } }],
      },
    };
  });
}

export async function pay(input: {
  checksum: string;
  name: string;
  mode: "sum" | "separate";
  files: string[];
  credits: Record<string, number>;
}): Promise<{ ok: true; id: string; totalCoins: number; players: number } | { ok: false; error: string }> {
  const config = await botConfig();
  const credits = Object.entries(input.credits)
    .filter(([, coins]) => coins > 0)
    .map(([discordId, coins]) => ({ discordId, coins }));
  if (!credits.length) return { ok: false, error: "Nobody to pay." };
  const totalCoins = credits.reduce((s, c) => s + c.coins, 0);

  const col = await payouts();
  const doc: PayoutDoc = {
    _id: new ObjectId(),
    checksum: input.checksum,
    name: input.name || input.files.join(", "),
    mode: input.mode,
    files: input.files,
    status: "pending",
    active: true,
    guildId: config.guildId,
    season: config.season,
    credits,
    totalCoins,
    createdAt: new Date(),
  };
  try {
    await col.insertOne(doc);
  } catch (error) {
    if ((error as { code?: number }).code === 11000)
      return { ok: false, error: "These files were already paid. Undo that payout first to pay again." };
    throw error;
  }

  await (await db()).collection<PlayerDoc>("players").bulkWrite(walletOps(credits, config, 1), { ordered: false });
  await col.updateOne({ _id: doc._id }, { $set: { status: "done" } });
  return { ok: true, id: doc._id.toHexString(), totalCoins, players: credits.length };
}

export async function revert(id: string): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!ObjectId.isValid(id)) return { ok: false, error: "Invalid id." };
  const col = await payouts();
  // Marca primeiro: dois cliques em "Undo" não descontam duas vezes.
  const doc = await col.findOneAndUpdate(
    { _id: new ObjectId(id), status: "done" },
    { $set: { status: "reverted", revertedAt: new Date() }, $unset: { active: "" } },
  );
  if (!doc) return { ok: false, error: "Payout not found or already undone." };
  await (await db())
    .collection<PlayerDoc>("players")
    .bulkWrite(walletOps(doc.credits, { guildId: doc.guildId, season: doc.season }, -1), { ordered: false });
  return { ok: true };
}

export async function history() {
  const col = await payouts();
  const docs = await col
    .find({}, { projection: { credits: 0 } })
    .sort({ createdAt: -1 })
    .limit(50)
    .toArray();
  return docs.map((d) => ({
    id: d._id.toHexString(),
    name: d.name,
    mode: d.mode,
    files: d.files,
    status: d.status,
    season: d.season,
    totalCoins: d.totalCoins,
    createdAt: d.createdAt,
    revertedAt: d.revertedAt ?? null,
  }));
}
