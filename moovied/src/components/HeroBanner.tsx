import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { Link } from "wouter";
import { ChevronLeft, ChevronRight, RotateCcw, Captions, FileVideo, Wifi } from "lucide-react";
import { type Movie, type Episode, imgProxy } from "@/lib/api";
import "./HeroBanner.css";

// ─── Constants ────────────────────────────────────────────────────────────────
const AUTO_PLAY_INTERVAL  = 8000;
const VIDEO_GOOD_NET_MS   = 1400;
const VIDEO_TIMEOUT_MS    = 7000;
const PLAYBACK_KEY = (id: string) => `moovied_pos_${id}`;

// ─── Helpers ──────────────────────────────────────────────────────────────────
function extractYouTubeId(url?: string): string | null {
  if (!url) return null;
  const m = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/|youtube\.com\/v\/)([a-zA-Z0-9_-]{11})/);
  return m ? m[1] : null;
}

function ytEmbedUrl(videoId: string): string {
  const p = new URLSearchParams({
    autoplay:"1", mute:"1", loop:"1", playlist:videoId,
    controls:"0", showinfo:"0", rel:"0", modestbranding:"1",
    iv_load_policy:"3", disablekb:"1", fs:"0", cc_load_policy:"0",
    playsinline:"1", start:"0", enablejsapi:"0",
  });
  return `https://www.youtube-nocookie.com/embed/${videoId}?${p.toString()}`;
}

function preloadImg(url: string) {
  if (!url) return;
  const img = new Image();
  img.fetchPriority = "high";
  img.src = url;
}

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function parseSubtitles(raw?: string): { label: string; url: string }[] {
  if (!raw?.trim()) return [];
  return raw.split("\n").map(line => {
    const t = line.trim();
    if (!t) return null;
    if (t.includes("|")) {
      const idx = t.indexOf("|");
      const label = t.slice(0, idx).trim();
      const url   = t.slice(idx + 1).trim();
      if (url.startsWith("http")) return { label: label || "Subtitles", url };
    }
    if (t.startsWith("http")) return { label: "Subtitles", url: t };
    return null;
  }).filter(Boolean) as { label: string; url: string }[];
}

// ─── Loading Toast ─────────────────────────────────────────────────────────────
function LoadingToast({ visible }: { visible: boolean }) {
  return (
    <div
      style={{
        position: "fixed",
        bottom: "28px",
        right: "28px",
        zIndex: 9999,
        display: "flex",
        alignItems: "center",
        gap: "12px",
        padding: "14px 20px",
        borderRadius: "14px",
        background: "rgba(10,10,10,0.97)",
        border: "1px solid rgba(255,255,255,0.08)",
        boxShadow: "0 8px 40px rgba(0,0,0,0.7), 0 0 0 1px rgba(255,255,255,0.04)",
        backdropFilter: "blur(20px)",
        transition: "opacity 0.3s ease, transform 0.3s cubic-bezier(0.34,1.56,0.64,1)",
        opacity: visible ? 1 : 0,
        transform: visible ? "translateY(0) scale(1)" : "translateY(12px) scale(0.96)",
        pointerEvents: "none",
      }}
    >
      {/* Spinner */}
      <div style={{ position: "relative", width: "20px", height: "20px", flexShrink: 0 }}>
        <svg width="20" height="20" viewBox="0 0 20 20" style={{ animation: "spin 0.9s linear infinite" }}>
          <circle cx="10" cy="10" r="8" fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="2" />
          <path d="M 10 2 A 8 8 0 0 1 18 10" fill="none" stroke="#FACC15" strokeWidth="2" strokeLinecap="round" />
        </svg>
      </div>

      {/* Icon + text */}
      <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
        <Wifi size={14} style={{ color: "rgba(250,204,21,0.7)", flexShrink: 0 }} />
        <div>
          <p style={{ fontSize: "12px", fontWeight: 700, color: "#fff", margin: 0, letterSpacing: "0.02em" }}>
            Loading player
          </p>
          <p style={{ fontSize: "11px", color: "rgba(255,255,255,0.35)", margin: 0, marginTop: "1px" }}>
            Connecting to server…
          </p>
        </div>
      </div>

      {/* Pulse dot */}
      <div style={{ width: "6px", height: "6px", borderRadius: "50%", background: "#FACC15", flexShrink: 0, animation: "pulse 1.4s ease-in-out infinite" }} />

      <style>{`
        @keyframes spin   { to { transform: rotate(360deg); } }
        @keyframes pulse  { 0%,100% { opacity:1; transform:scale(1); } 50% { opacity:0.4; transform:scale(0.7); } }
      `}</style>
    </div>
  );
}

