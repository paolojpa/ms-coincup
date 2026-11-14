import { cleanTiers, type CsvInput, type Mode, type Tier } from "./payout";

const MAX_FILES = 10;
const MAX_BYTES = 4 * 1024 * 1024;

/** Lê e valida o corpo comum de /api/preview e /api/payout. */
export function readBody(raw: unknown):
  | { ok: true; files: CsvInput[]; tiers: Tier[]; mode: Mode; name: string }
  | { ok: false; error: string } {
  const body = raw as { files?: unknown; tiers?: unknown; mode?: unknown; name?: unknown };
  if (!Array.isArray(body?.files) || !body.files.length) return { ok: false, error: "Add at least one CSV." };
  if (body.files.length > MAX_FILES) return { ok: false, error: `At most ${MAX_FILES} files.` };
  const files: CsvInput[] = [];
  let size = 0;
  for (const f of body.files) {
    const name = String((f as CsvInput)?.name ?? "").slice(0, 120);
    const text = String((f as CsvInput)?.text ?? "");
    size += text.length;
    if (!name || !text) return { ok: false, error: "Invalid file." };
    files.push({ name, text });
  }
  if (size > MAX_BYTES) return { ok: false, error: "Files are too large." };
  const tiers = cleanTiers(body.tiers);
  if (!tiers) return { ok: false, error: "Invalid prize table." };
  const mode: Mode = body.mode === "separate" ? "separate" : "sum";
  const name = String(body.name ?? "").trim().slice(0, 100);
  return { ok: true, files, tiers, mode, name };
}
