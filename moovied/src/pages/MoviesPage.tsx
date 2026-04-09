import { useState, useEffect, useMemo } from "react";
import { useSearch } from "wouter";
import Navbar from "@/components/Navbar";
import MovieCard from "@/components/MovieCard";
import { useMovies } from "@/hooks/useMovies";
import { Search, Filter } from "lucide-react";

const GENRES = ["All", "Action", "Comedy", "Drama", "Horror", "Sci-Fi", "Thriller", "Adventure", "Romance", "Animation"];

export default function MoviesPage() {
  const { movies, loading } = useMovies();
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedGenre, setSelectedGenre] = useState("All");
  const [sortBy, setSortBy] = useState<"views" | "year" | "rating" | "title">("views");
  const [visibleCount, setVisibleCount] = useState(24);
  const search = useSearch();

  useEffect(() => {
    const params = new URLSearchParams(search);
    const q = params.get("search") || "";
    const g = params.get("genre") || "All";
    const s = (params.get("sort") || "views") as typeof sortBy;
    setSearchQuery(q);
    setSelectedGenre(g);
    setSortBy(["views", "year", "rating", "title"].includes(s) ? s : "views");
  }, [search]);

  const filtered = useMemo(() => {
    let result = [...movies];
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter(
        (m) =>
          m.title.toLowerCase().includes(q) ||
          m.genre.toLowerCase().includes(q) ||
          m.description.toLowerCase().includes(q)
      );
    }
    if (selectedGenre !== "All") {
      result = result.filter((m) => m.genre === selectedGenre);
    }
    result.sort((a, b) => {
      if (sortBy === "views") return b.views - a.views;
      if (sortBy === "year") return parseInt(b.year) - parseInt(a.year);
      if (sortBy === "rating") return (b.rating || 0) - (a.rating || 0);
      if (sortBy === "title") return a.title.localeCompare(b.title);
      return 0;
    });
    return result;
  }, [movies, searchQuery, selectedGenre, sortBy]);

  return (
    <div className="min-h-screen bg-black text-white">
      <Navbar onSearch={setSearchQuery} searchQuery={searchQuery} />

      <div className="pt-20 pb-16">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="mb-8">
            <h1 className="text-3xl font-black text-white mb-2">All Movies</h1>
            <p className="text-white/50">{filtered.length} movies available</p>
          </div>

          <div className="flex flex-col gap-4 mb-8">
            <div className="flex items-center gap-3 bg-white/5 border border-white/10 rounded-xl px-4 py-3">
              <Search className="w-5 h-5 text-white/40 flex-shrink-0" />
              <input
                type="text"
                placeholder="Search movies, genres..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="bg-transparent text-white w-full outline-none placeholder:text-white/30"
              />
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <div className="flex items-center gap-2 flex-wrap flex-1">
                {GENRES.map((genre) => (
                  <button
                    key={genre}
                    onClick={() => setSelectedGenre(genre)}
                    className={`px-3 py-1.5 rounded-full text-sm font-medium transition-all ${
                      selectedGenre === genre
                        ? "bg-yellow-400 text-black"
                        : "bg-white/10 text-white/70 hover:bg-white/20"
                    }`}
                  >
                    {genre}
                  </button>
                ))}
              </div>

              <div className="flex items-center gap-2">
                <Filter className="w-4 h-4 text-white/50" />
                <select
                  value={sortBy}
                  onChange={(e) => setSortBy(e.target.value as typeof sortBy)}
                  className="bg-white/10 border border-white/20 text-white text-sm rounded-lg px-3 py-1.5 outline-none"
                >
                  <option value="views">Most Viewed</option>
                  <option value="year">Newest First</option>
                  <option value="rating">Highest Rated</option>
                  <option value="title">Alphabetical</option>
                </select>
              </div>
            </div>
          </div>

          {loading ? (
            <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 gap-3">
              {Array.from({ length: 18 }).map((_, i) => (
                <div key={i} className="aspect-[2/3] bg-gray-800 rounded-xl animate-pulse" />
              ))}
            </div>
          ) : filtered.length > 0 ? (
            <>
              <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 gap-3">
                {filtered.slice(0, visibleCount).map((movie) => (
                  <MovieCard key={movie.id} movie={movie} />
                ))}
              </div>
              {visibleCount < filtered.length && (
                <div className="text-center mt-8">
                  <button
                    onClick={() => setVisibleCount((c) => c + 24)}
                    className="bg-yellow-400/10 hover:bg-yellow-400/20 border border-yellow-400/30 text-yellow-400 font-medium px-8 py-3 rounded-xl transition-all"
                  >
                    Show More ({filtered.length - visibleCount} remaining)
                  </button>
                </div>
              )}
            </>
          ) : (
            <div className="text-center py-24">
              <p className="text-white/40 text-lg">No movies found</p>
              <button
                onClick={() => { setSearchQuery(""); setSelectedGenre("All"); }}
                className="mt-4 text-yellow-400 hover:underline text-sm"
              >
                Clear filters
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
