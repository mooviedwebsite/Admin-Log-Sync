import { useState, useEffect, useCallback } from "react";
import { api, DEMO_MOVIES, getGasUrl, type Movie } from "@/lib/api";
import {
  readCache, writeCache, subscribe, findInCache, invalidateCache,
} from "@/lib/movieCache";

let globalFetchPromise: Promise<Movie[]> | null = null;

async function fetchAndCache(): Promise<Movie[]> {
  if (!globalFetchPromise) {
    globalFetchPromise = api
      .getMovies()
      .then((d) => {
        const gasConfigured = !!getGasUrl();

        if (d.movies.length > 0) {
          // Filter out any demo movies that slipped into GAS
          const real = d.movies.filter((m) => !m.id.startsWith("demo"));
          writeCache(real);
          return real;
        }

        // GAS returned 0 movies
        if (gasConfigured) {
          // GAS is set up but sheet is empty — show nothing (not demo)
          writeCache([]);
          return [];
        }

        // No GAS URL at all — show demo for preview purposes
        writeCache(DEMO_MOVIES);
        return DEMO_MOVIES;
      })
      .catch(() => {
        const gasConfigured = !!getGasUrl();
        // If GAS is configured but unreachable, return stale cache or empty
        // Never fall back to demo movies when a real backend is configured
        return readCache() ?? (gasConfigured ? [] : DEMO_MOVIES);
      })
      .finally(() => {
        globalFetchPromise = null;
      });
  }
  return globalFetchPromise;
}

export function useMovies() {
  const cached = readCache();
  // Start with cache (instant), but if cache has demo movies and GAS is configured,
  // treat it as empty so we don't flash demo content
  const gasConfigured = !!getGasUrl();
  const validCache = cached?.filter((m) => !(gasConfigured && m.id.startsWith("demo"))) ?? null;

  const [movies, setMovies] = useState<Movie[]>(validCache ?? []);
  const [loading, setLoading] = useState(!validCache || validCache.length === 0);
  const [refreshing, setRefreshing] = useState(false);

  const refresh = useCallback(async (force = false) => {
    if (force) {
      setRefreshing(true);
      invalidateCache();
      const fresh = await fetchAndCache();
      setMovies(fresh);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    const unsub = subscribe((updated) => {
      // Never push demo movies into state when GAS is configured
      const gc = !!getGasUrl();
      const filtered = gc ? updated.filter((m) => !m.id.startsWith("demo")) : updated;
      setMovies(filtered);
    });
    return unsub;
  }, []);

  useEffect(() => {
    const valid = readCache()?.filter((m) => !(!!getGasUrl() && m.id.startsWith("demo"))) ?? null;
    if (valid && valid.length > 0) {
      setMovies(valid);
      setLoading(false);
      // Revalidate silently in background
      fetchAndCache();
    } else {
      setLoading(true);
      fetchAndCache().then((m) => {
        setMovies(m);
        setLoading(false);
      });
    }
  }, []);

  return { movies, loading, refreshing, refresh };
}

export function useMovie(id: string | undefined) {
  const fromCache = id ? findInCache(id) : undefined;
  // Don't serve demo movies from cache when GAS is configured
  const gasConfigured = !!getGasUrl();
  const validCache = fromCache && !(gasConfigured && fromCache.id.startsWith("demo")) ? fromCache : undefined;

  const [movie, setMovie] = useState<Movie | undefined>(validCache);
  const [loading, setLoading] = useState(!validCache);

  useEffect(() => {
    if (!id) return;

    const gc = !!getGasUrl();
    const cached = findInCache(id);
    if (cached && !(gc && cached.id.startsWith("demo"))) {
      setMovie(cached);
      setLoading(false);
      return;
    }

    setLoading(true);
    fetchAndCache().then((movies) => {
      const found = movies.find((m) => m.id === id);
      setMovie(found);
      setLoading(false);
    });
  }, [id]);

  useEffect(() => {
    const unsub = subscribe((movies) => {
      if (!id) return;
      const found = movies.find((m) => m.id === id);
      if (found) setMovie(found);
    });
    return unsub;
  }, [id]);

  return { movie, loading };
}
