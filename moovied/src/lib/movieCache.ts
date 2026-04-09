// movieCache — in-memory + localStorage cache for GAS movies.
// mergeAllMovieMeta is called in writeCache to enrich GAS data with any locally-stored
// extended fields (synopsis, cast, gallery, dl_*, etc.) that the admin entered.
// Once GAS v3 is updated and movies are re-saved, GAS becomes the source of truth
// and local meta becomes a no-op (it just returns GAS data unchanged).

const CACHE_KEY = "moovied_v4_movies";
const CACHE_TTL_MS = 30 * 60 * 1000; // 30 minutes (background refresh keeps it current)

import type { Movie } from "./api";
import { mergeAllMovieMeta } from "./movieMeta";

interface CacheEntry {
  movies: Movie[];
  ts: number;
}

type Listener = (movies: Movie[]) => void;
const listeners = new Set<Listener>();

export function subscribe(fn: Listener): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function emit(movies: Movie[]) {
  listeners.forEach((fn) => fn(movies));
}

export function readCache(): Movie[] | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const entry: CacheEntry = JSON.parse(raw);
    if (Date.now() - entry.ts > CACHE_TTL_MS) {
      localStorage.removeItem(CACHE_KEY);
      return null;
    }
    return entry.movies;
  } catch {
    return null;
  }
}

export function writeCache(movies: Movie[]) {
  try {
    // Enrich GAS data with locally-stored extended fields (synopsis, cast, gallery, etc.)
    // On the admin device this fills in fields GAS v2 didn't store.
    // On other devices mergeAllMovieMeta is a no-op (no local meta exists).
    const enriched = mergeAllMovieMeta(movies);
    const entry: CacheEntry = { movies: enriched, ts: Date.now() };
    localStorage.setItem(CACHE_KEY, JSON.stringify(entry));
    emit(enriched);
  } catch {
    emit(movies);
  }
}

export function invalidateCache() {
  localStorage.removeItem(CACHE_KEY);
  // Also clear old cache keys from previous versions
  localStorage.removeItem("moovied_v2_movies");
  localStorage.removeItem("moovied_v3_movies");
}

export function patchMovieInCache(movie: Movie) {
  const cached = readCache();
  if (!cached) return;
  const updated = cached.map((m) => (m.id === movie.id ? movie : m));
  writeCache(updated);
}

export function addMovieToCache(movie: Movie) {
  const cached = readCache() ?? [];
  const exists = cached.some((m) => m.id === movie.id);
  writeCache(exists ? cached.map((m) => (m.id === movie.id ? movie : m)) : [...cached, movie]);
}

export function removeMovieFromCache(id: string) {
  const cached = readCache();
  if (!cached) return;
  writeCache(cached.filter((m) => m.id !== id));
}

export function findInCache(id: string): Movie | undefined {
  return readCache()?.find((m) => m.id === id);
}
