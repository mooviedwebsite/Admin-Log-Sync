import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { Link } from "wouter";
import { type Movie } from "@/lib/api";
import "./HeroBanner.css";

interface HeroBannerProps {
  movies: Movie[];
}

const AUTO_PLAY_INTERVAL = 8000;
// Max ms to wait for video before giving up and keeping the poster
const VIDEO_GOOD_NET_MS = 1400; // fast connection: show video after iframe loads
const VIDEO_TIMEOUT_MS  = 7000; // slow/bad network: give up entirely after this

/** Extract YouTube video ID from any valid YT URL */
function extractYouTubeId(url: string | undefined): string | null {
  if (!url) return null;
  const match = url.match(
    /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/|youtube\.com\/v\/)([a-zA-Z0-9_-]{11})/
  );
  return match ? match[1] : null;
}

/** Build fully-hidden autoplay embed URL — absolutely no YouTube UI */
function ytEmbedUrl(videoId: string): string {
  const p = new URLSearchParams({
    autoplay: "1", mute: "1", loop: "1", playlist: videoId,
    controls: "0", showinfo: "0", rel: "0", modestbranding: "1",
    iv_load_policy: "3", disablekb: "1", fs: "0", cc_load_policy: "0",
    playsinline: "1", start: "0", enablejsapi: "0",
  });
  return `https://www.youtube-nocookie.com/embed/${videoId}?${p.toString()}`;
}

/** Fire-and-forget image preload — just warms the browser cache */
function preloadImg(url: string) {
  if (!url) return;
  const img = new Image();
  img.fetchPriority = "high";
  img.src = url;
}

