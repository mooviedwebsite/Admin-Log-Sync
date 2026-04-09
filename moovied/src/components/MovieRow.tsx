import { ChevronLeft, ChevronRight } from "lucide-react";
import { useRef, useState } from "react";
import MovieCard from "./MovieCard";
import { type Movie } from "@/lib/api";

interface MovieRowProps {
  title: string;
  movies: Movie[];
  showAll?: boolean;
}

export default function MovieRow({ title, movies, showAll }: MovieRowProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(true);

  const scroll = (dir: "left" | "right") => {
    if (!scrollRef.current) return;
    const amount = 400;
    scrollRef.current.scrollBy({ left: dir === "left" ? -amount : amount, behavior: "smooth" });
  };

  const handleScroll = () => {
    if (!scrollRef.current) return;
    const { scrollLeft, scrollWidth, clientWidth } = scrollRef.current;
    setCanScrollLeft(scrollLeft > 0);
    setCanScrollRight(scrollLeft + clientWidth < scrollWidth - 10);
  };

  if (!movies.length) return null;

  return (
    <div className="mb-10">
      <h2 className="text-xl sm:text-2xl font-bold text-white mb-4 px-4 sm:px-6 lg:px-8">
        {title}
      </h2>

      <div className="relative group">
        {canScrollLeft && (
          <button
            onClick={() => scroll("left")}
            className="absolute left-0 top-0 bottom-0 z-10 w-12 bg-gradient-to-r from-black to-transparent flex items-center justify-start pl-1 opacity-0 group-hover:opacity-100 transition-opacity"
          >
            <div className="bg-black/80 hover:bg-black rounded-full p-2">
              <ChevronLeft className="w-5 h-5 text-white" />
            </div>
          </button>
        )}

        <div
          ref={scrollRef}
          onScroll={handleScroll}
          className="flex gap-3 overflow-x-auto scrollbar-hide px-4 sm:px-6 lg:px-8 pb-2"
          style={{ scrollbarWidth: "none", msOverflowStyle: "none" }}
        >
          {(showAll ? movies : movies.slice(0, 12)).map((movie) => (
            <div key={movie.id} className="flex-shrink-0 w-36 sm:w-44">
              <MovieCard movie={movie} />
            </div>
          ))}
        </div>

        {canScrollRight && movies.length > 4 && (
          <button
            onClick={() => scroll("right")}
            className="absolute right-0 top-0 bottom-0 z-10 w-12 bg-gradient-to-l from-black to-transparent flex items-center justify-end pr-1 opacity-0 group-hover:opacity-100 transition-opacity"
          >
            <div className="bg-black/80 hover:bg-black rounded-full p-2">
              <ChevronRight className="w-5 h-5 text-white" />
            </div>
          </button>
        )}
      </div>
    </div>
  );
}
