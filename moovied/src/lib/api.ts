/**
 * MOOVIED — api.ts (Complete v2)
 *
 * What changed:
 *   - Watch history    → Cloudflare D1 (was localStorage)
 *   - Bookmarks        → Cloudflare D1 (was localStorage)
 *   - Movie likes      → Cloudflare D1 (was localStorage)
 *   - Comment likes    → Cloudflare D1 (no double-like)
 *   - Image upload     → Cloudflare R2 (was GitHub direct)
 *   - Profile data     → single fast request to Worker /user/:id/profile
 *
 * Google Sheets (GAS) still handles:
 *   - Movie list, users, view counts, email blasts, activity logs
 *   - All admin sheet operations (addMovie, editMovie, deleteMovie)
 */

import {
  writeCache, readCache,
  patchMovieInCache, addMovieToCache, removeMovieFromCache,
} from "./movieCache";
import { saveMovieMeta, deleteMovieMeta } from "./movieMeta";

// ─── Worker URL ───────────────────────────────────────────────────────────────
export const WORKER_URL = "https://moovied-api.moovieds-server.workers.dev/api";

/**
 * imgProxy — route any image URL through Cloudflare edge cache.
 * Instead of: <img src={movie.poster_url} />
 * Use:        <img src={imgProxy(movie.poster_url)} />
 *
 * Cloudflare caches the image at the nearest edge city globally.
 * First load fetches from origin + stores in R2. Next loads = instant.
 */
export function imgProxy(url: string | undefined): string {
  if (!url) return "";
  // Don't double-proxy R2/Cloudflare URLs or data URIs
  if (url.startsWith("data:") || url.includes("r2.dev") || url.includes("workers.dev")) return url;
  return `${WORKER_URL}/img?url=${encodeURIComponent(url)}`;
}

// ─── GAS config (still used for movies, users, stats) ────────────────────────
const GAS_URL_KEY    = "moovied_gas_url";
const GAS_SECRET_KEY = "moovied_gas_secret";
const OLD_GAS_URL    = "https://script.google.com/macros/s/AKfycbzZEAcXt4lp0t_FVdIgJR2dKQARlIdY8MkuHjwxfadN5Wpj4v7GOQr1Xo7OhQWd3h8k/exec";
const DEFAULT_GAS_URL = "https://script.google.com/macros/s/AKfycbwZh3CodBYIMDCqIFKQhT28FkRHYpaoQUNlRsstxZf8eMO_GjPpr4zCMsLbQ5-aGA3v8g/exec";

export function getGasUrl(): string {
  const stored = localStorage.getItem(GAS_URL_KEY);
  if (!stored || stored === OLD_GAS_URL) {
    localStorage.setItem(GAS_URL_KEY, DEFAULT_GAS_URL);
    return DEFAULT_GAS_URL;
  }
  return stored;
}
export function setGasUrl(url: string)    { localStorage.setItem(GAS_URL_KEY, url); }
export function getGasSecret(): string    { return localStorage.getItem(GAS_SECRET_KEY) || ""; }
export function setGasSecret(s: string)   { localStorage.setItem(GAS_SECRET_KEY, s); }

// ─── GAS helpers (internal) ───────────────────────────────────────────────────
async function gasRequest(action: string, params: Record<string, unknown> = {}) {
  const url = getGasUrl();
  if (!url) throw new Error("Google Apps Script URL not configured.");
  const secret = getGasSecret();
  const body: Record<string, unknown> = { action, ...params };
  if (secret) body.adminSecret = secret;
  const r = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "text/plain;charset=utf-8" },
    body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error(`GAS network error: ${r.status}`);
  const data = await r.json();
  if (!data.success) throw new Error(data.error || "GAS request failed");
  return data;
}

async function gasGet(action: string, params: Record<string, string> = {}) {
  const url = getGasUrl();
  if (!url) throw new Error("Google Apps Script URL not configured.");
  const secret = getGasSecret();
  if (secret) params = { ...params, adminSecret: secret };
  const qs = new URLSearchParams({ action, ...params }).toString();
  const r = await fetch(`${url}?${qs}`);
  if (!r.ok) throw new Error(`GAS network error: ${r.status}`);
  const data = await r.json();
  if (!data.success) throw new Error(data.error || "GAS request failed");
  return data;
}

