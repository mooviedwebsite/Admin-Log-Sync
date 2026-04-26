import { useState, useMemo } from "react";
import Navbar from "@/components/Navbar";
import HeroBanner from "@/components/HeroBanner";
import MovieRow from "@/components/MovieRow";
import MovieCard from "@/components/MovieCard";
import { SkeletonRow } from "@/components/SkeletonCard";
import { useMovies } from "@/hooks/useMovies";
import { type Movie } from "@/lib/api";

export default function HomePage() {
  const { movies, loading } = useMovies();
  const [searchQuery, setSearchQuery] = useState("");

  const filtered = useMemo(() => {
    if (!searchQuery.trim()) return movies;
    const q = searchQuery.toLowerCase();
    return movies.filter(
      (m) =>
        m.title.toLowerCase().includes(q) ||
        m.genre.toLowerCase().includes(q) ||
        m.description.toLowerCase().includes(q)
    );
  }, [movies, searchQuery]);

  const trending = useMemo(
    () => [...movies].sort((a, b) => b.views - a.views).slice(0, 12),
    [movies]
  );

  const latest = useMemo(
    () => [...movies].sort((a, b) => parseInt(b.year) - parseInt(a.year)).slice(0, 12),
    [movies]
  );

  const genreGroups = useMemo(() => {
    const groups: Record<string, Movie[]> = {};
    movies.forEach((m) => {
      const genres = m.genre ? m.genre.split(",").map((g) => g.trim()).filter(Boolean) : ["Other"];
      genres.forEach((g) => {
        if (!groups[g]) groups[g] = [];
        if (!groups[g].some((existing) => existing.id === m.id)) {
          groups[g].push(m);
        }
      });
    });
    return groups;
  }, [movies]);

  return (
    <div className="min-h-screen bg-black text-white">
      <Navbar onSearch={setSearchQuery} searchQuery={searchQuery} />

      {searchQuery ? (
        <div className="pt-24 pb-12">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 mb-6">
            <h2 className="text-xl text-white/80">
              Search results for <span className="text-yellow-400 font-bold">"{searchQuery}"</span>
              <span className="text-white/40 ml-2">({filtered.length} found)</span>
            </h2>
          </div>
          {filtered.length > 0 ? (
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-7 gap-3">
              {filtered.map((movie) => (
                <MovieCard key={movie.id} movie={movie} />
              ))}
            </div>
          ) : (
            <div className="text-center py-24 text-white/40">
              <p className="text-lg">No movies found for "{searchQuery}"</p>
            </div>
          )}
        </div>
      ) : (
        <>
          {loading ? (
            <div className="pt-16">
              <div className="h-[70vh] min-h-[500px] bg-black animate-pulse" />
            </div>
          ) : (
            <HeroBanner movies={movies} />
          )}

          <div className="pt-8 pb-16">
            {loading ? (
              <>
                <SkeletonRow />
                <SkeletonRow />
                <SkeletonRow />
              </>
            ) : (
              <>
                <MovieRow title="Trending Now" movies={trending} />
                <MovieRow title="Latest Releases" movies={latest} />
                {Object.entries(genreGroups).map(([genre, genreMovies]) => (
                  <MovieRow key={genre} title={genre} movies={genreMovies} />
                ))}
              </>
            )}
          </div>
        </>
      )}

      <footer className="border-t border-white/10 py-8 text-center text-white/30 text-sm">
        <div className="flex items-center justify-center gap-2 mb-2">
          <span className="text-white font-black tracking-widest">MOOV<span className="text-yellow-400">IED</span></span>
        </div>
        <p>Stream &amp; Download your favorite movies.</p>
      </footer>
    </div>
  );
}