// ─── Dark Fadeout Overlay ──────────────────────────────────────────────────────
function DarkFade({ visible }: { visible: boolean }) {
  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 9998,
        background: "rgba(0,0,0,0.85)",
        backdropFilter: "blur(6px)",
        transition: "opacity 0.45s cubic-bezier(0.4,0,0.2,1)",
        opacity: visible ? 1 : 0,
        pointerEvents: visible ? "all" : "none",
      }}
    />
  );
}

// ─── Inline Video Player ───────────────────────────────────────────────────────
function InlinePlayer({
  movie, onClose,
  episodes, episodeIdx, onEpisodeChange,
}: {
  movie: Movie;
  onClose: () => void;
  episodes?: Episode[];
  episodeIdx?: number;
  onEpisodeChange?: (idx: number) => void;
}) {
  const isSeries   = !!episodes && episodes.length > 0 && episodeIdx !== undefined;
  const currentEp  = isSeries ? episodes![episodeIdx!] : undefined;
  const videoSrc   = currentEp ? currentEp.video_url : movie.video_url;
  const subRaw     = currentEp ? (currentEp.subtitle_url || "") : (movie.subtitle_url || "");
  const playerTitle = currentEp
    ? `S${currentEp.season}E${String(currentEp.episode).padStart(2, "0")} — ${currentEp.title}`
    : movie.title;

  const videoRef   = useRef<HTMLVideoElement>(null);
  const [activeSub, setActiveSub]     = useState(0);
  const [subEnabled, setSubEnabled]   = useState(true);
  const [resumeSeconds, setResumeSeconds] = useState(0);
  const subtitles = useMemo(() => parseSubtitles(subRaw), [subRaw]);

  const posKey = isSeries
    ? PLAYBACK_KEY(`${movie.id}_ep${currentEp?.id}`)
    : PLAYBACK_KEY(movie.id);

  useEffect(() => {
    const saved = parseFloat(localStorage.getItem(posKey) || "0");
    setResumeSeconds(saved > 5 ? saved : 0);
    setActiveSub(0);
  }, [posKey]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    const handleLoaded = () => { if (resumeSeconds > 5) video.currentTime = resumeSeconds; };
    video.addEventListener("loadedmetadata", handleLoaded);
    const interval = setInterval(() => {
      if (!video.paused && video.currentTime > 5) {
        localStorage.setItem(posKey, String(Math.floor(video.currentTime)));
      }
    }, 4000);
    return () => {
      video.removeEventListener("loadedmetadata", handleLoaded);
      clearInterval(interval);
      if (video.currentTime > 5) localStorage.setItem(posKey, String(Math.floor(video.currentTime)));
    };
  }, [posKey, resumeSeconds]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video?.textTracks) return;
    for (let i = 0; i < video.textTracks.length; i++) {
      video.textTracks[i].mode = subEnabled && i === activeSub ? "showing" : "hidden";
    }
  }, [activeSub, subEnabled]);

  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [onClose]);

  useEffect(() => {
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = ""; };
  }, []);

  const restartPlayback = () => {
    const video = videoRef.current;
    if (!video) return;
    localStorage.removeItem(posKey);
    video.currentTime = 0;
    video.play().catch(() => {});
    setResumeSeconds(0);
  };

  const BAR_H = 56;

  return (
    <div
      className="fixed inset-0 z-[300] flex flex-col bg-black"
      style={{ backdropFilter: "blur(40px)" }}
    >
      {/* Top bar */}
      <div
        className="flex items-center gap-2 px-3 flex-shrink-0"
        style={{ height:`${BAR_H}px`, background:"rgba(0,0,0,0.85)", backdropFilter:"blur(20px)", borderBottom:"1px solid rgba(255,255,255,0.07)" }}
      >
        <button
          onClick={onClose}
          className="flex items-center gap-1.5 rounded-xl px-3 py-2 text-sm font-bold transition-all hover:bg-white/10 flex-shrink-0"
          style={{ color:"rgba(255,255,255,0.65)", border:"1px solid rgba(255,255,255,0.09)" }}
        >
          <ChevronLeft className="w-4 h-4" /> Back
        </button>

        {isSeries && (
          <div className="flex items-center gap-1 flex-shrink-0">
            <button
              disabled={episodeIdx === 0}
              onClick={() => onEpisodeChange?.(episodeIdx! - 1)}
              className="flex items-center gap-1 rounded-xl px-2 py-2 text-xs font-bold transition-all hover:bg-white/10 disabled:opacity-25"
              style={{ color:"rgba(255,255,255,0.5)", border:"1px solid rgba(255,255,255,0.09)" }}
            >
              <ChevronLeft className="w-3.5 h-3.5" /> Prev
            </button>
            <span className="text-xs font-bold px-2" style={{ color:"rgba(255,255,255,0.3)" }}>
              {episodeIdx! + 1}/{episodes!.length}
            </span>
            <button
              disabled={episodeIdx === episodes!.length - 1}
              onClick={() => onEpisodeChange?.(episodeIdx! + 1)}
              className="flex items-center gap-1 rounded-xl px-2 py-2 text-xs font-bold transition-all hover:bg-white/10 disabled:opacity-25"
              style={{ color:"rgba(255,255,255,0.5)", border:"1px solid rgba(255,255,255,0.09)" }}
            >
              Next <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        <div className="flex-1 text-center min-w-0 px-2">
          <p className="text-sm font-black text-white truncate leading-tight">{playerTitle}</p>
          <p className="text-xs leading-tight" style={{ color:"rgba(255,255,255,0.28)" }}>
            {movie.title}{isSeries ? "" : " • MOOVIED"}
          </p>
        </div>

        <div className="flex items-center gap-1.5 flex-shrink-0">
          <button
            onClick={restartPlayback}
            className="flex items-center gap-1 rounded-xl px-2 py-2 text-xs font-bold transition-all hover:bg-white/10"
            style={{ color:"rgba(255,255,255,0.4)", border:"1px solid rgba(255,255,255,0.09)" }}
          >
            <RotateCcw className="w-3.5 h-3.5" />
          </button>

          {subtitles.length > 0 && (
            <div className="flex items-center gap-1">
              <button
                onClick={() => setSubEnabled(p => !p)}
                className="flex items-center gap-1 rounded-xl px-2 py-2 text-xs font-bold transition-all"
                style={{
                  color: subEnabled ? "#FACC15" : "rgba(255,255,255,0.35)",
                  background: subEnabled ? "rgba(250,204,21,0.1)" : "transparent",
                  border: `1px solid ${subEnabled ? "rgba(250,204,21,0.3)" : "rgba(255,255,255,0.09)"}`,
                }}
              >
                <Captions className="w-3.5 h-3.5" /> CC
              </button>
              {subtitles.length > 1 && subEnabled && (
                <select
                  value={activeSub}
                  onChange={e => setActiveSub(Number(e.target.value))}
                  className="rounded-xl px-2 py-1.5 text-xs font-bold outline-none cursor-pointer"
                  style={{ background:"rgba(255,255,255,0.09)", border:"1px solid rgba(255,255,255,0.12)", color:"#fff" }}
                >
                  {subtitles.map((sub, i) => (
                    <option key={i} value={i} style={{ background:"#111" }}>{sub.label}</option>
                  ))}
                </select>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Resume bar */}
      {resumeSeconds > 5 && (
        <div className="flex items-center justify-between px-4 py-1.5 text-xs flex-shrink-0"
          style={{ background:"rgba(250,204,21,0.07)", borderBottom:"1px solid rgba(250,204,21,0.12)" }}>
          <span style={{ color:"rgba(250,204,21,0.75)" }}>
            Resuming from {Math.floor(resumeSeconds / 60)}:{String(Math.floor(resumeSeconds % 60)).padStart(2, "0")}
          </span>
          <button onClick={restartPlayback} className="text-xs underline" style={{ color:"rgba(255,255,255,0.35)" }}>
            Start from beginning
          </button>
        </div>
      )}

      {/* Video */}
      <div className="flex-1 flex items-center justify-center bg-black min-h-0 overflow-hidden">
        {videoSrc ? (
          <video
            key={videoSrc}
            ref={videoRef}
            src={videoSrc}
            controls
            autoPlay
            crossOrigin="anonymous"
            style={{
              width: `min(100vw, calc((100vh - ${BAR_H + (resumeSeconds > 5 ? 32 : 0)}px) * 16 / 9))`,
              height: "auto",
              maxHeight: `calc(100vh - ${BAR_H + (resumeSeconds > 5 ? 32 : 0)}px)`,
              display: "block",
            }}
          >
            {subtitles.map((sub, i) => (
              <track key={i} kind="subtitles" label={sub.label} src={sub.url}
                srcLang={sub.label.toLowerCase().slice(0, 2)} default={i === 0} />
            ))}
          </video>
        ) : (
          <div className="flex flex-col items-center gap-4">
            <div className="w-20 h-20 rounded-2xl flex items-center justify-center"
              style={{ background:"rgba(255,255,255,0.04)", border:"1px solid rgba(255,255,255,0.08)" }}>
              <FileVideo className="w-8 h-8" style={{ color:"rgba(255,255,255,0.2)" }} />
            </div>
            <p style={{ color:"rgba(255,255,255,0.3)" }} className="text-sm">No video source available</p>
          </div>
        )}
      </div>

      {subtitles.length > 0 && subEnabled && (
        <div className="flex items-center gap-2 px-4 py-1.5 flex-shrink-0"
          style={{ background:"rgba(0,0,0,0.6)", borderTop:"1px solid rgba(255,255,255,0.04)" }}>
          <Captions className="w-3 h-3" style={{ color:"rgba(250,204,21,0.5)" }} />
          <span className="text-xs" style={{ color:"rgba(255,255,255,0.3)" }}>
            Subtitle: <span style={{ color:"rgba(250,204,21,0.65)" }}>{subtitles[activeSub]?.label}</span>
          </span>
        </div>
      )}
    </div>
  );
}

// ─── Main HeroBanner ───────────────────────────────────────────────────────────
interface HeroBannerProps {
  movies: Movie[];
}

export default function HeroBanner({ movies }: HeroBannerProps) {
  const featured = useMemo(() => {
    if (!movies.length) return [];
    return shuffle(movies.slice(0, Math.min(8, movies.length))).slice(0, 5);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [movies.length > 0 ? movies[0]?.id : ""]);

  const [current,    setCurrent]    = useState(0);
  const [isActive,   setIsActive]   = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [dragStartX, setDragStartX] = useState(0);
  const [dragOffset, setDragOffset] = useState(0);
  const [vidReady,   setVidReady]   = useState<boolean[]>([]);
  const [vidFailed,  setVidFailed]  = useState<boolean[]>([]);

  // Player state
  const [playerMovie,      setPlayerMovie]      = useState<Movie | null>(null);
  const [showFade,         setShowFade]          = useState(false);
  const [showToast,        setShowToast]         = useState(false);
  const [showPlayer,       setShowPlayer]        = useState(false);
  const [episodeIdx,       setEpisodeIdx]        = useState<number | undefined>(undefined);
  const playClickCount     = useRef(0);          // prevents multiple clicks

  const trackRef     = useRef<HTMLDivElement>(null);
  const animFrameRef = useRef<number | null>(null);
  const startTimeRef = useRef<number>(Date.now());
  const vidTimers    = useRef<Array<[ReturnType<typeof setTimeout>|null, ReturnType<typeof setTimeout>|null]>>([]);

  useEffect(() => {
    if (!featured.length) return;
    const n = featured.length;
    setVidReady(new Array(n).fill(false));
    setVidFailed(new Array(n).fill(false));
    vidTimers.current = new Array(n).fill([null, null]);
  }, [featured.length]);

  useEffect(() => {
    featured.forEach(m => { if (m.poster_url) preloadImg(imgProxy(m.poster_url)); });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [featured.length]);

  const goTo = useCallback((idx: number) => {
    const next = (idx + featured.length) % featured.length;
    setIsActive(false);
    setTimeout(() => { setCurrent(next); startTimeRef.current = Date.now(); setIsActive(true); }, 60);
  }, [featured.length]);

  useEffect(() => {
    if (!featured.length) return;
    const t = setTimeout(() => setIsActive(true), 80);
    return () => clearTimeout(t);
  }, [featured.length]);

  useEffect(() => {
    if (featured.length <= 1) return;
    const tick = () => {
      if (Date.now() - startTimeRef.current >= AUTO_PLAY_INTERVAL) { goTo(current + 1); }
      else { animFrameRef.current = requestAnimationFrame(tick); }
    };
    animFrameRef.current = requestAnimationFrame(tick);
    return () => { if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current); };
  }, [current, featured.length, goTo]);

  const onPtrDown = (e: React.PointerEvent) => { setIsDragging(true); setDragStartX(e.clientX); setDragOffset(0); if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current); };
  const onPtrMove = (e: React.PointerEvent) => { if (!isDragging) return; setDragOffset(e.clientX - dragStartX); };
  const onPtrUp   = (e: React.PointerEvent) => {
    if (!isDragging) return;
    setIsDragging(false);
    const diff = e.clientX - dragStartX;
    setDragOffset(0);
    if (Math.abs(diff) > 50) goTo(diff < 0 ? current + 1 : current - 1);
    else startTimeRef.current = Date.now();
  };

  const onVidLoad = useCallback((idx: number) => {
    const [g, b] = vidTimers.current[idx] ?? [null, null];
    if (g) clearTimeout(g); if (b) clearTimeout(b);
    const goodTimer = setTimeout(() => {
      setVidReady(prev => { if (prev[idx]) return prev; const n = [...prev]; n[idx] = true; return n; });
    }, VIDEO_GOOD_NET_MS);
    const badTimer = setTimeout(() => {
      setVidFailed(prev => { if (prev[idx]) return prev; const n = [...prev]; n[idx] = true; return n; });
    }, VIDEO_TIMEOUT_MS);
    vidTimers.current[idx] = [goodTimer, badTimer];
  }, []);

  const onVidError = useCallback((idx: number) => {
    const [g, b] = vidTimers.current[idx] ?? [null, null];
    if (g) clearTimeout(g); if (b) clearTimeout(b);
    setVidFailed(prev => { const n = [...prev]; n[idx] = true; return n; });
  }, []);

  useEffect(() => () => {
    vidTimers.current.forEach(([g, b]) => { if (g) clearTimeout(g); if (b) clearTimeout(b); });
  }, []);

  // ── Watch Now handler — single click, dark fade, toast, then player ──────────
  const handleWatchNow = useCallback((movie: Movie, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();

    // Prevent multiple rapid clicks
    playClickCount.current += 1;
    const thisClick = playClickCount.current;

    if (!movie.video_url) {
      window.location.href = `/movie/${movie.id}`;
      return;
    }

    // 1. Show dark fade immediately
    setShowFade(true);

    // 2. Show loading toast after 80ms (feels intentional, not glitchy)
    setTimeout(() => {
      if (playClickCount.current !== thisClick) return;
      setShowToast(true);
    }, 80);

    // 3. Open player after 500ms (enough for fade + toast to settle)
    setTimeout(() => {
      if (playClickCount.current !== thisClick) return;
      setPlayerMovie(movie);
      const isSeries = movie.type === "series" && Array.isArray(movie.episodes) && movie.episodes.length > 0;
      setEpisodeIdx(isSeries ? 0 : undefined);
      setShowPlayer(true);
      setShowFade(false);
      setShowToast(false);
    }, 500);
  }, []);

  const handleClosePlayer = useCallback(() => {
    setShowPlayer(false);
    setPlayerMovie(null);
    setEpisodeIdx(undefined);
    setShowFade(false);
    setShowToast(false);
    playClickCount.current = 0;
  }, []);

  if (!featured.length) return null;

  return (
    <>
      {/* ── Inline player (renders on top of everything) ── */}
      {showPlayer && playerMovie && (
        <InlinePlayer
          movie={playerMovie}
          onClose={handleClosePlayer}
          episodes={
            playerMovie.type === "series" && Array.isArray(playerMovie.episodes) && playerMovie.episodes.length > 0
              ? playerMovie.episodes
              : undefined
          }
          episodeIdx={episodeIdx}
          onEpisodeChange={setEpisodeIdx}
        />
      )}

      {/* ── Dark fade overlay ── */}
      <DarkFade visible={showFade} />

      {/* ── Loading toast ── */}
      <LoadingToast visible={showToast} />

      {/* ── Carousel ── */}
      <div className="carousel-container">
        <div
          className="carousel-wrapper"
          onPointerDown={onPtrDown}
          onPointerMove={onPtrMove}
          onPointerUp={onPtrUp}
          onPointerLeave={onPtrUp}
          style={{ touchAction:"pan-y" }}
        >
          <div
            ref={trackRef}
            className={`carousel-track${isDragging ? " dragging" : ""}`}
            style={{ transform:`translateX(calc(${-current * 100}% + ${dragOffset}px))` }}
          >
            {featured.map((m, idx) => {
              const videoId      = extractYouTubeId(m.yt_link);
              const isCurrent    = idx === current;
              const showVideo    = isCurrent && !!videoId && (vidReady[idx] ?? false) && !(vidFailed[idx] ?? false);
              const renderIframe = isCurrent && !!videoId && !(vidFailed[idx] ?? false);

              return (
                <div key={m.id} className={`movie-banner${isCurrent ? " active" : ""}`}>

                  {/* Poster */}
                  <img
                    className={`hb-poster${isCurrent && isActive ? " visible" : ""}${showVideo ? " behind-video" : ""}`}
                    src={imgProxy(m.poster_url)}
                    alt=""
                    aria-hidden="true"
                    loading="eager"
                    decoding={idx === 0 ? "sync" : "async"}
                    fetchPriority={idx === 0 ? "high" : "auto"}
                    draggable={false}
                  />

                  {/* YouTube background */}
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

                  <div className="hb-dark-overlay" />

                  <div className="banner-content">
                    <div className="hb-badges">
                      {m.rating && (
                        <div className="hb-imdb-badge">
                          <span className="hb-imdb-logo">IMDb</span>
                          <span className="hb-imdb-rating"><span className="hb-star">★</span>{m.rating}</span>
                        </div>
                      )}
                      <div className="hb-quality-badge hb-quality-badge-4k"><span className="hb-quality-text">4K</span></div>
                      <div className="hb-quality-badge">HDR</div>
                      {m.year && <div className="hb-year-badge">{m.year}</div>}
                    </div>

                    <h1 className="hb-movie-title">{m.title}</h1>

                    {m.genre && (
                      <div className="hb-categories">
                        {m.genre.split(/[,/]/).map(g => (
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
                      {/* ── WATCH NOW — inline player, no new tab ── */}
                      <button
                        className="hb-btn hb-btn-stream"
                        onClick={e => handleWatchNow(m, e)}
                      >
                        <svg className="hb-btn-icon" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z" /></svg>
                        Watch Now
                      </button>
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
    </>
  );
}