// ─── Worker helpers (internal) ────────────────────────────────────────────────
async function wFetch(path: string, init: RequestInit = {}) {
  const r = await fetch(`${WORKER_URL}${path}`, {
    ...init,
    headers: { "Content-Type": "application/json", ...(init.headers || {}) },
  });
  if (!r.ok) {
    const txt = await r.text().catch(() => r.statusText);
    throw new Error(`Worker error (${r.status}): ${txt}`);
  }
  return r.json();
}

function wGet(path: string, userId?: string) {
  const headers: Record<string, string> = {};
  if (userId) headers["X-User-Id"] = userId;
  return wFetch(path, { headers });
}

function wPost(path: string, body: unknown, userId?: string) {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (userId) headers["X-User-Id"] = userId;
  return wFetch(path, { method: "POST", body: JSON.stringify(body), headers });
}

function wPut(path: string, body: unknown) {
  return wFetch(path, { method: "PUT", body: JSON.stringify(body) });
}

function wPatch(path: string, body: unknown) {
  return wFetch(path, { method: "PATCH", body: JSON.stringify(body) });
}

function wDelete(path: string) {
  return wFetch(path, { method: "DELETE" });
}

// ─── Types ────────────────────────────────────────────────────────────────────
export interface Episode {
  id: string;
  season: number;
  episode: number;
  title: string;
  description?: string;
  video_url: string;
  download_url?: string;
  subtitle_url?: string;
  thumbnail?: string;
  duration?: string;
}

export interface Movie {
  id: string;
  title: string;
  description: string;
  synopsis?: string;
  poster_url: string;
  video_url: string;
  yt_link?: string;
  download_url: string;
  dl_2160p?: string; dl_1080p?: string; dl_720p?: string; dl_480p?: string; dl_360p?: string;
  stream_2160p?: string; stream_1080p?: string; stream_720p?: string; stream_480p?: string; stream_360p?: string;
  genre: string;
  year: string;
  views: number;
  rating?: number;
  tmdb_rating?: number;
  rt_rating?: number;
  runtime?: string;
  subtitle_url?: string;
  director?: string;
  director_image?: string;
  cast?: string;
  gallery?: string;
  type?: "movie" | "series";
  episodes?: Episode[];
  like_count?: number;
  comment_count?: number;
}

export interface User {
  id: string;
  name: string;
  email: string;
  country: string;
  created_at: string;
}

export interface ActivityLog {
  id: string;
  user_id: string;
  action: string;
  timestamp: string;
}

export interface Comment {
  id: string;
  movie_id: string;
  user_id: string;
  user_name: string;
  content: string;
  timestamp: string;
  likes: number;
  edited?: boolean;
  reply_to?: string;
  reply_to_name?: string;
}

export interface WatchEntry {
  movieId: string;
  movieTitle: string;
  posterUrl: string;
  watchedAt: string;
  progress?: number;
}

export interface UserProfile {
  history:     { movie_id: string; movie_title: string; poster_url: string; progress: number; watched_at: string }[];
  bookmarks:   string[];
  likedMovies: string[];
}

// ─── Comments API (Cloudflare D1) ────────────────────────────────────────────
export const cfComments = {
  async getComments(movieId: string): Promise<Comment[]> {
    const d = await wGet(`/comments?movieId=${encodeURIComponent(movieId)}`);
    return d.comments || [];
  },

  async getAllComments(): Promise<Comment[]> {
    const d = await wGet("/comments/all");
    return d.comments || [];
  },

  async addComment(
    movieId: string, userId: string, userName: string, content: string,
    replyTo?: string, replyToName?: string
  ): Promise<Comment | null> {
    const d = await wPost("/comments", {
      movie_id: movieId, user_id: userId, user_name: userName, content,
      reply_to: replyTo, reply_to_name: replyToName,
    }, userId);
    return d.comment || null;
  },

  async editComment(id: string, _movieId: string, content: string): Promise<void> {
    await wPatch(`/comments/${id}`, { content });
  },

  async deleteComment(id: string): Promise<void> {
    await wDelete(`/comments/${id}`);
  },

  async likeComment(id: string, userId: string): Promise<{ likes: number; alreadyLiked: boolean }> {
    const d = await wFetch(`/comments/${id}/like`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-User-Id": userId },
    });
    return { likes: d.likes || 0, alreadyLiked: !!d.alreadyLiked };
  },
};

