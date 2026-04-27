import { useState } from "react";
import { useLocation } from "wouter";

const CATEGORIES = ["All", "Movies", "TV Shows", "Anime"];
const POPULAR    = ["Avengers", "Batman", "Interstellar", "Joker", "Inception", "Spiderman"];

export default function SearchHero() {
  const [query, setQuery]     = useState("");
  const [, navigate]          = useLocation();

  const doSearch = (q: string) => {
    const term = q.trim();
    if (!term) return;
    navigate("/movies?search=" + encodeURIComponent(term));
  };

  const handleKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") doSearch(query);
  };

  return (
    <>
      <style>{`
        .sh-hero {
          position: relative;
          border-radius: 20px;
          overflow: hidden;
          padding: 1px;
          background: linear-gradient(
            120deg,
            rgba(255,255,255,0.25),
            rgba(255,255,255,0.05),
            rgba(255,255,255,0.25)
          );
          margin: 0 16px 8px;
        }
        @media(min-width:768px){ .sh-hero{ border-radius:28px; margin:0 24px 12px; } }
        @media(min-width:1024px){ .sh-hero{ margin:0 32px 16px; } }

        .sh-inner {
          position: relative;
          height: 100%;
          border-radius: inherit;
          overflow: hidden;
          background: #000;
        }
        .sh-bg {
          position: absolute;
          inset: 0;
          width: 100%;
          height: 100%;
          object-fit: cover;
          filter: brightness(0.3);
        }
        .sh-overlay {
          position: absolute;
          inset: 0;
          background: linear-gradient(to bottom, rgba(0,0,0,0.55), #000);
        }
        .sh-glass {
          background: rgba(255,255,255,0.07);
          backdrop-filter: blur(18px);
          border: 1px solid rgba(255,255,255,0.13);
          transition: border-color .25s, box-shadow .25s;
        }
        .sh-glass:focus-within {
          border-color: rgba(255,255,255,0.35);
          box-shadow: 0 0 0 3px rgba(255,255,255,0.06);
        }
        .sh-chip {
          background: rgba(255,255,255,0.08);
          border: 1px solid rgba(255,255,255,0.1);
          transition: background .2s;
          cursor: pointer;
        }
        .sh-chip:hover { background: rgba(255,255,255,0.16); }
        .sh-btn {
          transition: box-shadow .25s, background .2s;
        }
        .sh-btn:hover { box-shadow: 0 0 22px rgba(255,255,255,0.25); }
      `}</style>

      <div
        className="sh-hero"
        style={{ height: "clamp(300px, 38vw, 460px)" }}
      >
        <div className="sh-inner">

          {/* Background image */}
          <img
            className="sh-bg"
            src="https://res.cloudinary.com/digorezin/image/upload/v1745851537/Netflix-Background_bgtauh.jpg"
            alt=""
          />
          <div className="sh-overlay" />

          {/* Content */}
          <div className="relative z-10 h-full flex flex-col justify-center items-center text-center px-4 sm:px-8">

            <h1 className="text-white font-semibold text-xl sm:text-2xl md:text-3xl lg:text-4xl mb-2">
              Find Your Next Movie
            </h1>
            <p className="text-white/55 text-xs sm:text-sm md:text-base mb-5 max-w-md sm:max-w-xl">
              Search from thousands of movies &amp; shows
            </p>

            {/* Search bar */}
            <div className="w-full max-w-2xl flex flex-col sm:flex-row gap-3">
              <div className="sh-glass flex items-center gap-3 px-4 py-3 rounded-full flex-1">
                <svg className="w-5 h-5 flex-shrink-0 text-white/50" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                  <circle cx="11" cy="11" r="8" />
                  <line x1="21" y1="21" x2="16.65" y2="16.65" />
                </svg>
                <input
                  type="text"
                  placeholder="Search movies, shows..."
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  onKeyDown={handleKey}
                  className="w-full bg-transparent outline-none text-white placeholder-white/40 text-sm sm:text-base"
                />
                {query && (
                  <button onClick={() => setQuery("")} className="text-white/40 hover:text-white transition-colors">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                      <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                    </svg>
                  </button>
                )}
              </div>

              <button
                onClick={() => doSearch(query)}
                className="sh-btn px-6 py-3 rounded-full bg-white text-black font-semibold text-sm sm:text-base flex items-center justify-center gap-2 w-full sm:w-auto"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                </svg>
                Search
              </button>
            </div>

            {/* Category chips */}
            <div className="flex gap-2 flex-wrap justify-center mt-4">
              {CATEGORIES.map((cat) => (
                <button
                  key={cat}
                  onClick={() => navigate("/movies" + (cat !== "All" ? `?genre=${encodeURIComponent(cat)}` : ""))}
                  className="sh-chip px-3 sm:px-4 py-1 rounded-full text-white/80 text-xs sm:text-sm"
                >
                  {cat}
                </button>
              ))}
            </div>

            {/* Popular searches */}
            <div className="flex flex-wrap gap-2 justify-center mt-3">
              <span className="text-white/30 text-[10px] sm:text-xs self-center">Popular:</span>
              {POPULAR.map((term) => (
                <button
                  key={term}
                  onClick={() => doSearch(term)}
                  className="sh-chip px-3 py-1 rounded-full text-white/65 text-[10px] sm:text-xs"
                >
                  {term}
                </button>
              ))}
            </div>

            <p className="text-white/35 text-[10px] sm:text-xs mt-3">10,000+ titles available</p>
          </div>

        </div>
      </div>
    </>
  );
}
