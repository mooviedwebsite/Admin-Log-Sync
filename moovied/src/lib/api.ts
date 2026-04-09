import {
  writeCache, readCache, invalidateCache,
  patchMovieInCache, addMovieToCache, removeMovieFromCache,
} from "./movieCache";
import { saveMovieMeta, deleteMovieMeta } from "./movieMeta";

const GAS_URL_KEY = "moovied_gas_url";
const GAS_SECRET_KEY = "moovied_gas_secret";

const OLD_GAS_URL = "https://script.google.com/macros/s/AKfycbzZEAcXt4lp0t_FVdIgJR2dKQARlIdY8MkuHjwxfadN5Wpj4v7GOQr1Xo7OhQWd3h8k/exec";
const DEFAULT_GAS_URL = "https://script.google.com/macros/s/AKfycbwZh3CodBYIMDCqIFKQhT28FkRHYpaoQUNlRsstxZf8eMO_GjPpr4zCMsLbQ5-aGA3v8g/exec";

export function getGasUrl(): string {
  const stored = localStorage.getItem(GAS_URL_KEY);
  // Auto-migrate: if stored URL is the old script, replace with new one
  if (!stored || stored === OLD_GAS_URL) {
    localStorage.setItem(GAS_URL_KEY, DEFAULT_GAS_URL);
    return DEFAULT_GAS_URL;
  }
  return stored;
}
export function setGasUrl(url: string) { localStorage.setItem(GAS_URL_KEY, url); }
export function getGasSecret(): string { return localStorage.getItem(GAS_SECRET_KEY) || ""; }
export function setGasSecret(secret: string) { localStorage.setItem(GAS_SECRET_KEY, secret); }

async function gasRequest(action: string, params: Record<string, unknown> = {}) {
  const url = getGasUrl();
  if (!url) throw new Error("Google Apps Script URL not configured. Set it in Admin > Settings.");
  const secret = getGasSecret();
  const body: Record<string, unknown> = { action, ...params };
  if (secret) body.adminSecret = secret;
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "text/plain;charset=utf-8" },
    body: JSON.stringify(body),
  });
  if (!response.ok) throw new Error(`Network error: ${response.status}`);
  const data = await response.json();
  if (!data.success) throw new Error(data.error || "Request failed");
  return data;
}

async function gasGet(action: string, params: Record<string, string> = {}) {
  const url = getGasUrl();
  if (!url) throw new Error("Google Apps Script URL not configured.");
  const secret = getGasSecret();
  if (secret) params = { ...params, adminSecret: secret };
  const qs = new URLSearchParams({ action, ...params }).toString();
  const response = await fetch(`${url}?${qs}`);
  if (!response.ok) throw new Error(`Network error: ${response.status}`);
  const data = await response.json();
  if (!data.success) throw new Error(data.error || "Request failed");
  return data;
}

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
  dl_2160p?: string;
  dl_1080p?: string;
  dl_720p?: string;
  dl_480p?: string;
  dl_360p?: string;
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
  reply_to?: string;       // id of parent comment (if this is a reply)
  reply_to_name?: string;  // display name of parent commenter
}

// ── Comment helpers (localStorage-based fast cache) ──────────────────────────
const COMMENTS_KEY = "moovied_comments_v2";

function loadAllComments(): Record<string, Comment[]> {
  try { return JSON.parse(localStorage.getItem(COMMENTS_KEY) || "{}"); } catch { return {}; }
}
function saveAllComments(data: Record<string, Comment[]>) {
  localStorage.setItem(COMMENTS_KEY, JSON.stringify(data));
}