// Keep old export name for backward compat with existing code
export const realComments = cfComments;
export const gasComments  = cfComments; // both now go to Cloudflare
export const bn           = cfComments; // alias used in AdminPage

// ─── User Profile (Cloudflare D1) — single fast request ─────────────────────
export const cfUser = {
  async getProfile(userId: string): Promise<UserProfile> {
    try {
      const d = await wGet(`/user/${encodeURIComponent(userId)}/profile`);
      return {
        history:     d.history || [],
        bookmarks:   d.bookmarks || [],
        likedMovies: d.likedMovies || [],
      };
    } catch {
      return { history: [], bookmarks: [], likedMovies: [] };
    }
  },

  // Watch History
  async addToHistory(userId: string, entry: Omit<WatchEntry, "watchedAt">): Promise<void> {
    await wPost(`/user/${encodeURIComponent(userId)}/history`, {
      movie_id:    entry.movieId,
      movie_title: entry.movieTitle,
      poster_url:  entry.posterUrl,
      progress:    entry.progress || 0,
    });
  },

  async getHistory(userId: string): Promise<WatchEntry[]> {
    const d = await wGet(`/user/${encodeURIComponent(userId)}/history`);
    return (d.history || []).map((h: { movie_id: string; movie_title: string; poster_url: string; watched_at: string; progress: number }) => ({
      movieId:    h.movie_id,
      movieTitle: h.movie_title,
      posterUrl:  h.poster_url,
      watchedAt:  h.watched_at,
      progress:   h.progress,
    }));
  },

  // Bookmarks
  async toggleBookmark(userId: string, movieId: string): Promise<{ bookmarked: boolean }> {
    const d = await wPost(`/user/${encodeURIComponent(userId)}/bookmarks/toggle`, { movie_id: movieId });
    return { bookmarked: !!d.bookmarked };
  },

  async getBookmarks(userId: string): Promise<string[]> {
    const d = await wGet(`/user/${encodeURIComponent(userId)}/bookmarks`);
    return d.bookmarks || [];
  },

  // Movie Likes
  async toggleMovieLike(userId: string, movieId: string): Promise<{ liked: boolean; count: number }> {
    const d = await wPost(`/movies/${encodeURIComponent(movieId)}/likes/toggle`, { user_id: userId });
    return { liked: !!d.liked, count: d.count || 0 };
  },

  async getMovieLikes(movieId: string, userId?: string): Promise<{ count: number; liked: boolean }> {
    const qs = userId ? `?userId=${encodeURIComponent(userId)}` : "";
    const d = await wGet(`/movies/${encodeURIComponent(movieId)}/likes${qs}`);
    return { count: d.count || 0, liked: !!d.liked };
  },

  async getLikedMovies(userId: string): Promise<string[]> {
    const d = await wGet(`/user/${encodeURIComponent(userId)}/liked-movies`);
    return d.likedMovies || [];
  },
};

// Backward compat exports used in existing pages
export const gasWatchHistory = {
  async add(userId: string, movieId: string, progress = 0) {
    return cfUser.addToHistory(userId, { movieId, movieTitle: "", posterUrl: "", progress }).catch(() => null);
  },
  async get(userId: string) {
    const history = await cfUser.getHistory(userId);
    return history.map(h => ({ movie_id: h.movieId, watched_at: h.watchedAt, progress: h.progress || 0 }));
  },
};

export const gasBookmarks = {
  async toggle(userId: string, movieId: string) { return cfUser.toggleBookmark(userId, movieId); },
  async get(userId: string)                     { return cfUser.getBookmarks(userId); },
};

export const gasMovieLikes = {
  async toggle(userId: string, movieId: string) { return cfUser.toggleMovieLike(userId, movieId); },
  async getCount(movieId: string)               { return (await cfUser.getMovieLikes(movieId)).count; },
};

// ─── Image Upload (Cloudflare R2) ─────────────────────────────────────────────
export async function uploadImage(
  base64Data: string,
  ext: string,
  movieId: string
): Promise<string> {
  const d = await wPost("/upload/image", { data: base64Data, ext, movieId });
  if (!d.success || !d.url) throw new Error(d.error || "Upload failed");
  return d.url;
}

