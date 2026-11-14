import "server-only";
import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { MongoClient, type Db } from "mongodb";
import { cookies } from "next/headers";

/**
 * Conexão, sessão e configuração. Tudo vem das variáveis de ambiente:
 * MONGODB_URI (com permissão de escrita), MONGODB_DB (padrão "test"),
 * GUILD_ID, PANEL_PASSWORD e SESSION_SECRET.
 */

declare global {
  // eslint-disable-next-line no-var
  var __cpClient: Promise<MongoClient> | undefined;
}

export async function db(): Promise<Db> {
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error("MONGODB_URI is not set.");
  if (!global.__cpClient) {
    global.__cpClient = new MongoClient(uri, { maxPoolSize: 3, serverSelectionTimeoutMS: 8_000 })
      .connect()
      .catch((error) => {
        global.__cpClient = undefined;
        throw error;
      });
  }
  return (await global.__cpClient).db(process.env.MONGODB_DB || "test");
}

/** Season e guild em curso, como o bot e o site leem (`guildconfigs`). */
export async function botConfig(): Promise<{ guildId: string; season: number }> {
  const configs = await (await db())
    .collection<{ guildId: string; season: number }>("guildconfigs")
    .find({}, { projection: { guildId: 1, season: 1 } })
    .toArray();
  const config = configs.find((c) => c.guildId === process.env.GUILD_ID) ?? configs[0];
  if (!config) throw new Error("No guildconfigs document found.");
  return { guildId: config.guildId, season: config.season };
}

const COOKIE = "cp_session";
const DAY = 24 * 60 * 60 * 1000;

function sign(value: string): string {
  const secret = process.env.SESSION_SECRET;
  if (!secret || secret.length < 16) throw new Error("SESSION_SECRET is not set.");
  return createHmac("sha256", secret).update(value).digest("base64url");
}

export function checkPassword(input: string): boolean {
  const expected = process.env.PANEL_PASSWORD;
  if (!expected) return false;
  const a = createHash("sha256").update(input).digest();
  const b = createHash("sha256").update(expected).digest();
  return timingSafeEqual(a, b);
}

export async function startSession(): Promise<void> {
  const expires = Date.now() + 7 * DAY;
  (await cookies()).set(COOKIE, `${expires}.${sign(String(expires))}`, {
    httpOnly: true,
    secure: true,
    sameSite: "strict",
    path: "/",
    maxAge: 7 * 24 * 60 * 60,
  });
}

export async function endSession(): Promise<void> {
  (await cookies()).delete(COOKIE);
}

export async function signedIn(): Promise<boolean> {
  const raw = (await cookies()).get(COOKIE)?.value ?? "";
  const [expires, mac] = raw.split(".");
  if (!expires || !mac || Number(expires) < Date.now()) return false;
  try {
    const good = Buffer.from(sign(expires));
    const got = Buffer.from(mac);
    return good.length === got.length && timingSafeEqual(good, got);
  } catch {
    return false;
  }
}

export function unauthorized() {
  return Response.json({ error: "Not signed in." }, { status: 401 });
}

export function checksum(parts: string[]): string {
  const h = createHash("sha256");
  for (const p of parts) h.update(p).update("\0");
  return h.digest("hex");
}
