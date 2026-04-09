import { useState } from "react";
import { Link } from "wouter";
import { Star, Play, Bookmark, BookmarkCheck } from "lucide-react";
import { type Movie } from "@/lib/api";
import { formatViews } from "@/lib/utils";
import { toggleBookmark, isBookmarked, getCurrentUser } from "@/lib/auth";

interface MovieCardProps {
  movie: Movie;
  onBookmarkChange?: () => void;
}

export default function MovieCard({ movie, onBookmarkChange }: MovieCardProps) {
  const [bookmarked, setBookmarked] = useState(isBookmarked(movie.id));
  const [hovered, setHovered] = useState(false);
  const [imgError, setImgError] = useState(false);

  const user = getCurrentUser();

  const handleBookmark = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!user) return;
    const newState = toggleBookmark(movie.id);
    setBookmarked(newState);
    onBookmarkChange?.();
  };

  return (
    <Link
      href={`/movie/${movie.id}`}
      className="block group relative rounded-xl overflow-hidden cursor-pointer"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <div className="relative aspect-[2/3] bg-zinc-950 overflow-hidden rounded-xl">
        {!imgError ? (
          <img
            src={movie.poster_url}
            alt={movie.title}
            loading="lazy"
            className={`w-full h-full object-cover transition-transform duration-500 ${hovered ? "scale-110" : "scale-100"}`}
            onError={() => setImgError(true)}
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-gray-800 to-gray-900">
            <span className="text-4xl font-black text-white/20">{movie.title[0]}</span>
          </div>
        )}

        <div
          className={`absolute inset-0 bg-gradient-to-t from-black via-black/60 to-transparent transition-opacity duration-300 ${hovered ? "opacity-90" : "opacity-60"}`}
        />

        <div
          className={`absolute inset-0 flex items-center justify-center transition-all duration-300 ${hovered ? "opacity-100 scale-100" : "opacity-0 scale-75"}`}
        >
          <div className="bg-yellow-400 rounded-full p-4 shadow-lg shadow-yellow-400/30">
            <Play className="w-6 h-6 text-black fill-black" />
          </div>
        </div>

        {user && (
          <button
            onClick={handleBookmark}
            className={`absolute top-2 right-2 p-1.5 rounded-full transition-all ${
              bookmarked
                ? "bg-yellow-400 text-black"
                : "bg-black/60 text-white hover:bg-yellow-400/20 hover:text-yellow-400"
            } ${hovered ? "opacity-100" : "opacity-0 group-hover:opacity-100"}`}
          >
            {bookmarked ? (
              <BookmarkCheck className="w-4 h-4" />
            ) : (
              <Bookmark className="w-4 h-4" />
            )}
          </button>
        )}

        <div className="absolute bottom-0 left-0 right-0 p-3">
          <div className="flex items-center gap-1 mb-1">
            <span className="text-xs font-medium bg-yellow-400 text-black px-1.5 py-0.5 rounded">
              {movie.genre}
            </span>
            <span className="text-xs text-white/60">{movie.year}</span>
          </div>
          <h3 className="text-sm font-bold text-white line-clamp-2 leading-tight">{movie.title}</h3>
          <div className="flex items-center gap-3 mt-1">
            {movie.rating ? (
              <div className="flex items-center gap-1">
                <Star className="w-3 h-3 text-yellow-400 fill-yellow-400" />
                <span className="text-xs text-yellow-400 font-medium">{movie.rating}</span>
              </div>
            ) : null}
            <span className="text-xs text-white/40">{formatViews(movie.views)} views</span>
          </div>
        </div>
      </div>
    </Link>
  );
}
