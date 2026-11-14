import { readBody } from "@/lib/body";
import { buildPlan } from "@/lib/plan";
import { checksum, db, signedIn, unauthorized } from "@/lib/server";

export async function POST(req: Request) {
  if (!(await signedIn())) return unauthorized();
  const body = readBody(await req.json().catch(() => null));
  if (!body.ok) return Response.json({ error: body.error }, { status: 400 });
  const plan = await buildPlan(body.files, body.tiers, body.mode);
  const id = checksum([body.mode, ...body.files.map((f) => f.text).sort()]);
  const already = await (await db())
    .collection("coin_payouts")
    .findOne({ _id: id as never, status: { $ne: "reverted" } }, { projection: { createdAt: 1, name: 1 } });
  return Response.json({ plan, alreadyPaid: already ? { name: already.name, at: already.createdAt } : null });
}
