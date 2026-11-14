import { history } from "@/lib/ledger";
import { signedIn, unauthorized } from "@/lib/server";

export async function GET() {
  if (!(await signedIn())) return unauthorized();
  return Response.json({ payouts: await history() });
}