// ─── Movie API (GAS → Google Sheets, unchanged) ───────────────────────────────
function parseMovieEpisodes(movie: Movie): Movie {
  if (!movie.episodes || Array.isArray(movie.episodes)) return movie;
  try {
    const parsed = JSON.parse(movie.episodes as unknown as string);
    if (Array.isArray(parsed)) return { ...movie, episodes: parsed };
  } catch {}
  return { ...movie, episodes: [] };
}

async function fetchMoviesFromGas(): Promise<Movie[]> {
  try {
    const data = await gasGet("getAllData");
    if (Array.isArray(data.movies)) return (data.movies as Movie[]).map(parseMovieEpisodes);
  } catch {}
  try {
    const data = await gasGet("getMovies");
    if (Array.isArray(data.movies)) return (data.movies as Movie[]).map(parseMovieEpisodes);
  } catch {}
  return [];
}

export const api = {
  async registerUser(name: string, email: string, password: string, country: string) {
    return gasRequest("registerUser", { name, email, password, country });
  },

  async loginUser(email: string, password: string) {
    return gasRequest("loginUser", { email, password });
  },

  async getMovies(): Promise<{ movies: Movie[] }> {
    const cached = readCache();
    if (cached) {
      // Return cache instantly, refresh in background
      fetchMoviesFromGas()
        .then(fresh => { if (fresh.length > 0) writeCache(fresh); })
        .catch(() => {});
      return { movies: cached };
    }
    try {
      const movies = await fetchMoviesFromGas();
      if (movies.length > 0) writeCache(movies);
      return { movies };
    } catch {
      return { movies: [] };
    }
  },

  async getMovieById(id: string): Promise<{ movie: Movie }> {
    const cached = readCache();
    if (cached) {
      const found = cached.find(m => m.id === id);
      if (found) return { movie: found };
    }
    const movies = await fetchMoviesFromGas();
    if (movies.length > 0) writeCache(movies);
    const found = movies.find(m => m.id === id);
    if (found) return { movie: found };
    throw new Error("Movie not found");
  },

  async addMovie(movie: Omit<Movie, "id" | "views">) {
    const result = await gasRequest("addMovie", movie as Record<string, unknown>);
    const newMovie: Movie = { ...movie, id: result.id ?? String(Date.now()), views: 0 };
    saveMovieMeta(newMovie);
    addMovieToCache(newMovie);
    return result;
  },

  async editMovie(movie: Movie) {
    saveMovieMeta(movie);
    patchMovieInCache(movie);
    return gasRequest("editMovie", movie as unknown as Record<string, unknown>);
  },

  async deleteMovie(id: string) {
    deleteMovieMeta(id);
    removeMovieFromCache(id);
    return gasRequest("deleteMovie", { id });
  },

  async addViewCount(movieId: string, userId: string) {
    // Record view in both GAS (for stats) and Cloudflare (for history)
    gasRequest("addViewCount", { movieId, userId }).catch(() => null);
    return null;
  },

  async getUsers(): Promise<{ users: User[] }>       { return gasGet("getUsers"); },
  async deleteUser(id: string)                        { return gasRequest("deleteUser", { id }); },
  async logActivity(userId: string, action: string)   { return gasRequest("logActivity", { userId, action }).catch(() => null); },
  async getStats()                                    { return gasGet("getStats"); },
  async getActivityLogs(): Promise<{ logs: ActivityLog[] }> { return gasGet("getActivityLogs"); },
  async sendEmailToUser(userId: string, subject: string, htmlBody: string) {
    return gasRequest("sendEmailToUser", { userId, subject, htmlBody });
  },
  async sendEmailToAll(subject: string, htmlBody: string) {
    return gasRequest("sendEmailToAll", { subject, htmlBody });
  },
};

// ─── GitHub push (via Worker — not direct from browser) ──────────────────────
export async function pushToGitHub(
  file: string,
  content: string | object,
  message = "Update via MOOVIED admin"
): Promise<void> {
  const d = await wPut("/github/push", { file, content, message });
  if (!d.success) throw new Error(d.error || "GitHub push failed");
}

// ─── Auto-sync ────────────────────────────────────────────────────────────────
export async function getAutoSyncConfig() {
  return wGet("/autosync/config");
}

export async function saveAutoSyncConfig(config: {
  enabled: boolean; intervalHours: number; gasUrl: string; gasSecret?: string;
}) {
  return wPost("/autosync/config", config);
}

