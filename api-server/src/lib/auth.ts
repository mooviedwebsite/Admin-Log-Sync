/**
 * auth.ts — MOOVIED (Updated v2)
 *
 * Session (login) still uses localStorage — this is fine, it's per-device.
 * Bookmarks, watch history, and liked movies are now in Cloudflare D1 via api.ts (cfUser).
 * These functions kept as stubs for backward compat with any imports not yet updated.
 */

export interface AuthUser {
  id: string;
  name: string;
  email: string;
  country: string;
  isAdmin: boolean;
  created_at: string;
}

const SESSION_KEY = "moovied_session";

// ── Admin auth (hashed credentials — never stored in plain text) ──────────────
const _AEH = "30b81e07f17bc733466363360f3ca8d19ea33f015e96293148046a75495fbf42";
const _APH = "51bdc00e3a673d4e21b443c39031d8695ffbd292cb895594acd3d9fc6f000f0f";

async function _h(s: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, "0")).join("");
}

export async function checkAdminLogin(email: string, password: string): Promise<boolean> {
  const [eh, ph] = await Promise.all([_h(email.toLowerCase().trim()), _h(password)]);
  return eh === _AEH && ph === _APH;
}

// ── Session ───────────────────────────────────────────────────────────────────
export function getCurrentUser(): AuthUser | null {
  const raw = localStorage.getItem(SESSION_KEY);
  if (!raw) return null;
  try { return JSON.parse(raw); } catch { return null; }
}

export function setCurrentUser(user: AuthUser) {
  localStorage.setItem(SESSION_KEY, JSON.stringify(user));
}

export function logout() {
  localStorage.removeItem(SESSION_KEY);
}

export function isAdminLoggedIn(): boolean {
  return !!getCurrentUser()?.isAdmin;
}

// ── Bookmarks (now in Cloudflare D1 — stubs kept for backward compat) ─────────
// MoviePage.tsx and other pages should use cfUser.toggleBookmark() instead.
// These stubs read from localStorage as a local cache fallback only.
const BOOKMARKS_KEY = "moovied_bookmarks_cache";

export function getBookmarks(): string[] {
  try { return JSON.parse(localStorage.getItem(BOOKMARKS_KEY) || "[]"); } catch { return []; }
}

export function setBookmarksCache(ids: string[]) {
  localStorage.setItem(BOOKMARKS_KEY, JSON.stringify(ids));
}

export function isBookmarked(movieId: string): boolean {
  return getBookmarks().includes(movieId);
}

// toggleBookmark is now async — calls Cloudflare Worker
// Import cfUser from api.ts and call cfUser.toggleBookmark(userId, movieId) instead.
// This sync stub updates local cache only (used where async isn't possible).
export function toggleBookmarkCache(movieId: string): boolean {
  const bookmarks = getBookmarks();
  const idx = bookmarks.indexOf(movieId);
  if (idx >= 0) { bookmarks.splice(idx, 1); }
  else          { bookmarks.push(movieId); }
  setBookmarksCache(bookmarks);
  return idx < 0; // returns true if now bookmarked
}

// Old sync export kept so existing imports don't break (updates cache only)
export function toggleBookmark(movieId: string): boolean {
  return toggleBookmarkCache(movieId);
}

// ── Watch History (now in Cloudflare D1 — stubs kept for backward compat) ─────
export interface WatchEntry {
  movieId: string;
  movieTitle: string;
  posterUrl: string;
  watchedAt: string;
  progress?: number;
}

// addToWatchHistory is now async — this sync version updates local cache only.
// In MoviePage, use cfUser.addToHistory() for real D1 sync.
export function addToWatchHistory(entry: Omit<WatchEntry, "watchedAt">) {
  // Keep local cache in sync for instant UI (ProfilePage now reads from D1)
  const WATCH_KEY = "moovied_watch_cache";
  try {
    const history: WatchEntry[] = JSON.parse(localStorage.getItem(WATCH_KEY) || "[]");
    const existing = history.findIndex(h => h.movieId === entry.movieId);
    if (existing >= 0) history.splice(existing, 1);
    history.unshift({ ...entry, watchedAt: new Date().toISOString() });
    localStorage.setItem(WATCH_KEY, JSON.stringify(history.slice(0, 50)));
  } catch {}
}

export function getWatchHistory(): WatchEntry[] {
  try { return JSON.parse(localStorage.getItem("moovied_watch_cache") || "[]"); } catch { return []; }
}
