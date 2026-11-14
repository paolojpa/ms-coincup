import { revert } from "@/lib/ledger";
import { signedIn, unauthorized } from "@/lib/server";

export async function POST(req: Request) {
  if (!(await signedIn())) return unauthorized();
  const { id } = (await req.json().catch(() => ({}))) as { id?: string };
  const result = await revert(String(id ?? ""));
  if (!result.ok) return Response.json({ error: result.error }, { status: 409 });
  return Response.json(result);
}
