import { endSession } from "@/lib/server";

export async function POST() {
  await endSession();
  return Response.json({ ok: true });
}