/** Fisher-Yates shuffle (returns new array) */
function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export default function HeroBanner({ movies }: HeroBannerProps) {
  // Randomly pick 5 from the first 8 movies — fresh order every page load
  const featured = useMemo(() => {
    if (!movies.length) return [];
    return shuffle(movies.slice(0, Math.min(8, movies.length))).slice(0, 5);
  // Only re-shuffle when movie list actually changes (by checking first id)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [movies.length > 0 ? movies[0]?.id : ""]);

  const [current,    setCurrent]    = useState(0);
  const [isActive,   setIsActive]   = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [dragStartX, setDragStartX] = useState(0);
  const [dragOffset, setDragOffset] = useState(0);

  // Per-slide: video fully ready (opacity 1) vs failed/timed-out (stay on poster)
  const [vidReady,  setVidReady]  = useState<boolean[]>([]);
  const [vidFailed, setVidFailed] = useState<boolean[]>([]);

  const trackRef        = useRef<HTMLDivElement>(null);
  const animFrameRef    = useRef<number | null>(null);
  const startTimeRef    = useRef<number>(Date.now());
  // timeout handles per slide: [goodNetTimer, badNetTimer]
  const vidTimers = useRef<Array<[ReturnType<typeof setTimeout>|null, ReturnType<typeof setTimeout>|null]>>([]);

  // ── Init per-slide state arrays ────────────────────────────────────────────
  useEffect(() => {
    if (!featured.length) return;
    const n = featured.length;
    setVidReady(new Array(n).fill(false));
    setVidFailed(new Array(n).fill(false));
    vidTimers.current = new Array(n).fill([null, null]);
  }, [featured.length]);

  // ── Preload ALL 5 poster images right now, in parallel ────────────────────
  // This puts all 5 bitmaps into the browser's in-memory image cache BEFORE
  // the user reaches that slide — zero lag on slide change.
  useEffect(() => {
    featured.forEach((m) => { if (m.poster_url) preloadImg(m.poster_url); });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [featured.length]);

  // ── Slide navigation ──────────────────────────────────────────────────────
  const goTo = useCallback((idx: number) => {
    const next = (idx + featured.length) % featured.length;
    setIsActive(false);
    setTimeout(() => {
      setCurrent(next);
      startTimeRef.current = Date.now();
      setIsActive(true);
    }, 60);
  }, [featured.length]);

  useEffect(() => {
    if (!featured.length) return;
    const t = setTimeout(() => setIsActive(true), 80);
    return () => clearTimeout(t);
  }, [featured.length]);

  // Auto-advance loop
  useEffect(() => {
    if (featured.length <= 1) return;
    const tick = () => {
      if (Date.now() - startTimeRef.current >= AUTO_PLAY_INTERVAL) {
        goTo(current + 1);
      } else {
        animFrameRef.current = requestAnimationFrame(tick);
      }
    };
    animFrameRef.current = requestAnimationFrame(tick);
    return () => { if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current); };
  }, [current, featured.length, goTo]);

  // Drag / swipe
  const onPtrDown  = (e: React.PointerEvent) => { setIsDragging(true); setDragStartX(e.clientX); setDragOffset(0); if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current); };
  const onPtrMove  = (e: React.PointerEvent) => { if (!isDragging) return; setDragOffset(e.clientX - dragStartX); };
  const onPtrUp    = (e: React.PointerEvent) => {
    if (!isDragging) return;
    setIsDragging(false);
    const diff = e.clientX - dragStartX;
    setDragOffset(0);
    if (Math.abs(diff) > 50) goTo(diff < 0 ? current + 1 : current - 1);
    else startTimeRef.current = Date.now();
  };

  // ── Video event handlers ───────────────────────────────────────────────────
  // Strategy:
  //   onLoad fires when iframe HTML is parsed (NOT when video plays).
  //   • Good network: VIDEO_GOOD_NET_MS after onLoad → show video (fade in)
  //   • Bad network:  VIDEO_TIMEOUT_MS after onLoad  → give up, keep poster
  const onVidLoad = useCallback((idx: number) => {
    // Clear any existing timers for this slide
    const [g, b] = vidTimers.current[idx] ?? [null, null];
    if (g) clearTimeout(g);
    if (b) clearTimeout(b);

    // Good-network timer: reveal video after short delay
    const goodTimer = setTimeout(() => {
      setVidReady(prev => {
        if (prev[idx]) return prev;
        const n = [...prev]; n[idx] = true; return n;
      });
    }, VIDEO_GOOD_NET_MS);

    // Bad-network timer: if video STILL hasn't been marked ready by now, fail it
    const badTimer = setTimeout(() => {
      setVidReady(prev => {
        if (prev[idx]) return prev; // already good — do nothing
        return prev;
      });
      setVidFailed(prev => {
        if (prev[idx]) return prev;
        const n = [...prev]; n[idx] = true; return n;
      });
    }, VIDEO_TIMEOUT_MS);

    vidTimers.current[idx] = [goodTimer, badTimer];
  }, []);

  const onVidError = useCallback((idx: number) => {
    const [g, b] = vidTimers.current[idx] ?? [null, null];
    if (g) clearTimeout(g);
    if (b) clearTimeout(b);
    setVidFailed(prev => { const n = [...prev]; n[idx] = true; return n; });
  }, []);

  // Cleanup all timers on unmount
  useEffect(() => () => {
    vidTimers.current.forEach(([g, b]) => { if (g) clearTimeout(g); if (b) clearTimeout(b); });
  }, []);

  if (!featured.length) return null;

  return (
    <div className="carousel-container">
      <div
        className="carousel-wrapper"
        onPointerDown={onPtrDown}
        onPointerMove={onPtrMove}
        onPointerUp={onPtrUp}
        onPointerLeave={onPtrUp}
        style={{ touchAction: "pan-y" }}
      >
        <div
          ref={trackRef}
          className={`carousel-track${isDragging ? " dragging" : ""}`}
          style={{ transform: `translateX(calc(${-current * 100}% + ${dragOffset}px))` }}
        >
          {featured.map((m, idx) => {
            const videoId     = extractYouTubeId(m.yt_link);
            const isCurrent   = idx === current;
            const showVideo   = isCurrent && !!videoId && (vidReady[idx] ?? false) && !(vidFailed[idx] ?? false);
            const renderIframe = isCurrent && !!videoId && !(vidFailed[idx] ?? false);

            return (
              <div key={m.id} className={`movie-banner${isCurrent ? " active" : ""}`}>

                {/* ── LAYER 0: Poster — <img> never re-fetches on scroll ── */}
                <img
                  className={`hb-poster${isCurrent && isActive ? " visible" : ""}${showVideo ? " behind-video" : ""}`}
                  src={m.poster_url}
                  alt=""
                  aria-hidden="true"
                  loading="eager"
                  decoding={idx === 0 ? "sync" : "async"}
                  fetchPriority={idx === 0 ? "high" : "auto"}
                  draggable={false}
                />

                {/* ── LAYER 1: YouTube — invisible until ready, no UI ── */}
                {/* Only mounted for the active slide with a video link.  */}
                {/* Poster always visible beneath it until video confirms. */}
                {renderIframe && (
                  <div className="hb-yt-wrap" aria-hidden="true">
                    <iframe
                      key={`yt-${m.id}`}
                      className={`hb-yt-iframe${showVideo ? " hb-yt-ready" : ""}`}
                      src={ytEmbedUrl(videoId!)}
                      allow="autoplay; encrypted-media"
                      frameBorder="0"
                      scrolling="no"
                      tabIndex={-1}
                      onLoad={() => onVidLoad(idx)}
                      onError={() => onVidError(idx)}
                      title=""
                    />
                  </div>
                )}

                {/* ── LAYER 2: Cinematic gradient ── */}
                <div className="hb-dark-overlay" />

                {/* ── LAYER 4: Content ── */}
                <div className="banner-content">
                  <div className="hb-badges">
                    {m.rating && (
                      <div className="hb-imdb-badge">
                        <span className="hb-imdb-logo">IMDb</span>
                        <span className="hb-imdb-rating">
                          <span className="hb-star">★</span>{m.rating}
                        </span>
                      </div>
                    )}
                    <div className="hb-quality-badge hb-quality-badge-4k"><span className="hb-quality-text">4K</span></div>
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

                  {m.description && <p className="hb-description">{m.description}</p>}

                  {m.runtime && (
                    <div className="hb-info-row">
                      <div className="hb-info-item"><span className="hb-info-label">Runtime:</span><span className="hb-info-value">{m.runtime}</span></div>
                      <div className="hb-info-item"><span className="hb-info-label">Genre:</span><span className="hb-info-value">{m.genre}</span></div>
                      {m.year && <div className="hb-info-item"><span className="hb-info-label">Year:</span><span className="hb-info-value">{m.year}</span></div>}
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
                            video: m.video_url, title: m.title, series: "MOOVIED",
                            ...(m.subtitle_url ? { subtitle: m.subtitle_url } : {}),
                          });
                          window.open(`${base}/player.html?${params.toString()}`, "_blank");
                        } else {
                          window.location.href = `/movie/${m.id}`;
                        }
                      }}
                    >
                      <svg className="hb-btn-icon" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z" /></svg>
                      Stream Now
                    </Link>
                    <Link href={`/movie/${m.id}`} className="hb-btn hb-btn-info">More Info</Link>
                  </div>
                </div>
              </div>
            );
          })}
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
                aria-label={`Slide ${idx + 1}`}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
