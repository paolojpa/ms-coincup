import { readBody } from "@/lib/body";
import { pay } from "@/lib/ledger";
import { buildPlan } from "@/lib/plan";
import { checksum, signedIn, unauthorized } from "@/lib/server";

/** Recalcula tudo a partir dos CSVs e credita. Nada do cálculo vem do navegador. */
export async function POST(req: Request) {
  if (!(await signedIn())) return unauthorized();
  const body = readBody(await req.json().catch(() => null));
  if (!body.ok) return Response.json({ error: body.error }, { status: 400 });
  const plan = await buildPlan(body.files, body.tiers, body.mode);
  const result = await pay({
    checksum: checksum([body.mode, ...body.files.map((f) => f.text).sort()]),
    name: body.name,
    mode: body.mode,
    files: body.files.map((f) => f.name),
    credits: plan.credits,
  });
  if (!result.ok) return Response.json({ error: result.error }, { status: 409 });
  return Response.json(result);
}
