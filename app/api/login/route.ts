import { checkPassword, startSession } from "@/lib/server";

const attempts = new Map<string, { n: number; at: number }>();

export async function POST(req: Request) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "?";
  const now = Date.now();
  const a = attempts.get(ip);
  if (a && now - a.at < 10 * 60_000 && a.n >= 8)
    return Response.json({ error: "Too many attempts. Try again later." }, { status: 429 });

  const { password } = (await req.json().catch(() => ({}))) as { password?: string };
  if (!checkPassword(String(password ?? ""))) {
    attempts.set(ip, { n: (a && now - a.at < 10 * 60_000 ? a.n : 0) + 1, at: a && now - a.at < 10 * 60_000 ? a.at : now });
    return Response.json({ error: "Wrong password." }, { status: 401 });
  }
  attempts.delete(ip);
  await startSession();
  return Response.json({ ok: true });
}