export const commentStore = {
  getComments(movieId: string): Comment[] {
    const all = loadAllComments();
    return (all[movieId] || []).sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
  },
  addComment(comment: Omit<Comment, "id">): Comment {
    const all = loadAllComments();
    const newComment: Comment = { ...comment, id: `c_${Date.now()}_${Math.random().toString(36).slice(2)}` };
    if (!all[comment.movie_id]) all[comment.movie_id] = [];
    all[comment.movie_id].unshift(newComment);
    saveAllComments(all);
    return newComment;
  },
  editComment(id: string, movieId: string, content: string): void {
    const all = loadAllComments();
    const list = all[movieId] || [];
    const idx = list.findIndex(c => c.id === id);
    if (idx >= 0) { list[idx] = { ...list[idx], content, edited: true }; all[movieId] = list; saveAllComments(all); }
  },
  deleteComment(id: string, movieId: string): void {
    const all = loadAllComments();
    if (all[movieId]) { all[movieId] = all[movieId].filter(c => c.id !== id); saveAllComments(all); }
  },
  likeComment(id: string, movieId: string): void {
    const all = loadAllComments();
    const list = all[movieId] || [];
    const idx = list.findIndex(c => c.id === id);
    if (idx >= 0) { list[idx] = { ...list[idx], likes: (list[idx].likes || 0) + 1 }; all[movieId] = list; saveAllComments(all); }
  },
  getAllMoviesWithComments(): { movieId: string; count: number }[] {
    const all = loadAllComments();
    return Object.entries(all).map(([movieId, comments]) => ({ movieId, count: comments.length })).filter(x => x.count > 0);
  },
};

// ── Like helpers (localStorage) ──────────────────────────────────────────────
const LIKES_KEY = "moovied_movie_likes";
const LIKED_KEY = "moovied_user_liked";

export const likeStore = {
  getLikes(movieId: string): number {
    try { const d = JSON.parse(localStorage.getItem(LIKES_KEY) || "{}"); return d[movieId] || 0; } catch { return 0; }
  },
  hasLiked(movieId: string): boolean {
    try { const d = JSON.parse(localStorage.getItem(LIKED_KEY) || "{}"); return !!d[movieId]; } catch { return false; }
  },
  toggleLike(movieId: string): { liked: boolean; count: number } {
    const likes: Record<string, number> = JSON.parse(localStorage.getItem(LIKES_KEY) || "{}");
    const liked: Record<string, boolean> = JSON.parse(localStorage.getItem(LIKED_KEY) || "{}");
    if (liked[movieId]) {
      liked[movieId] = false;
      likes[movieId] = Math.max(0, (likes[movieId] || 1) - 1);
    } else {
      liked[movieId] = true;
      likes[movieId] = (likes[movieId] || 0) + 1;
    }
    localStorage.setItem(LIKES_KEY, JSON.stringify(likes));
    localStorage.setItem(LIKED_KEY, JSON.stringify(liked));
    return { liked: liked[movieId], count: likes[movieId] };
  },
};

// ── Episode JSON parser ───────────────────────────────────────────────────────
function parseMovieEpisodes(movie: Movie): Movie {
  if (!movie.episodes || Array.isArray(movie.episodes)) return movie;
  try {
    const parsed = JSON.parse(movie.episodes as unknown as string);
    if (Array.isArray(parsed)) return { ...movie, episodes: parsed };
  } catch {}
  return { ...movie, episodes: [] };
}

// ── Core fetch: Google Sheet is the single source of truth ───────────────────
async function fetchMoviesFromGas(): Promise<Movie[]> {
  // Try the rich endpoint first (returns like/comment counts too)
  try {
    const data = await gasGet("getAllData");
    if (Array.isArray(data.movies)) return (data.movies as Movie[]).map(parseMovieEpisodes);
  } catch {}
  // Fall back to the basic endpoint
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

  // ── getMovies: ALWAYS tries GAS. Never returns demo movies.
  // ── Shows stale cache instantly, then revalidates in background.
  async getMovies(): Promise<{ movies: Movie[] }> {
    const cached = readCache();

    if (cached) {
      // Return cache instantly, refresh from GAS in background
      fetchMoviesFromGas()
        .then((fresh) => { if (fresh.length > 0) writeCache(fresh); })
        .catch(() => {});
      return { movies: cached };
    }

    // No cache: must wait for GAS
    try {
      const movies = await fetchMoviesFromGas();
      if (movies.length > 0) writeCache(movies);
      return { movies };
    } catch (err) {
      // GAS not reachable and no cache → return empty (not demo)
      return { movies: [] };
    }
  },

  async getMovieById(id: string): Promise<{ movie: Movie }> {
    const cached = readCache();
    if (cached) {
      const found = cached.find((m) => m.id === id);
      if (found) return { movie: found };
    }
    // Fetch all and cache, then find
    const movies = await fetchMoviesFromGas();
    if (movies.length > 0) writeCache(movies);
    const found = movies.find((m) => m.id === id);
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
    return gasRequest("addViewCount", { movieId, userId }).catch(() => null);
  },

  async getUsers(): Promise<{ users: User[] }> { return gasGet("getUsers"); },
  async deleteUser(id: string) { return gasRequest("deleteUser", { id }); },
  async logActivity(userId: string, action: string) { return gasRequest("logActivity", { userId, action }).catch(() => null); },
  async getStats(): Promise<{ totalUsers: number; totalMovies: number; totalViews: number; totalComments: number }> { return gasGet("getStats"); },
  async getActivityLogs(): Promise<{ logs: ActivityLog[] }> { return gasGet("getActivityLogs"); },

  // Email — admin only
  async sendEmailToUser(userId: string, subject: string, htmlBody: string) {
    return gasRequest("sendEmailToUser", { userId, subject, htmlBody });
  },
  async sendEmailToAll(subject: string, htmlBody: string) {
    return gasRequest("sendEmailToAll", { subject, htmlBody });
  },
};

