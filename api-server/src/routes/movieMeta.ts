import { Router } from "express";
import { db } from "@workspace/db";
import { mooviedMovieMeta } from "@workspace/db/schema";
import { eq, sql } from "drizzle-orm";

const router = Router();

// ── GET /api/movie-meta  ─────────────────────────────────────────────────────
// Returns all movie meta rows (for bulk merge on frontend)
router.get("/movie-meta", async (_req, res) => {
  try {
    const rows = await db.select().from(mooviedMovieMeta);
    return res.json({ success: true, meta: rows });
  } catch (err) {
    return res.status(500).json({ success: false, error: String(err) });
  }
});

// ── GET /api/movie-meta/:movieId  ────────────────────────────────────────────
router.get("/movie-meta/:movieId", async (req, res) => {
  const { movieId } = req.params;
  try {
    const rows = await db.select().from(mooviedMovieMeta).where(eq(mooviedMovieMeta.movie_id, movieId));
    if (rows.length === 0) return res.json({ success: true, meta: null });
    return res.json({ success: true, meta: rows[0] });
  } catch (err) {
    return res.status(500).json({ success: false, error: String(err) });
  }
});

// ── PUT /api/movie-meta/:movieId  ────────────────────────────────────────────
// Upsert: admin saves extended movie details
router.put("/movie-meta/:movieId", async (req, res) => {
  const { movieId } = req.params;
  const {
    synopsis, yt_link, tmdb_rating, rt_rating,
    director, director_image, cast, gallery,
    dl_2160p, dl_1080p, dl_720p, dl_480p, dl_360p,
    subtitle_url,
  } = req.body;

  try {
    const data = {
      movie_id:       movieId,
      synopsis:       synopsis       ?? "",
      yt_link:        yt_link        ?? "",
      tmdb_rating:    tmdb_rating != null && tmdb_rating !== "" ? String(tmdb_rating) : null,
      rt_rating:      rt_rating   != null && rt_rating   !== "" ? String(rt_rating)   : null,
      director:       director       ?? "",
      director_image: director_image ?? "",
      cast:           cast           ?? "",
      gallery:        gallery        ?? "",
      dl_2160p:       dl_2160p       ?? "",
      dl_1080p:       dl_1080p       ?? "",
      dl_720p:        dl_720p        ?? "",
      dl_480p:        dl_480p        ?? "",
      dl_360p:        dl_360p        ?? "",
      subtitle_url:   subtitle_url   ?? "",
      updated_at:     new Date(),
    };

    await db
      .insert(mooviedMovieMeta)
      .values(data)
      .onConflictDoUpdate({
        target: mooviedMovieMeta.movie_id,
        set: {
          synopsis:       sql`excluded.synopsis`,
          yt_link:        sql`excluded.yt_link`,
          tmdb_rating:    sql`excluded.tmdb_rating`,
          rt_rating:      sql`excluded.rt_rating`,
          director:       sql`excluded.director`,
          director_image: sql`excluded.director_image`,
          cast:           sql`excluded.cast`,
          gallery:        sql`excluded.gallery`,
          dl_2160p:       sql`excluded.dl_2160p`,
          dl_1080p:       sql`excluded.dl_1080p`,
          dl_720p:        sql`excluded.dl_720p`,
          dl_480p:        sql`excluded.dl_480p`,
          dl_360p:        sql`excluded.dl_360p`,
          subtitle_url:   sql`excluded.subtitle_url`,
          updated_at:     sql`excluded.updated_at`,
        },
      });

    return res.json({ success: true });
  } catch (err) {
    return res.status(500).json({ success: false, error: String(err) });
  }
});

// ── DELETE /api/movie-meta/:movieId  ─────────────────────────────────────────
router.delete("/movie-meta/:movieId", async (req, res) => {
  const { movieId } = req.params;
  try {
    await db.delete(mooviedMovieMeta).where(eq(mooviedMovieMeta.movie_id, movieId));
    return res.json({ success: true });
  } catch (err) {
    return res.status(500).json({ success: false, error: String(err) });
  }
});

export default router;
