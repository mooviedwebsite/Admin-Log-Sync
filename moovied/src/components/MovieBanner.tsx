import { useEffect, useState, useRef } from "react";
import { Link } from "wouter";
import { Eye, Bookmark, BookmarkCheck } from "lucide-react";
import { type Movie } from "@/lib/api";
import { formatViews } from "@/lib/utils";
import "./HeroBanner.css";

interface MovieBannerProps {
  movie: Movie;
  onPlay: () => void;
  bookmarked?: boolean;
  onBookmark?: () => void;
  showBookmark?: boolean;
}

/** Extract YouTube video ID from any valid YT URL */
function extractYouTubeId(url: string | undefined): string | null {
  if (!url) return null;
  const match = url.match(
    /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/|youtube\.com\/v\/)([a-zA-Z0-9_-]{11})/
  );
  return match ? match[1] : null;
}

/** Build the fast-loading, no-UI YouTube embed URL */
function ytEmbedUrl(videoId: string): string {
  const params = new URLSearchParams({
    autoplay: "1",
    mute: "1",
    loop: "1",
    playlist: videoId,
    controls: "0",
    showinfo: "0",
    rel: "0",
    modestbranding: "1",
    iv_load_policy: "3",
    disablekb: "1",
    fs: "0",
    cc_load_policy: "0",
    playsinline: "1",
    start: "0",
  });
  return `https://www.youtube-nocookie.com/embed/${videoId}?${params.toString()}`;
}

export default function MovieBanner({
  movie,
  onPlay,
  bookmarked = false,
  onBookmark,
  showBookmark = false,
}: MovieBannerProps) {
  const [isActive, setIsActive] = useState(false);
  const [ytReady, setYtReady] = useState(false);
  const ytTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setYtReady(false);
    const t = setTimeout(() => setIsActive(true), 80);
    return () => clearTimeout(t);
  }, [movie.id]);

  const handleYtLoad = () => {
    if (ytTimerRef.current) clearTimeout(ytTimerRef.current);
    ytTimerRef.current = setTimeout(() => setYtReady(true), 150);
  };

  const videoId = extractYouTubeId(movie.yt_link);

  return (
    <div className="carousel-container">
      <div className="carousel-wrapper" style={{ cursor: "default" }}>
        <div className="carousel-track" style={{ transform: "translateX(0)" }}>
          <div className="movie-banner active">

            {/* Layer 0: Poster (instant fallback) */}
            <div
              className={`banner-bg${isActive ? " active" : ""}`}
              style={{ backgroundImage: `url('${movie.poster_url}')` }}
            />

            {/* Layer 1: YouTube video background */}
            {videoId && (
              <div className="hb-yt-wrap">
                <iframe
                  key={`yt-${movie.id}`}
                  className={`hb-yt-iframe${ytReady ? " hb-yt-ready" : ""}`}
                  src={ytEmbedUrl(videoId)}
                  allow="autoplay; encrypted-media"
                  frameBorder="0"
                  onLoad={handleYtLoad}
                  title="background"
                />
              </div>
            )}

            {/* Layer 2: Dark cinematic gradient overlay */}
            <div className="hb-dark-overlay" />

            {/* Layer 4: Content */}
            <div className="banner-content" style={{ paddingTop: "80px" }}>
              {/* Back link */}
              <Link
                href="/movies"
                className="hb-back-link"
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "6px",
                  color: "rgba(255,255,255,0.55)",
                  fontSize: "13px",
                  textDecoration: "none",
                  marginBottom: "18px",
                  transition: "color 0.2s",
                }}
                onMouseEnter={e => (e.currentTarget.style.color = "#fff")}
                onMouseLeave={e => (e.currentTarget.style.color = "rgba(255,255,255,0.55)")}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M15.41 16.59L10.83 12l4.58-4.59L14 6l-6 6 6 6z"/>
                </svg>
                All Movies
              </Link>

              {/* Badges */}
              <div className="hb-badges">
                {movie.rating && (
                  <div className="hb-imdb-badge">
                    <span className="hb-imdb-logo">IMDb</span>
                    <span className="hb-imdb-rating">
                      <span className="hb-star">★</span>
                      {movie.rating}
                    </span>
                  </div>
                )}
                <div className="hb-quality-badge hb-quality-badge-4k">
                  <span className="hb-quality-text">4K</span>
                </div>
                <div className="hb-quality-badge">HDR</div>
                {movie.year && <div className="hb-year-badge">{movie.year}</div>}
                <div className="hb-info-item" style={{ marginLeft: "4px" }}>
                  <Eye style={{ width: "13px", height: "13px", color: "#999" }} />
                  <span className="hb-info-value" style={{ fontSize: "12px" }}>
                    {formatViews(movie.views)}
                  </span>
                </div>
              </div>

              {/* Title */}
              <h1 className="hb-movie-title">{movie.title}</h1>

              {/* Genre pills */}
              {movie.genre && (
                <div className="hb-categories">
                  {movie.genre.split(/[,/]/).map((g) => (
                    <span key={g.trim()} className="hb-category">{g.trim()}</span>
                  ))}
                </div>
              )}

              {/* Description */}
              {movie.description && (
                <p className="hb-description" style={{ maxWidth: "700px" }}>
                  {movie.description}
                </p>
              )}

              {/* Info row */}
              {movie.runtime && (
                <div className="hb-info-row">
                  <div className="hb-info-item">
                    <span className="hb-info-label">Runtime:</span>
                    <span className="hb-info-value">{movie.runtime}</span>
                  </div>
                  <div className="hb-info-item">
                    <span className="hb-info-label">Genre:</span>
                    <span className="hb-info-value">{movie.genre}</span>
                  </div>
                  {movie.year && (
                    <div className="hb-info-item">
                      <span className="hb-info-label">Year:</span>
                      <span className="hb-info-value">{movie.year}</span>
                    </div>
                  )}
                </div>
              )}

              {/* Action buttons */}
              <div className="hb-action-btns">
                <button onClick={onPlay} className="hb-btn hb-btn-stream">
                  <svg className="hb-btn-icon" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M8 5v14l11-7z" />
                  </svg>
                  Watch Now
                </button>

                {movie.download_url && movie.download_url !== "#" && (
                  <a
                    href={movie.download_url}
                    className="hb-btn hb-btn-download"
                    target="_blank"
                    rel="noreferrer"
                  >
                    <svg className="hb-btn-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                      <polyline points="7 10 12 15 17 10" />
                      <line x1="12" y1="15" x2="12" y2="3" />
                    </svg>
                    Download
                  </a>
                )}

                {showBookmark && (
                  <button
                    onClick={onBookmark}
                    className="hb-btn hb-btn-download"
                    style={
                      bookmarked
                        ? { background: "rgba(255,215,0,0.15)", borderColor: "rgba(255,215,0,0.5)", color: "#FFD700" }
                        : {}
                    }
                  >
                    {bookmarked ? (
                      <>
                        <BookmarkCheck className="hb-btn-icon" />
                        Saved
                      </>
                    ) : (
                      <>
                        <Bookmark className="hb-btn-icon" />
                        Save
                      </>
                    )}
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
