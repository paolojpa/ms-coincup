import { clearUndone, history } from "@/lib/ledger";
import { signedIn, unauthorized } from "@/lib/server";

export async function GET() {
  if (!(await signedIn())) return unauthorized();
  return Response.json({ payouts: await history() });
}

/** Limpa do histórico os pagamentos desfeitos (Undo). Pagos e incompletos ficam. */
export async function DELETE() {
  if (!(await signedIn())) return unauthorized();
  return Response.json({ deleted: await clearUndone() });
}
