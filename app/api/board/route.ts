import { BOARD_MAX_ROWS, type Board, type BoardRow } from "@/lib/board";
import { db, signedIn, unauthorized } from "@/lib/server";

type Doc = Board & { _id: string };

const text = (v: unknown, max: number) => String(v ?? "").slice(0, max);
const int = (v: unknown) => (Number.isFinite(Number(v)) ? Math.round(Number(v)) : 0);

/** Público: é o que a página /stream lê a cada poucos segundos. */
export async function GET() {
  const doc = await (await db()).collection<Doc>("coin_cup_board").findOne({ _id: "live" });
  if (!doc) return Response.json({ board: null }, { headers: { "cache-control": "no-store" } });
  const { _id, ...board } = doc;
  void _id;
  return Response.json({ board }, { headers: { "cache-control": "no-store" } });
}

/** Só o painel (com senha) troca a tabela da transmissão. */
export async function PUT(req: Request) {
  if (!(await signedIn())) return unauthorized();
  const raw = (await req.json().catch(() => ({}))) as Partial<Board>;
  if (!Array.isArray(raw.rows)) return Response.json({ error: "Invalid board." }, { status: 400 });
  const rows: BoardRow[] = raw.rows.slice(0, BOARD_MAX_ROWS).map((r) => ({
    place: int(r?.place),
    players: Array.isArray(r?.players) ? r.players.slice(0, 4).map((p) => text(p, 40)) : [],
    games: int(r?.games),
    kills: int(r?.kills),
    wins: int(r?.wins),
    points: int(r?.points),
    prize: int(r?.prize),
  }));
  const board: Board = {
    title: text(raw.title, 80),
    subtitle: text(raw.subtitle, 80),
    showPoints: raw.showPoints !== false,
    rows,
    updatedAt: new Date().toISOString(),
  };
  await (await db())
    .collection<Doc>("coin_cup_board")
    .replaceOne({ _id: "live" }, board, { upsert: true });
  return Response.json({ ok: true, updatedAt: board.updatedAt });
}

/** Tira a tabela da transmissão. */
export async function DELETE() {
  if (!(await signedIn())) return unauthorized();
  await (await db()).collection<Doc>("coin_cup_board").deleteOne({ _id: "live" });
  return Response.json({ ok: true });
}
