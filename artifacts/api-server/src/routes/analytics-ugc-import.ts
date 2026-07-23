/**
 * Historical endpoint kept so old clients receive an explicit answer.
 * Spotify popularity is not a view count and must never be persisted as UGC.
 */
import { Router } from "express";
import { requireRole } from "../lib/auth";

const router = Router();

router.post("/analytics/ugc/import-spotify", requireRole("admin", "manager"), (_req, res): void => {
  res.status(410).json({
    error: "source_not_supported",
    message: "Spotify popularity is not a UGC metric. Import platform reports with a track binding instead.",
  });
});

export default router;
