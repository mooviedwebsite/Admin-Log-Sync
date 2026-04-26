import { useState, useEffect, useRef, useCallback } from "react";
import { Link } from "wouter";
import { type Movie } from "@/lib/api";
import "./HeroBanner.css";
import StudioSlider from "@/components/StudioSlider";

interface HeroBannerProps {
  movies: Movie[];
}

const AUTO_PLAY_INTERVAL = 7000;

function extractYouTubeId(url: string | undefined): string | null {
  if (!url) return null;
  const match = url.match(
    /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/|youtube\.com\/v\/)([a-zA-Z0-9_-]{11})/
  );
  return match ? match[1] : null;
}

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

export default function HeroBanner({ movies }: HeroBannerProps) {
  const featured = movies.slice(0, 5);
  const [current, setCurrent] = useState(0);
  const [isActive, setIsActive] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [dragStartX, setDragStartX] = useState(0);
  const [dragOffset, setDragOffset] = useState(0);
  const [ytReady, setYtReady] = useState(false);

  const trackRef = useRef<HTMLDivElement>(null);
  const animFrameRef = useRef<number | null>(null);
  const startTimeRef = useRef<number>(Date.now());
  const ytTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const goTo = useCallback((idx: number) => {
    const next = (idx + featured.length) % featured.length;
    setIsActive(false);
    setYtReady(false);
    setTimeout(() => {
      setCurrent(next);
      startTimeRef.current = Date.now();
      setIsActive(true);
    }, 80);
  }, [featured.length]);

  useEffect(() => {
    if (!featured.length) return;
    const t = setTimeout(() => setIsActive(true), 100);
    return () => clearTimeout(t);
  }, [featured.length]);

  useEffect(() => {
    if (featured.length <= 1) return;
    const tick = () => {
      const elapsed = Date.now() - startTimeRef.current;
      if (elapsed >= AUTO_PLAY_INTERVAL) {
        goTo(current + 1);
      } else {
        animFrameRef.current = requestAnimationFrame(tick);
      }
    };
    animFrameRef.current = requestAnimationFrame(tick);
    return () => { if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current); };
  }, [current, featured.length, goTo]);

  const handlePointerDown = (e: React.PointerEvent) => {
    setIsDragging(true);
    setDragStartX(e.clientX);
    setDragOffset(0);
    if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
  };
  const handlePointerMove = (e: React.PointerEvent) => {
    if (!isDragging) return;
    setDragOffset(e.clientX - dragStartX);
  };
  const handlePointerUp = (e: React.PointerEvent) => {
    if (!isDragging) return;
    setIsDragging(false);
    const diff = e.clientX - dragStartX;
    setDragOffset(0);
    if (Math.abs(diff) > 50) {
      goTo(diff < 0 ? current + 1 : current - 1);
    } else {
      startTimeRef.current = Date.now();
    }
  };

  const handleYtLoad = () => {
    if (ytTimerRef.current) clearTimeout(ytTimerRef.current);
    ytTimerRef.current = setTimeout(() => setYtReady(true), 150);
  };

  if (!featured.length) return null;

  const translateX = `calc(${-current * 100}% + ${dragOffset}px)`;
  const currentMovie = featured[current];
  const currentVideoId = extractYouTubeId(currentMovie?.yt_link);

  return (
    <div className="carousel-container">
      <div
        className="carousel-wrapper"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerLeave={handlePointerUp}
        style={{ touchAction: "pan-y" }}
      >
        <div
          ref={trackRef}
          className={`carousel-track${isDragging ? " dragging" : ""}`}
          style={{ transform: `translateX(${translateX})` }}
        >
          {featured.map((m, idx) => (
            <div key={m.id} className={`movie-banner${idx === current ? " active" : ""}`}>

              <div
                className={`banner-bg${idx === current && isActive ? " active" : ""}`}
                style={{ backgroundImage: `url('${m.poster_url}')` }}
              />

              {idx === current && currentVideoId && (
                <div className="hb-yt-wrap">
                  <iframe
                    key={`yt-${m.id}`}
                    className={`hb-yt-iframe${ytReady ? " hb-yt-ready" : ""}`}
                    src={ytEmbedUrl(currentVideoId)}
                    allow="autoplay; encrypted-media"
                    frameBorder="0"
                    onLoad={handleYtLoad}
                    title="background"
                  />
                </div>
              )}

              <div className="hb-dark-overlay" />

              <div className="banner-content" style={{ paddingTop: "80px" }}>
                <div className="hb-badges">
                  {m.rating && (
                    <div className="hb-imdb-badge">
                      <span className="hb-imdb-logo">IMDb</span>
                      <span className="hb-imdb-rating">
                        <span className="hb-star">★</span>
                        {m.rating}
                      </span>
                    </div>
                  )}
                  <div className="hb-quality-badge hb-quality-badge-4k">
                    <span className="hb-quality-text">4K</span>
                  </div>
                  <div className="hb-quality-badge">HDR</div>
                  {m.year && <div className="hb-year-badge">{m.year}</div>}
                </div>

                <h1 className="hb-movie-title">{m.title}</h1>

                {m.genre && (
                  <div className="hb-categories">
                    {m.genre.split(/[,/]/).map((g) => (
                      <span key={g.trim()} className="hb-category">{g.trim()}</span>
                    ))}
                  </div>
                )}

                {m.description && (
                  <p className="hb-description">{m.description}</p>
                )}

                {m.runtime && (
                  <div className="hb-info-row">
                    <div className="hb-info-item">
                      <span className="hb-info-label">Runtime:</span>
                      <span className="hb-info-value">{m.runtime}</span>
                    </div>
                    <div className="hb-info-item">
                      <span className="hb-info-label">Genre:</span>
                      <span className="hb-info-value">{m.genre}</span>
                    </div>
                    {m.year && (
                      <div className="hb-info-item">
                        <span className="hb-info-label">Year:</span>
                        <span className="hb-info-value">{m.year}</span>
                      </div>
                    )}
                  </div>
                )}

                <div className="hb-action-btns">
                  <Link
                    href={`/movie/${m.id}`}
                    className="hb-btn hb-btn-stream"
                    onClick={(e) => {
                      e.preventDefault();
                      if (m.video_url) {
                        const base = import.meta.env.BASE_URL.replace(/\/$/, "");
                        const params = new URLSearchParams({
                          video: m.video_url,
                          title: m.title,
                          series: "MOOVIED",
                          ...(m.subtitle_url ? { subtitle: m.subtitle_url } : {}),
                        });
                        window.open(`${base}/player.html?${params.toString()}`, "_blank");
                      } else {
                        window.location.href = `/movie/${m.id}`;
                      }
                    }}
                  >
                    <svg className="hb-btn-icon" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M8 5v14l11-7z" />
                    </svg>
                    Stream Now
                  </Link>

                  <Link href={`/movie/${m.id}`} className="hb-btn hb-btn-download">
                    More Info
                  </Link>
                </div>
              </div>
            </div>
          ))}
        </div>

        {featured.length > 1 && (
          <>
            <button className="hb-carousel-nav prev" onClick={() => goTo(current - 1)} aria-label="Previous">
              <svg viewBox="0 0 24 24"><path d="M15.41 16.59L10.83 12l4.58-4.59L14 6l-6 6 6 6z" /></svg>
            </button>
            <button className="hb-carousel-nav next" onClick={() => goTo(current + 1)} aria-label="Next">
              <svg viewBox="0 0 24 24"><path d="M8.59 16.59L13.17 12 8.59 7.41 10 6l6 6-6 6z" /></svg>
            </button>
          </>
        )}

        {featured.length > 1 && (
          <div className="hb-carousel-indicators">
            {featured.map((_, idx) => (
              <button
                key={idx}
                className={`hb-indicator${idx === current ? " active" : ""}`}
                onClick={() => goTo(idx)}
                aria-label={`Go to slide ${idx + 1}`}
              />
            ))}
          </div>
        )}
      </div>

      {/* ── Studio Logo Slider — sits directly below the banner ── */}
      <StudioSlider />
    </div>
  );
}
