import { Router } from "express";
import { db, mooviedComments } from "@workspace/db";
import { eq, desc, asc, sql } from "drizzle-orm";

const router = Router();

// ── GET /api/comments?movieId=xxx  ──────────────────────────────────────────
// Returns all comments for a movie (newest first at top level, oldest first for replies)
router.get("/comments", async (req, res) => {
  const { movieId } = req.query;
  if (!movieId || typeof movieId !== "string") {
    return res.status(400).json({ success: false, error: "movieId is required" });
  }
  try {
    const rows = await db
      .select()
      .from(mooviedComments)
      .where(eq(mooviedComments.movie_id, movieId))
      .orderBy(asc(mooviedComments.created_at));

    const comments = rows.map(formatComment);
    return res.json({ success: true, comments });
  } catch (err) {
    return res.status(500).json({ success: false, error: String(err) });
  }
});

// ── GET /api/comments/all  ───────────────────────────────────────────────────
// Admin: all comments across all movies
router.get("/comments/all", async (_req, res) => {
  try {
    const rows = await db
      .select()
      .from(mooviedComments)
      .orderBy(desc(mooviedComments.created_at));

    return res.json({ success: true, comments: rows.map(formatComment) });
  } catch (err) {
    return res.status(500).json({ success: false, error: String(err) });
  }
});

// ── POST /api/comments  ──────────────────────────────────────────────────────
router.post("/comments", async (req, res) => {
  const { movie_id, user_id, user_name, content, reply_to, reply_to_name } = req.body;
  if (!movie_id || !user_id || !user_name || !content?.trim()) {
    return res.status(400).json({ success: false, error: "movie_id, user_id, user_name, content are required" });
  }
  try {
    const [comment] = await db
      .insert(mooviedComments)
      .values({
        movie_id:      String(movie_id),
        user_id:       String(user_id),
        user_name:     String(user_name),
        content:       String(content).trim(),
        reply_to:      reply_to || null,
        reply_to_name: reply_to_name || "",
      })
      .returning();

    return res.status(201).json({ success: true, comment: formatComment(comment) });
  } catch (err) {
    return res.status(500).json({ success: false, error: String(err) });
  }
});

// ── PATCH /api/comments/:id  ─────────────────────────────────────────────────
router.patch("/comments/:id", async (req, res) => {
  const { id } = req.params;
  const { content } = req.body;
  if (!content?.trim()) {
    return res.status(400).json({ success: false, error: "content is required" });
  }
  try {
    const [updated] = await db
      .update(mooviedComments)
      .set({ content: String(content).trim(), edited: true, updated_at: new Date() })
      .where(eq(mooviedComments.id, id))
      .returning();

    if (!updated) return res.status(404).json({ success: false, error: "Comment not found" });
    return res.json({ success: true, comment: formatComment(updated) });
  } catch (err) {
    return res.status(500).json({ success: false, error: String(err) });
  }
});

// ── DELETE /api/comments/:id  ────────────────────────────────────────────────
router.delete("/comments/:id", async (req, res) => {
  const { id } = req.params;
  try {
    const [deleted] = await db
      .delete(mooviedComments)
      .where(eq(mooviedComments.id, id))
      .returning({ id: mooviedComments.id });

    if (!deleted) return res.status(404).json({ success: false, error: "Comment not found" });
    return res.json({ success: true });
  } catch (err) {
    return res.status(500).json({ success: false, error: String(err) });
  }
});

// ── POST /api/comments/:id/like  ─────────────────────────────────────────────
router.post("/comments/:id/like", async (req, res) => {
  const { id } = req.params;
  try {
    const [updated] = await db
      .update(mooviedComments)
      .set({ likes: sql`${mooviedComments.likes} + 1` })
      .where(eq(mooviedComments.id, id))
      .returning({ id: mooviedComments.id, likes: mooviedComments.likes });

    if (!updated) return res.status(404).json({ success: false, error: "Comment not found" });
    return res.json({ success: true, likes: updated.likes });
  } catch (err) {
    return res.status(500).json({ success: false, error: String(err) });
  }
});

// ── Helper ───────────────────────────────────────────────────────────────────
function formatComment(c: typeof mooviedComments.$inferSelect) {
  return {
    id:            c.id,
    movie_id:      c.movie_id,
    user_id:       c.user_id,
    user_name:     c.user_name,
    content:       c.content,
    timestamp:     c.created_at.toISOString(),
    likes:         c.likes,
    edited:        c.edited,
    reply_to:      c.reply_to ?? undefined,
    reply_to_name: c.reply_to_name ?? undefined,
  };
}

export default router;
