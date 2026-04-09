/**
 * movieMeta — persistent store for extended movie fields that Google Sheets
 * doesn't know about (synopsis, cast, gallery, download links, ratings, etc.)
 *
 * Flow:
 *  Admin saves movie  →  saveMovieMeta(id, fullMovieObject)
 *  Movies loaded from GAS → writeCache merges GAS data with stored meta
 *  Movie page renders  →  sees full data
 */

import type { Movie } from "./api";

const META_KEY = "moovied_movie_meta_v2";

// These are the fields that live only in localStorage (not in the GAS backend).
export const EXTENDED_FIELDS: (keyof Movie)[] = [
  "synopsis",
  "yt_link",
  "tmdb_rating",
  "rt_rating",
  "director",
  "director_image",
  "cast",
  "gallery",
  "dl_2160p",
  "dl_1080p",
  "dl_720p",
  "dl_480p",
  "dl_360p",
  "subtitle_url",
  "type",
  "episodes",
];

type MetaStore = Record<string, Partial<Movie>>;

function loadMetaStore(): MetaStore {
  try {
    return JSON.parse(localStorage.getItem(META_KEY) || "{}");
  } catch {
    return {};
  }
}

function saveMetaStore(store: MetaStore) {
  try {
    localStorage.setItem(META_KEY, JSON.stringify(store));
  } catch {}
}

/** Save extended fields for a movie (called on admin add/edit). */
export function saveMovieMeta(movie: Movie) {
  const store = loadMetaStore();
  const meta: Partial<Movie> = {};
  for (const field of EXTENDED_FIELDS) {
    const val = movie[field];
    if (val !== undefined && val !== null && val !== "") {
      (meta as Record<string, unknown>)[field] = val;
    }
  }
  // Also persist core display fields as fallback
  meta.title = movie.title;
  meta.poster_url = movie.poster_url;
  meta.genre = movie.genre;
  meta.year = movie.year;
  meta.rating = movie.rating;
  meta.runtime = movie.runtime;
  store[movie.id] = { ...(store[movie.id] || {}), ...meta };
  saveMetaStore(store);
}

/** Remove meta when a movie is deleted. */
export function deleteMovieMeta(movieId: string) {
  const store = loadMetaStore();
  delete store[movieId];
  saveMetaStore(store);
}

/**
 * Merge extended meta into a movie loaded from GAS.
 * GAS fields always win for basic fields; meta fills in what GAS doesn't return.
 */
export function mergeMovieMeta(movie: Movie): Movie {
  const store = loadMetaStore();
  const meta = store[movie.id];
  if (!meta) return movie;
  const merged: Movie = { ...meta, ...movie } as Movie;
  // Restore extended fields that GAS strips (prefer meta for these)
  for (const field of EXTENDED_FIELDS) {
    const gasVal = movie[field];
    const metaVal = meta[field as keyof typeof meta];
    if ((gasVal === undefined || gasVal === null || gasVal === "") && metaVal) {
      (merged as unknown as Record<string, unknown>)[field] = metaVal;
    }
  }
  return merged;
}

/** Merge all movies in an array with their stored meta. */
export function mergeAllMovieMeta(movies: Movie[]): Movie[] {
  return movies.map(mergeMovieMeta);
}