// ── Real PostgreSQL comment API (Express + PostgreSQL on Replit) ──────────────
// This is the primary comment backend — data stored in PostgreSQL, shared across all users.
// Fallback to GAS comments if this URL is not reachable.

const COMMENTS_API_KEY = "moovied_comments_api_url";
const DEFAULT_COMMENTS_API = "https://a16cbf22-021e-4fbd-a6d1-5c8d3c7e4244-00-923mtzjoxrcz.worf.replit.dev/api";

export function getCommentsApiUrl(): string {
  return localStorage.getItem(COMMENTS_API_KEY) || DEFAULT_COMMENTS_API;
}
export function setCommentsApiUrl(url: string) {
  localStorage.setItem(COMMENTS_API_KEY, url);
}

export const realComments = {
  async getComments(movieId: string): Promise<Comment[]> {
    const r = await fetch(`${getCommentsApiUrl()}/comments?movieId=${encodeURIComponent(movieId)}`);
    if (!r.ok) throw new Error("API error");
    const d = await r.json();
    return d.comments || [];
  },

  async getAllComments(): Promise<Comment[]> {
    const r = await fetch(`${getCommentsApiUrl()}/comments/all`);
    if (!r.ok) throw new Error("API error");
    const d = await r.json();
    return d.comments || [];
  },

  async addComment(
    movieId: string, userId: string, userName: string, content: string,
    replyTo?: string, replyToName?: string
  ): Promise<Comment | null> {
    const r = await fetch(`${getCommentsApiUrl()}/comments`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ movie_id: movieId, user_id: userId, user_name: userName, content, reply_to: replyTo, reply_to_name: replyToName }),
    });
    if (!r.ok) throw new Error("API error");
    const d = await r.json();
    return d.comment || null;
  },

  async editComment(id: string, _movieId: string, content: string): Promise<void> {
    await fetch(`${getCommentsApiUrl()}/comments/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content }),
    });
  },

  async deleteComment(id: string): Promise<void> {
    await fetch(`${getCommentsApiUrl()}/comments/${id}`, { method: "DELETE" });
  },

  async likeComment(id: string): Promise<number> {
    const r = await fetch(`${getCommentsApiUrl()}/comments/${id}/like`, { method: "POST" });
    if (!r.ok) return 0;
    const d = await r.json();
    return d.likes || 0;
  },
};

// ── GAS-backed comments (shared across all users) ─────────────────────────────
export const gasComments = {
  async getComments(movieId: string): Promise<Comment[]> {
    try {
      const data = await gasGet("getComments", { movieId });
      return data.comments || [];
    } catch { return []; }
  },
  async getAllComments(): Promise<Comment[]> {
    try {
      const data = await gasGet("getAllComments");
      return data.comments || [];
    } catch { return []; }
  },
  async addComment(
    movieId: string, userId: string, userName: string, content: string,
    replyTo?: string, replyToName?: string
  ): Promise<Comment | null> {
    try {
      const params: Record<string, unknown> = { movieId, userId, userName, content };
      if (replyTo) params.reply_to = replyTo;
      if (replyToName) params.reply_to_name = replyToName;
      const data = await gasRequest("addComment", params);
      return data.comment || null;
    } catch { return null; }
  },
  async editComment(id: string, _movieId: string, content: string): Promise<void> {
    await gasRequest("editComment", { id, content }).catch(() => {});
  },
  async deleteComment(id: string): Promise<void> {
    await gasRequest("deleteComment", { id }).catch(() => {});
  },
  async likeComment(id: string): Promise<number> {
    try { const data = await gasRequest("likeComment", { id }); return data.likes || 0; } catch { return 0; }
  },
};

// ── GAS-backed watch history ──────────────────────────────────────────────────
export const gasWatchHistory = {
  async add(userId: string, movieId: string, progress = 0) {
    return gasRequest("addToWatchHistory", { userId, movieId, progress }).catch(() => null);
  },
  async get(userId: string): Promise<{ movie_id: string; watched_at: string; progress: number }[]> {
    try { const d = await gasGet("getWatchHistory", { userId }); return d.history || []; } catch { return []; }
  },
};

// ── GAS-backed bookmarks ──────────────────────────────────────────────────────
export const gasBookmarks = {
  async toggle(userId: string, movieId: string): Promise<{ bookmarked: boolean }> {
    const data = await gasRequest("toggleBookmark", { userId, movieId });
    return { bookmarked: !!data.bookmarked };
  },
  async get(userId: string): Promise<string[]> {
    try { const d = await gasGet("getBookmarks", { userId }); return (d.bookmarks || []).map((b: { movie_id: string }) => b.movie_id); } catch { return []; }
  },
};

// ── GAS-backed movie likes ────────────────────────────────────────────────────
export const gasMovieLikes = {
  async toggle(userId: string, movieId: string): Promise<{ liked: boolean; count: number }> {
    const data = await gasRequest("toggleMovieLike", { userId, movieId });
    return { liked: !!data.liked, count: data.count || 0 };
  },
  async getCount(movieId: string): Promise<number> {
    try { const d = await gasGet("getMovieLikes", { movieId }); return d.count || 0; } catch { return 0; }
  },
};

// ── Demo movies (shown ONLY when no GAS URL is configured) ───────────────────
export const DEMO_MOVIES: Movie[] = [
  { id: "demo1", title: "Cosmic Odyssey", description: "A breathtaking journey through the cosmos as humanity's last crew ventures beyond known space to find a new home.", synopsis: "In the year 2157, Earth is dying. The last hope lies beyond the known galaxy — a mission of extraordinary courage and sacrifice. Dr. Elena Voss leads a team of eight astronauts aboard the USCSS Prometheus into the unknown. Facing gravitational anomalies, dwindling resources, and psychological breakdowns, the crew must confront not just the cosmos, but their own humanity. Stunning visuals and deep storytelling make this an unforgettable sci-fi epic that asks: what does it mean to be human when everything we know is gone?", poster_url: "https://images.unsplash.com/photo-1446776877081-d282a0f896e2?w=800&q=80", video_url: "https://www.w3schools.com/html/mov_bbb.mp4", download_url: "#", genre: "Sci-Fi", year: "2024", views: 15820, rating: 8.7, tmdb_rating: 8.2, rt_rating: 91, runtime: "2h 18m", director: "James Cameron", director_image: "https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=200&q=80", cast: "Tom Hardy|https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=200&q=80|Captain\nScarlett Johansson|https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=200&q=80|Dr. Elena Voss\nMatt Damon|https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?w=200&q=80|Engineer\nZoe Saldana|https://images.unsplash.com/photo-1517841905240-472988babdf9?w=200&q=80|Navigator\nIdris Elba|https://images.unsplash.com/photo-1500048993953-d23a436266cf?w=200&q=80|Commander", gallery: "https://images.unsplash.com/photo-1446776877081-d282a0f896e2?w=600&q=80,https://images.unsplash.com/photo-1419242902214-272b3f66ee7a?w=600&q=80,https://images.unsplash.com/photo-1462331940025-496dfbfc7564?w=600&q=80,https://images.unsplash.com/photo-1516339901601-2e1b62dc0c45?w=600&q=80,https://images.unsplash.com/photo-1534996858221-380b92700493?w=600&q=80" },
  { id: "demo2", title: "Midnight Protocol", description: "A gripping thriller where a lone hacker discovers a government conspiracy.", synopsis: "When cyber-security analyst Maya Chen uncovers an encrypted file that could expose the most powerful government conspiracy of the century, she becomes target number one. With her digital footprint erased and allies turning against her, Maya must outwit a shadow network of assassins while staying one step ahead of the world's most advanced surveillance system. Every click, every keystroke, every heartbeat brings her closer to the truth — and closer to danger.", poster_url: "https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=800&q=80", video_url: "https://www.w3schools.com/html/mov_bbb.mp4", download_url: "#", genre: "Thriller", year: "2024", views: 12340, rating: 8.2, tmdb_rating: 7.9, rt_rating: 84, runtime: "1h 54m", director: "David Fincher", cast: "Natalie Portman|https://images.unsplash.com/photo-1544005313-94ddf0286df2?w=200&q=80|Maya Chen\nBenedict Cumberbatch|https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=200&q=80|Director Kane\nMargot Robbie|https://images.unsplash.com/photo-1438761681033-6461ffad8d80?w=200&q=80|Agent Sara\nMichael Fassbender|https://images.unsplash.com/photo-1519085360753-af0119f7cbe7?w=200&q=80|Shadow\nCharlize Theron|https://images.unsplash.com/photo-1487412720507-e7ab37603c6f?w=200&q=80|Handler", gallery: "https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=600&q=80,https://images.unsplash.com/photo-1518770660439-4636190af475?w=600&q=80,https://images.unsplash.com/photo-1526374965328-7f61d4dc18c5?w=600&q=80,https://images.unsplash.com/photo-1551808525-51a94da548ce?w=600&q=80,https://images.unsplash.com/photo-1550751827-4bd374c3f58b?w=600&q=80" },
  { id: "demo3", title: "Ember Falls", description: "A sweeping drama set against the backdrop of a small mountain town.", poster_url: "https://images.unsplash.com/photo-1489599849927-2ee91cede3ba?w=800&q=80", video_url: "https://www.w3schools.com/html/mov_bbb.mp4", download_url: "#", genre: "Drama", year: "2023", views: 9870, rating: 7.9, runtime: "2h 5m" },
  { id: "demo4", title: "Shadow Strike", description: "Elite operatives go deep undercover in this pulse-pounding action film.", poster_url: "https://images.unsplash.com/photo-1440404653325-ab127d49abc1?w=800&q=80", video_url: "https://www.w3schools.com/html/mov_bbb.mp4", download_url: "#", genre: "Action", year: "2024", views: 21500, rating: 8.0, runtime: "1h 48m" },
  { id: "demo5", title: "Laughing Stock", description: "A hilarious comedy about a failed comedian who accidentally becomes a viral sensation.", poster_url: "https://images.unsplash.com/photo-1507679799987-c73779587ccf?w=800&q=80", video_url: "https://www.w3schools.com/html/mov_bbb.mp4", download_url: "#", genre: "Comedy", year: "2023", views: 7620, rating: 7.5, runtime: "1h 38m" },
  { id: "demo6", title: "Phantom Waves", description: "A supernatural horror film where a coastal town is plagued by terrifying apparitions.", poster_url: "https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=800&q=80", video_url: "https://www.w3schools.com/html/mov_bbb.mp4", download_url: "#", genre: "Horror", year: "2024", views: 18900, rating: 7.6, runtime: "1h 52m" },
  { id: "demo7", title: "Neon City", description: "In a rain-soaked cyberpunk metropolis, a rogue detective hunts a serial killer.", poster_url: "https://images.unsplash.com/photo-1501386761578-eac5c94b800a?w=800&q=80", video_url: "https://www.w3schools.com/html/mov_bbb.mp4", download_url: "#", genre: "Sci-Fi", year: "2023", views: 14230, rating: 8.5, runtime: "2h 12m" },
  { id: "demo8", title: "Wild Horizon", description: "An epic adventure that follows three explorers as they navigate uncharted wilderness.", poster_url: "https://images.unsplash.com/photo-1518020382113-a7e8fc38eac9?w=800&q=80", video_url: "https://www.w3schools.com/html/mov_bbb.mp4", download_url: "#", genre: "Adventure", year: "2024", views: 11450, rating: 8.3, runtime: "2h 22m" },
];