export async function triggerAutoSync() {
  return wPost("/autosync/trigger", {});
}

// ─── Backward compat: likeStore (replaced by cfUser) ─────────────────────────
// Still exported so existing MoviePage.tsx and AdminPage.tsx don't break
// before you update those files.
export const likeStore = {
  getLikes(movieId: string): number {
    try {
      const d = JSON.parse(localStorage.getItem("moovied_movie_likes") || "{}");
      return d[movieId] || 0;
    } catch { return 0; }
  },
  hasLiked(movieId: string): boolean {
    try {
      const d = JSON.parse(localStorage.getItem("moovied_user_liked") || "{}");
      return !!d[movieId];
    } catch { return false; }
  },
  toggleLike(movieId: string): { liked: boolean; count: number } {
    const likes: Record<string, number>  = JSON.parse(localStorage.getItem("moovied_movie_likes") || "{}");
    const liked: Record<string, boolean> = JSON.parse(localStorage.getItem("moovied_user_liked")  || "{}");
    if (liked[movieId]) { liked[movieId] = false; likes[movieId] = Math.max(0, (likes[movieId] || 1) - 1); }
    else                { liked[movieId] = true;  likes[movieId] = (likes[movieId] || 0) + 1; }
    localStorage.setItem("moovied_movie_likes", JSON.stringify(likes));
    localStorage.setItem("moovied_user_liked",  JSON.stringify(liked));
    return { liked: liked[movieId], count: likes[movieId] };
  },
};

// ─── Comments API URL (backward compat setting in admin settings page) ────────
const COMMENTS_API_KEY = "moovied_comments_api_url";
export function getCommentsApiUrl(): string { return WORKER_URL; }
export function setCommentsApiUrl(_url: string) {
  // No-op — URL is now hardcoded to the Worker. Kept for backward compat.
  localStorage.setItem(COMMENTS_API_KEY, WORKER_URL);
}

// ─── Demo movies (shown only when GAS not configured) ────────────────────────
export const DEMO_MOVIES: Movie[] = [
  { id:"demo1", title:"Cosmic Odyssey", description:"A breathtaking journey through the cosmos.", poster_url:"https://images.unsplash.com/photo-1446776877081-d282a0f896e2?w=800&q=80", video_url:"https://www.w3schools.com/html/mov_bbb.mp4", download_url:"#", genre:"Sci-Fi", year:"2024", views:15820, rating:8.7, tmdb_rating:8.2, rt_rating:91, runtime:"2h 18m" },
  { id:"demo2", title:"Midnight Protocol", description:"A gripping thriller where a lone hacker discovers a government conspiracy.", poster_url:"https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=800&q=80", video_url:"https://www.w3schools.com/html/mov_bbb.mp4", download_url:"#", genre:"Thriller", year:"2024", views:12340, rating:8.2, runtime:"1h 54m" },
  { id:"demo3", title:"Ember Falls", description:"A sweeping drama set against the backdrop of a small mountain town.", poster_url:"https://images.unsplash.com/photo-1489599849927-2ee91cede3ba?w=800&q=80", video_url:"https://www.w3schools.com/html/mov_bbb.mp4", download_url:"#", genre:"Drama", year:"2023", views:9870, rating:7.9, runtime:"2h 5m" },
  { id:"demo4", title:"Shadow Strike", description:"Elite operatives go deep undercover.", poster_url:"https://images.unsplash.com/photo-1440404653325-ab127d49abc1?w=800&q=80", video_url:"https://www.w3schools.com/html/mov_bbb.mp4", download_url:"#", genre:"Action", year:"2024", views:21500, rating:8.0, runtime:"1h 48m" },
  { id:"demo5", title:"Laughing Stock", description:"A hilarious comedy about a failed comedian.", poster_url:"https://images.unsplash.com/photo-1507679799987-c73779587ccf?w=800&q=80", video_url:"https://www.w3schools.com/html/mov_bbb.mp4", download_url:"#", genre:"Comedy", year:"2023", views:7620, rating:7.5, runtime:"1h 38m" },
  { id:"demo6", title:"Phantom Waves", description:"A supernatural horror film.", poster_url:"https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=800&q=80", video_url:"https://www.w3schools.com/html/mov_bbb.mp4", download_url:"#", genre:"Horror", year:"2024", views:18900, rating:7.6, runtime:"1h 52m" },
];
