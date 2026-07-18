// ─── Audio QC endpoints ──────────────────────────────────────────────────────
// GET  /tracks/:id/audio-qc  — результат анализа (лениво запускает, если ещё не было
//                              или аудиофайл трека сменился)
// POST /tracks/:id/audio-qc  — принудительный перезапуск анализа
import { Router } from "express";
import { db, tracksTable, artistsTable, audioQcTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { getDataScope } from "../lib/auth";
import { runAudioQcForTrack } from "../services/audio-qc";

const router = Router();

async function trackInScope(scope: ReturnType<typeof getDataScope>, t: { artistId: number }): Promise<boolean> {
  if (scope.fullAccess) return true;
  if (scope.role === "artist") return t.artistId === scope.artistId;
  if (scope.role === "label") {
    if (scope.labelId == null) return false;
    const [a] = await db.select({ labelId: artistsTable.labelId }).from(artistsTable).where(eq(artistsTable.id, t.artistId));
    return !!a && a.labelId === scope.labelId;
  }
  return false;
}

async function loadScopedTrack(req: Parameters<typeof getDataScope>[0], idRaw: string) {
  const id = Number(idRaw);
  if (!Number.isFinite(id) || id <= 0) return { error: 400 as const };
  const [track] = await db.select().from(tracksTable).where(eq(tracksTable.id, id));
  if (!track) return { error: 404 as const };
  if (!(await trackInScope(getDataScope(req), track))) return { error: 403 as const };
  return { track };
}

router.get("/tracks/:id/audio-qc", async (req, res): Promise<void> => {
  const r = await loadScopedTrack(req, req.params.id);
  if ("error" in r) { res.status(r.error as number).json({ error: "Audio QC: track unavailable" }); return; }
  const { track } = r;
  if (!track.audioUrl) { res.json(null); return; }

  const [existing] = await db.select().from(audioQcTable).where(eq(audioQcTable.trackId, track.id));
  // Актуальный результат уже есть — отдаём. Если аудиофайл сменился — переанализируем.
  if (existing && existing.objectPath === track.audioUrl) { res.json(existing); return; }
  try {
    const row = await runAudioQcForTrack(track.id);
    res.json(row);
  } catch (e) {
    res.status(500).json({ error: `Audio QC: ${(e as Error).message}` });
  }
});

router.post("/tracks/:id/audio-qc", async (req, res): Promise<void> => {
  const r = await loadScopedTrack(req, req.params.id);
  if ("error" in r) { res.status(r.error as number).json({ error: "Audio QC: track unavailable" }); return; }
  try {
    const row = await runAudioQcForTrack(r.track.id);
    if (!row) { res.status(422).json({ error: "У трека нет аудиофайла (или файл недоступен на сервере)" }); return; }
    res.json(row);
  } catch (e) {
    res.status(500).json({ error: `Audio QC: ${(e as Error).message}` });
  }
});

export default router;
