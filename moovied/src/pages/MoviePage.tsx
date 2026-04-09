import { useState, useEffect, useMemo, useRef } from "react";
import { useParams, Link, useLocation } from "wouter";
import {
  ChevronLeft, ChevronRight, Heart, Download, Subtitles,
  MessageSquare, ThumbsUp, Send, Pencil, Trash2,
  X, Check, Loader2, Play, Info, FileVideo, Captions,
  RotateCcw, Folder,
} from "lucide-react";
import Navbar from "@/components/Navbar";
import MovieBanner from "@/components/MovieBanner";
import { api, likeStore, realComments, type Movie, type Comment } from "@/lib/api";
import { toggleBookmark, isBookmarked, getCurrentUser, addToWatchHistory } from "@/lib/auth";
import { useMovie, useMovies } from "@/hooks/useMovies";

// ── Cast parser ───────────────────────────────────────────────────────────────
function parseCast(raw: string) {
  return raw
    .split("\n")
    .map((line) => {
      const parts = line.split("|").map((p) => p.trim());
      return { name: parts[0] || "", image: parts[1] || "", role: parts[2] || "" };
    })
    .filter((c) => c.name);
}

// ── Subtitle parser ───────────────────────────────────────────────────────────
// Format: "Label | URL" per line. Backwards-compat: bare URL → "Subtitles | URL"
function parseSubtitles(raw: string): { label: string; url: string }[] {
  if (!raw || !raw.trim()) return [];
  return raw
    .split("\n")
    .map((line) => {
      const trimmed = line.trim();
      if (!trimmed) return null;
      if (trimmed.includes("|")) {
        const idx = trimmed.indexOf("|");
        const label = trimmed.slice(0, idx).trim();
        const url = trimmed.slice(idx + 1).trim();
        if (url.startsWith("http")) return { label: label || "Subtitles", url };
      }
      if (trimmed.startsWith("http")) return { label: "Subtitles", url: trimmed };
      return null;
    })
    .filter(Boolean) as { label: string; url: string }[];
}

const PLAYBACK_KEY = (movieId: string) => `moovied_pos_${movieId}`;

// ── Video Player Modal ────────────────────────────────────────────────────────
function VideoPlayerModal({
  movie, onClose,
  episodes, episodeIdx, onEpisodeChange,
}: {
  movie: Movie; onClose: () => void;
  episodes?: import("@/lib/api").Episode[];
  episodeIdx?: number;
  onEpisodeChange?: (idx: number) => void;
}) {
  const isSeries = !!episodes && episodes.length > 0 && episodeIdx !== undefined;
  const currentEp = isSeries ? episodes![episodeIdx!] : undefined;

  const videoSrc   = currentEp ? currentEp.video_url   : movie.video_url;
  const subRaw     = currentEp ? (currentEp.subtitle_url || "") : (movie.subtitle_url || "");
  const playerTitle = currentEp
    ? `S${currentEp.season}E${String(currentEp.episode).padStart(2,"0")} — ${currentEp.title}`
    : movie.title;

  const videoRef = useRef<HTMLVideoElement>(null);
  const [activeSub, setActiveSub] = useState(0);
  const [subEnabled, setSubEnabled] = useState(true);
  const [resumeSeconds, setResumeSeconds] = useState(0);
  const subtitles = useMemo(() => parseSubtitles(subRaw), [subRaw]);

  const posKey = isSeries ? PLAYBACK_KEY(`${movie.id}_ep${currentEp?.id}`) : PLAYBACK_KEY(movie.id);

  // Load saved position (reset when episode changes)
  useEffect(() => {
    const saved = parseFloat(localStorage.getItem(posKey) || "0");
    setResumeSeconds(saved > 5 ? saved : 0);
    setActiveSub(0);
  }, [posKey]);

  // Attach video events after element mounts
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const handleLoaded = () => {
      if (resumeSeconds > 5) video.currentTime = resumeSeconds;
    };
    video.addEventListener("loadedmetadata", handleLoaded);

    // Save position every 4 seconds
    const interval = setInterval(() => {
      if (!video.paused && video.currentTime > 5) {
        localStorage.setItem(posKey, String(Math.floor(video.currentTime)));
      }
    }, 4000);

    return () => {
      video.removeEventListener("loadedmetadata", handleLoaded);
      clearInterval(interval);
      if (video.currentTime > 5) {
        localStorage.setItem(posKey, String(Math.floor(video.currentTime)));
      }
    };
  }, [posKey, resumeSeconds]);

  // Sync active subtitle track with <track> elements
  useEffect(() => {
    const video = videoRef.current;
    if (!video || !video.textTracks) return;
    for (let i = 0; i < video.textTracks.length; i++) {
      video.textTracks[i].mode = subEnabled && i === activeSub ? "showing" : "hidden";
    }
  }, [activeSub, subEnabled]);

  // ESC = close
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  // Prevent scroll-behind
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

  const BAR_H = 56; // top bar height in px

  return (
    <div
      className="fixed inset-0 z-[200] flex flex-col bg-black"
      style={{ backdropFilter: "blur(40px) saturate(1.3)" }}
    >
      {/* ── Top Bar ── */}
      <div
        className="flex items-center gap-2 px-3 flex-shrink-0"
        style={{
          height: `${BAR_H}px`,
          background: "rgba(0,0,0,0.75)",
          backdropFilter: "blur(20px)",
          borderBottom: "1px solid rgba(255,255,255,0.07)",
        }}
      >
        {/* ← Back */}
        <button
          onClick={onClose}
          className="flex items-center gap-1.5 rounded-xl px-3 py-2 text-sm font-bold transition-all hover:bg-white/10 flex-shrink-0"
          style={{ color: "rgba(255,255,255,0.65)", border: "1px solid rgba(255,255,255,0.09)" }}
        >
          <ChevronLeft className="w-4 h-4" /> Back
        </button>

        {/* Episode nav — only for series */}
        {isSeries && (
          <div className="flex items-center gap-1 flex-shrink-0">
            <button
              disabled={episodeIdx === 0}
              onClick={() => onEpisodeChange?.(episodeIdx! - 1)}
              className="flex items-center gap-1 rounded-xl px-2 py-2 text-xs font-bold transition-all hover:bg-white/10 disabled:opacity-25 disabled:cursor-not-allowed"
              style={{ color: "rgba(255,255,255,0.5)", border: "1px solid rgba(255,255,255,0.09)" }}
            >
              <ChevronLeft className="w-3.5 h-3.5" /> Prev
            </button>
            <span className="text-xs font-bold px-2" style={{ color: "rgba(255,255,255,0.3)" }}>
              {episodeIdx! + 1}/{episodes!.length}
            </span>
            <button
              disabled={episodeIdx === episodes!.length - 1}
              onClick={() => onEpisodeChange?.(episodeIdx! + 1)}
              className="flex items-center gap-1 rounded-xl px-2 py-2 text-xs font-bold transition-all hover:bg-white/10 disabled:opacity-25 disabled:cursor-not-allowed"
              style={{ color: "rgba(255,255,255,0.5)", border: "1px solid rgba(255,255,255,0.09)" }}
            >
              Next <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {/* Title */}
        <div className="flex-1 text-center min-w-0 px-2">
          <p className="text-sm font-black text-white truncate leading-tight">{playerTitle}</p>
          <p className="text-xs leading-tight" style={{ color: "rgba(255,255,255,0.28)" }}>{movie.title}{isSeries ? "" : " • MOOVIED"}</p>
        </div>

        {/* Right: restart + CC */}
        <div className="flex items-center gap-1.5 flex-shrink-0">
          <button
            onClick={restartPlayback}
            title="Restart"
            className="flex items-center gap-1 rounded-xl px-2 py-2 text-xs font-bold transition-all hover:bg-white/10"
            style={{ color: "rgba(255,255,255,0.4)", border: "1px solid rgba(255,255,255,0.09)" }}
          >
            <RotateCcw className="w-3.5 h-3.5" />
          </button>

          {subtitles.length > 0 && (
            <div className="flex items-center gap-1">
              <button
                onClick={() => setSubEnabled((p) => !p)}
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
                  onChange={(e) => setActiveSub(Number(e.target.value))}
                  className="rounded-xl px-2 py-1.5 text-xs font-bold outline-none cursor-pointer"
                  style={{ background: "rgba(255,255,255,0.09)", border: "1px solid rgba(255,255,255,0.12)", color: "#fff" }}
                >
                  {subtitles.map((sub, i) => (
                    <option key={i} value={i} style={{ background: "#111" }}>{sub.label}</option>
                  ))}
                </select>
              )}
            </div>
          )}
        </div>
      </div>

      {/* ── Resume banner ── */}
      {resumeSeconds > 5 && (
        <div className="flex items-center justify-between px-4 py-1.5 text-xs flex-shrink-0"
          style={{ background: "rgba(250,204,21,0.07)", borderBottom: "1px solid rgba(250,204,21,0.12)" }}>
          <span style={{ color: "rgba(250,204,21,0.75)" }}>
            Resuming from {Math.floor(resumeSeconds / 60)}:{String(Math.floor(resumeSeconds % 60)).padStart(2, "0")}
          </span>
          <button onClick={restartPlayback} className="text-xs underline" style={{ color: "rgba(255,255,255,0.35)" }}>
            Start from beginning
          </button>
        </div>
      )}

      {/* ── Video Area — 16:9 constrained, full screen ── */}
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
              style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" }}>
              <FileVideo className="w-8 h-8" style={{ color: "rgba(255,255,255,0.2)" }} />
            </div>
            <p style={{ color: "rgba(255,255,255,0.3)" }} className="text-sm">No video source available</p>
          </div>
        )}
      </div>

      {/* ── Bottom CC info ── */}
      {subtitles.length > 0 && subEnabled && (
        <div className="flex items-center gap-2 px-4 py-1.5 flex-shrink-0"
          style={{ background: "rgba(0,0,0,0.6)", borderTop: "1px solid rgba(255,255,255,0.04)" }}>
          <Captions className="w-3 h-3" style={{ color: "rgba(250,204,21,0.5)" }} />
          <span className="text-xs" style={{ color: "rgba(255,255,255,0.3)" }}>
            Subtitle: <span style={{ color: "rgba(250,204,21,0.65)" }}>{subtitles[activeSub]?.label}</span>
          </span>
        </div>
      )}
    </div>
  );
}

// ── Real platform logos ───────────────────────────────────────────────────────
function ImdbLogo({ size = 36 }: { size?: number }) {
  return (
    <svg width={size * 2} height={size * 0.6} viewBox="0 0 80 24" fill="none">
      <rect width="80" height="24" rx="4" fill="#F5C518" />
      <text x="40" y="17" fontFamily="Arial Black, Arial" fontSize="13" fontWeight="900" textAnchor="middle" fill="#000000">IMDb</text>
    </svg>
  );
}

function TmdbLogo({ size = 36 }: { size?: number }) {
  return (
    <svg width={size * 2.2} height={size * 0.6} viewBox="0 0 88 24" fill="none">
      <rect width="88" height="24" rx="4" fill="#0D253F" />
      <rect width="88" height="24" rx="4" fill="url(#tmdb-grad)" />
      <defs>
        <linearGradient id="tmdb-grad" x1="0" y1="0" x2="88" y2="0">
          <stop offset="0%" stopColor="#90CEA1" />
          <stop offset="100%" stopColor="#01B4E4" />
        </linearGradient>
      </defs>
      <text x="44" y="17" fontFamily="Arial Black, Arial" fontSize="11" fontWeight="900" textAnchor="middle" fill="#0D253F">TMDB</text>
    </svg>
  );
}

function RtLogo({ size = 36 }: { size?: number }) {
  return (
    <svg width={size * 0.6} height={size * 0.6} viewBox="0 0 24 24" fill="none">
      <circle cx="12" cy="12" r="12" fill="#FA320A" />
      <text x="12" y="17" fontFamily="Arial Black, Arial" fontSize="11" fontWeight="900" textAnchor="middle" fill="#fff">RT</text>
    </svg>
  );
}

// ── Modern B&W Score Bar ──────────────────────────────────────────────────────
function ScoreBar({ score, max }: { score: number; max: number }) {
  const [animated, setAnimated] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const obs = new IntersectionObserver(([e]) => {
      if (e.isIntersecting) setTimeout(() => setAnimated(true), 80);
    }, { threshold: 0.1 });
    if (ref.current) obs.observe(ref.current);
    return () => obs.disconnect();
  }, []);
  const pct = Math.min((score / max) * 100, 100);
  return (
    <div ref={ref} className="w-full h-[3px] rounded-full" style={{ background: "rgba(255,255,255,0.1)" }}>
      <div
        className="h-full rounded-full"
        style={{
          width: animated ? `${pct}%` : "0%",
          background: "rgba(255,255,255,0.85)",
          transition: "width 1.1s cubic-bezier(0.16, 1, 0.3, 1)",
        }}
      />
    </div>
  );
}

// ── Modern Rating Card — black & white, large typography ──────────────────────
function RatingCard({
  logo, label, score, max, pct = false,
}: {
  logo: React.ReactNode; label: string; score: number; max: number; pct?: boolean;
}) {
  const display = pct ? `${Math.round(Number(score))}` : `${score}`;
  const suffix = pct ? "%" : "/10";
  return (
    <div
      className="group flex flex-col justify-between gap-5 rounded-2xl p-6 border transition-all duration-300 hover:-translate-y-0.5"
      style={{
        background: "#000",
        borderColor: "rgba(255,255,255,0.08)",
        boxShadow: "0 1px 0 rgba(255,255,255,0.05) inset",
      }}
    >
      {/* Logo top-left */}
      <div>{logo}</div>

      {/* Giant score */}
      <div className="flex items-end gap-1">
        <span
          className="font-black leading-none text-white"
          style={{ fontSize: "54px", letterSpacing: "-2px", lineHeight: 1 }}
        >
          {display}
        </span>
        <span className="text-white/30 font-bold mb-1.5" style={{ fontSize: "18px" }}>
          {suffix}
        </span>
      </div>

      {/* Thin animated progress bar */}
      <div className="space-y-2">
        <ScoreBar score={Number(score)} max={max} />
        <p className="text-[11px] font-semibold tracking-widest uppercase text-white/25">{label}</p>
      </div>
    </div>
  );
}

// ── Quality file-manager rows ─────────────────────────────────────────────────
const QUALITY_META: {
  key: keyof Movie; label: string; tag: string; color: string; desc: string; codec: string; tier: number;
}[] = [
  { key: "dl_2160p", label: "2160p", tag: "4K UHD", color: "#F5C518", desc: "Ultra High Definition", codec: "HEVC / H.265", tier: 1 },
  { key: "dl_1080p", label: "1080p", tag: "Full HD", color: "#4ade80", desc: "Full High Definition", codec: "AVC / H.264", tier: 2 },
  { key: "dl_720p",  label: "720p",  tag: "HD",      color: "#60a5fa", desc: "High Definition", codec: "AVC / H.264", tier: 3 },
  { key: "dl_480p", label: "480p",  tag: "SD",      color: "#a78bfa", desc: "Standard Definition", codec: "AVC / H.264", tier: 4 },
  { key: "dl_360p", label: "360p",  tag: "LQ",      color: "#94a3b8", desc: "Low Quality", codec: "AVC", tier: 5 },
];

function QualityFileRow({
  label, tag, url, color, desc, codec, isFirst,
}: {
  label: string; tag: string; url: string; color: string; desc: string; codec: string; isFirst: boolean;
}) {
  const isActive = url && url.trim() !== "" && url !== "#";
  const [hovered, setHovered] = useState(false);

  return (
    <div
      className="flex items-center gap-4 px-5 py-4 transition-all duration-150 border-b border-white/5 last:border-0"
      style={{ background: hovered ? "rgba(255,255,255,0.03)" : "transparent" }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {/* File type icon */}
      <div
        className="w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0 border"
        style={{ background: `${color}12`, borderColor: `${color}30` }}
      >
        <FileVideo className="w-5 h-5" style={{ color }} />
      </div>

      {/* File info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-0.5">
          <span className="font-black text-sm text-white">{desc}</span>
          {isFirst && (
            <span className="text-[10px] font-black px-1.5 py-0.5 rounded-full" style={{ background: `${color}25`, color }}>
              BEST
            </span>
          )}
        </div>
        <div className="flex items-center gap-3">
          <span
            className="text-[11px] font-black px-2 py-0.5 rounded-md tracking-wide"
            style={{ background: `${color}18`, color, border: `1px solid ${color}30` }}
          >
            {label} · {tag}
          </span>
          <span className="text-[11px] text-white/30 font-mono">{codec}</span>
          <span className="flex items-center gap-1">
            <span
              className="w-1.5 h-1.5 rounded-full"
              style={{ background: isActive ? "#4ade80" : "#ef4444" }}
            />
            <span className="text-[11px]" style={{ color: isActive ? "#4ade80" : "#ef4444" }}>
              {isActive ? "Available" : "Not available"}
            </span>
          </span>
        </div>
      </div>

      {/* Download button */}
      {isActive ? (
        <a
          href={url}
          target="_blank"
          rel="noreferrer"
          className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold flex-shrink-0 transition-all duration-150"
          style={{
            background: hovered ? `${color}25` : `${color}14`,
            color,
            border: `1px solid ${color}35`,
          }}
        >
          <Download className="w-4 h-4" />
          Download
        </a>
      ) : (
        <span className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold text-white/20 bg-white/4 border border-white/8 flex-shrink-0 cursor-not-allowed">
          <Download className="w-4 h-4" />
          N/A
        </span>
      )}
    </div>
  );
}

// ── Comment section ── GAS-only, shared across all users, with replies ────────
const COMMENT_USER_KEY = "moovied_commenter";
function getCommenterName() { return localStorage.getItem(COMMENT_USER_KEY) || ""; }

function timeAgo(ts: string) {
  const diff = Date.now() - new Date(ts).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

function CommentSection({ movieId }: { movieId: string }) {
  const user = getCurrentUser();
  const isAdmin = user?.isAdmin;

  // GAS is the ONLY source of truth — all users see the same comments
  const [comments, setComments] = useState<Comment[]>([]);
  const [loading, setLoading] = useState(true);
  const [gasError, setGasError] = useState(false);

  // Form state
  const [name, setName] = useState(getCommenterName());
  const [content, setContent] = useState("");
  const [submitting, setSubmitting] = useState(false);

  // Reply state
  const [replyTo, setReplyTo] = useState<Comment | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Edit state
  const [editId, setEditId] = useState<string | null>(null);
  const [editContent, setEditContent] = useState("");

  // Like tracking (per-session, prevents double-like)
  const [likedIds, setLikedIds] = useState<Set<string>>(new Set());

  // Temp IDs for optimistic comments (local-only until GAS confirms)
  const [pendingIds, setPendingIds] = useState<Set<string>>(new Set());

  const loadComments = async () => {
    try {
      const serverComments = await realComments.getComments(movieId);
      setComments(serverComments.sort(
        (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
      ));
      setGasError(false);
    } catch {
      setGasError(true);
    } finally {
      setLoading(false);
    }
  };

  // Load on mount + auto-refresh every 30 seconds
  useEffect(() => {
    setLoading(true);
    setComments([]);
    loadComments();
    const interval = setInterval(loadComments, 30000);
    return () => clearInterval(interval);
  }, [movieId]);

  // Start reply — focus textarea
  const startReply = (c: Comment) => {
    setReplyTo(c);
    setContent("");
    setTimeout(() => textareaRef.current?.focus(), 50);
  };
  const cancelReply = () => setReplyTo(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!content.trim()) return;
    const commenterName = user?.name || name.trim() || "Anonymous";
    const userId = user?.id || `anon_${Date.now()}`;
    if (!user && name.trim()) localStorage.setItem(COMMENT_USER_KEY, name.trim());

    setSubmitting(true);

    // Optimistic: add to list immediately with temp id
    const tempId = `pending_${Date.now()}`;
    const optimistic: Comment = {
      id: tempId,
      movie_id: movieId,
      user_id: userId,
      user_name: commenterName,
      content: content.trim(),
      timestamp: new Date().toISOString(),
      likes: 0,
      reply_to: replyTo?.id,
      reply_to_name: replyTo?.user_name,
    };
    setComments((prev) => [...prev, optimistic]);
    setPendingIds((s) => new Set([...s, tempId]));
    const savedContent = content.trim();
    const savedReplyTo = replyTo;
    setContent("");
    setReplyTo(null);
    setSubmitting(false);

    // Save to GAS (background)
    const serverC = await realComments.addComment(
      movieId, userId, commenterName, savedContent,
      savedReplyTo?.id, savedReplyTo?.user_name
    );
    if (serverC) {
      // Replace optimistic with confirmed server comment
      setComments((prev) => prev.map((x) => x.id === tempId ? serverC : x));
      setPendingIds((s) => { const ns = new Set(s); ns.delete(tempId); return ns; });
    }
  };

  const handleLike = (c: Comment) => {
    if (likedIds.has(c.id) || pendingIds.has(c.id)) return;
    setLikedIds((prev) => new Set([...prev, c.id]));
    setComments((prev) => prev.map((x) => x.id === c.id ? { ...x, likes: (x.likes || 0) + 1 } : x));
    realComments.likeComment(c.id).catch(() => {});
  };

  const handleDelete = (c: Comment) => {
    setComments((prev) => prev.filter((x) => x.id !== c.id));
    if (!pendingIds.has(c.id)) realComments.deleteComment(c.id).catch(() => {});
  };

  const handleEdit = (c: Comment) => { setEditId(c.id); setEditContent(c.content); };
  const handleEditSave = (c: Comment) => {
    if (!editContent.trim()) return;
    setComments((prev) => prev.map((x) => x.id === c.id ? { ...x, content: editContent.trim(), edited: true } : x));
    realComments.editComment(c.id, movieId, editContent.trim()).catch(() => {});
    setEditId(null);
  };

  // Separate top-level comments from replies
  const topLevel = comments.filter((c) => !c.reply_to);
  const replies = comments.filter((c) => !!c.reply_to);
  const getReplies = (parentId: string) => replies.filter((r) => r.reply_to === parentId);

  return (
    <section className="max-w-5xl mx-auto px-4 py-10">
      {/* Header */}
      <div className="flex items-center gap-3 mb-8">
        <MessageSquare className="w-5 h-5 text-yellow-400" />
        <h2 className="text-xl font-black tracking-wide">Comments</h2>
        {!loading && (
          <span className="bg-yellow-400/15 text-yellow-400 text-xs font-bold px-2 py-0.5 rounded-full">
            {comments.filter((c) => !pendingIds.has(c.id)).length + pendingIds.size}
          </span>
        )}
        {gasError && (
          <span className="text-xs text-red-400/70 bg-red-400/10 border border-red-400/20 px-2 py-0.5 rounded-full ml-auto">
            GAS not connected — update your script
          </span>
        )}
      </div>

      {/* Post form */}
      <form onSubmit={handleSubmit} className="mb-10">
        <div className="bg-white/4 border border-white/8 rounded-2xl p-5 space-y-3">
          {/* Reply banner */}
          {replyTo && (
            <div className="flex items-center justify-between bg-yellow-400/8 border border-yellow-400/20 rounded-xl px-4 py-2.5">
              <div className="flex items-center gap-2 min-w-0">
                <MessageSquare className="w-3.5 h-3.5 text-yellow-400 flex-shrink-0" />
                <span className="text-xs text-yellow-400 font-bold">Replying to</span>
                <span className="text-xs font-black text-white truncate">{replyTo.user_name}</span>
                <span className="text-xs text-white/30 truncate hidden sm:block">
                  — "{replyTo.content.slice(0, 40)}{replyTo.content.length > 40 ? "…" : ""}"
                </span>
              </div>
              <button type="button" onClick={cancelReply} className="text-white/40 hover:text-white flex-shrink-0 ml-2">
                <X className="w-4 h-4" />
              </button>
            </div>
          )}

          {/* Name field for guests */}
          {!user && (
            <input
              type="text" value={name} onChange={(e) => setName(e.target.value)}
              placeholder="Your name (optional)"
              className="w-full bg-white/5 border border-white/10 focus:border-yellow-400/60 text-white placeholder:text-white/30 rounded-xl px-4 py-3 outline-none text-sm transition-colors"
            />
          )}

          {/* Logged-in user chip */}
          {user && (
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-full bg-yellow-400/20 flex items-center justify-center text-yellow-400 font-black text-xs">
                {user.name[0]?.toUpperCase()}
              </div>
              <span className="text-sm font-semibold text-white/70">{user.name}</span>
            </div>
          )}

          <textarea
            ref={textareaRef}
            value={content} onChange={(e) => setContent(e.target.value)}
            placeholder={replyTo ? `Reply to ${replyTo.user_name}...` : "Share your thoughts about this movie..."}
            rows={3}
            className="w-full bg-white/5 border border-white/10 focus:border-yellow-400/60 text-white placeholder:text-white/30 rounded-xl px-4 py-3 outline-none text-sm resize-none transition-colors"
          />
          <div className="flex justify-end">
            <button
              type="submit" disabled={submitting || !content.trim()}
              className="flex items-center gap-2 bg-yellow-400 hover:bg-yellow-300 disabled:opacity-40 text-black font-black px-5 py-2.5 rounded-xl text-sm transition-all"
            >
              {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
              {replyTo ? "Post Reply" : "Post Comment"}
            </button>
          </div>
        </div>
      </form>

      {/* Comment list */}
      {loading ? (
        <div className="flex items-center justify-center gap-3 py-16 text-white/30">
          <Loader2 className="w-5 h-5 animate-spin" />
          <span className="text-sm">Loading comments from server...</span>
        </div>
      ) : comments.length === 0 ? (
        <div className="text-center py-16">
          <MessageSquare className="w-12 h-12 mx-auto mb-3 text-white/15" />
          <p className="text-white/30 text-sm">
            {gasError ? "Connect your Google Apps Script to enable comments." : "No comments yet. Be the first!"}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {topLevel.map((c) => {
            const isPending = pendingIds.has(c.id);
            const threadReplies = getReplies(c.id);
            return (
              <div key={c.id}>
                {/* Top-level comment */}
                <div
                  className={`group border rounded-2xl p-5 transition-all ${isPending ? "opacity-60 border-white/5 bg-white/2" : "bg-white/4 hover:bg-white/6 border-white/8 hover:border-white/15"}`}
                >
                  <div className="flex items-start gap-3">
                    <div className="w-9 h-9 rounded-full bg-gradient-to-br from-yellow-400/30 to-yellow-600/20 flex items-center justify-center text-yellow-400 font-black text-sm flex-shrink-0">
                      {c.user_name[0]?.toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap mb-1">
                        <span className="font-bold text-sm text-white">{c.user_name}</span>
                        {c.edited && <span className="text-xs text-white/30">(edited)</span>}
                        {isPending && <span className="text-xs text-yellow-400/50">sending...</span>}
                        <span className="text-xs text-white/30">{timeAgo(c.timestamp)}</span>
                      </div>

                      {editId === c.id ? (
                        <div className="space-y-2">
                          <textarea
                            value={editContent} onChange={(e) => setEditContent(e.target.value)}
                            rows={2}
                            className="w-full bg-white/10 border border-white/20 focus:border-yellow-400/60 text-white rounded-xl px-3 py-2 text-sm resize-none outline-none"
                          />
                          <div className="flex gap-2">
                            <button onClick={() => handleEditSave(c)} className="flex items-center gap-1 bg-yellow-400 text-black font-bold px-3 py-1.5 rounded-lg text-xs">
                              <Check className="w-3 h-3" /> Save
                            </button>
                            <button onClick={() => setEditId(null)} className="flex items-center gap-1 bg-white/10 text-white px-3 py-1.5 rounded-lg text-xs">
                              <X className="w-3 h-3" /> Cancel
                            </button>
                          </div>
                        </div>
                      ) : (
                        <p className="text-sm text-white/80 leading-relaxed">{c.content}</p>
                      )}

                      {/* Action row */}
                      {editId !== c.id && (
                        <div className="flex items-center gap-4 mt-3">
                          <button
                            onClick={() => handleLike(c)}
                            className={`flex items-center gap-1.5 text-xs transition-colors ${likedIds.has(c.id) ? "text-yellow-400" : "text-white/40 hover:text-yellow-400"}`}
                          >
                            <ThumbsUp className="w-3.5 h-3.5" />
                            {(c.likes || 0) > 0 && <span>{c.likes}</span>}
                          </button>
                          {!isPending && (
                            <button
                              onClick={() => startReply(c)}
                              className="flex items-center gap-1.5 text-xs text-white/40 hover:text-yellow-400 transition-colors"
                            >
                              <MessageSquare className="w-3.5 h-3.5" />
                              Reply{threadReplies.length > 0 ? ` (${threadReplies.length})` : ""}
                            </button>
                          )}
                          {isAdmin && !isPending && (
                            <>
                              <button onClick={() => handleEdit(c)} className="text-white/30 hover:text-white/60 transition-colors ml-auto">
                                <Pencil className="w-3.5 h-3.5" />
                              </button>
                              <button onClick={() => handleDelete(c)} className="text-red-400/50 hover:text-red-400 transition-colors">
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {/* Replies indented */}
                {threadReplies.length > 0 && (
                  <div className="ml-8 mt-2 space-y-2 border-l-2 border-white/6 pl-4">
                    {threadReplies.map((r) => {
                      const rPending = pendingIds.has(r.id);
                      return (
                        <div
                          key={r.id}
                          className={`group border rounded-xl p-4 transition-all ${rPending ? "opacity-60 border-white/5 bg-white/2" : "bg-white/3 hover:bg-white/5 border-white/6 hover:border-white/12"}`}
                        >
                          <div className="flex items-start gap-3">
                            <div className="w-7 h-7 rounded-full bg-white/10 flex items-center justify-center text-white/60 font-black text-xs flex-shrink-0">
                              {r.user_name[0]?.toUpperCase()}
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 flex-wrap mb-1">
                                <span className="font-bold text-xs text-white">{r.user_name}</span>
                                {r.reply_to_name && (
                                  <span className="text-xs text-yellow-400/60">→ {r.reply_to_name}</span>
                                )}
                                {r.edited && <span className="text-xs text-white/30">(edited)</span>}
                                {rPending && <span className="text-xs text-yellow-400/50">sending...</span>}
                                <span className="text-xs text-white/25">{timeAgo(r.timestamp)}</span>
                              </div>
                              <p className="text-sm text-white/75 leading-relaxed">{r.content}</p>
                              <div className="flex items-center gap-4 mt-2.5">
                                <button
                                  onClick={() => handleLike(r)}
                                  className={`flex items-center gap-1.5 text-xs transition-colors ${likedIds.has(r.id) ? "text-yellow-400" : "text-white/30 hover:text-yellow-400"}`}
                                >
                                  <ThumbsUp className="w-3 h-3" />
                                  {(r.likes || 0) > 0 && <span>{r.likes}</span>}
                                </button>
                                {!rPending && (
                                  <button
                                    onClick={() => startReply(c)}
                                    className="text-xs text-white/30 hover:text-yellow-400 transition-colors flex items-center gap-1.5"
                                  >
                                    <MessageSquare className="w-3 h-3" />
                                    Reply
                                  </button>
                                )}
                                {isAdmin && !rPending && (
                                  <>
                                    <button onClick={() => handleDelete(r)} className="text-red-400/40 hover:text-red-400 transition-colors ml-auto">
                                      <Trash2 className="w-3 h-3" />
                                    </button>
                                  </>
                                )}
                              </div>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}

          {/* Pending replies not yet attached to a top-level comment (edge case) */}
          {replies.filter((r) => pendingIds.has(r.id)).map((r) => (
            <div key={r.id} className="ml-8 border-l-2 border-yellow-400/20 pl-4">
              <div className="opacity-60 border border-white/5 bg-white/2 rounded-xl p-4">
                <span className="text-xs text-yellow-400/50">Sending reply...</span>
                <p className="text-sm text-white/60 mt-1">{r.content}</p>
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

// ── You Might Like slider ─────────────────────────────────────────────────────
function YouMightLike({ movies }: { movies: Movie[] }) {
  const rowRef = useRef<HTMLDivElement>(null);
  const scroll = (dir: "left" | "right") => {
    if (!rowRef.current) return;
    rowRef.current.scrollBy({ left: dir === "left" ? -320 : 320, behavior: "smooth" });
  };
  if (!movies.length) return null;
  return (
    <section className="max-w-5xl mx-auto px-4 pb-16">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-xl font-black tracking-wide">You Might Like</h2>
        <div className="flex gap-2">
          <button onClick={() => scroll("left")} className="w-8 h-8 rounded-full bg-white/10 hover:bg-yellow-400/20 hover:text-yellow-400 flex items-center justify-center transition-all">
            <ChevronLeft className="w-4 h-4" />
          </button>
          <button onClick={() => scroll("right")} className="w-8 h-8 rounded-full bg-white/10 hover:bg-yellow-400/20 hover:text-yellow-400 flex items-center justify-center transition-all">
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </div>
      <div ref={rowRef} className="flex gap-4 overflow-x-auto pb-2" style={{ scrollbarWidth: "none", msOverflowStyle: "none" }}>
        {movies.map((m) => (
          <Link key={m.id} href={`/movie/${m.id}`} className="flex-shrink-0 w-[160px] group cursor-pointer">
            <div className="relative aspect-[2/3] rounded-xl overflow-hidden mb-2">
              <img src={m.poster_url} alt={m.title} className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105" />
              <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                <div className="w-10 h-10 rounded-full bg-yellow-400 flex items-center justify-center">
                  <Play className="w-5 h-5 text-black fill-black ml-0.5" />
                </div>
              </div>
              {m.rating && (
                <div className="absolute top-2 right-2 bg-black/70 backdrop-blur-sm text-yellow-400 text-xs font-black px-1.5 py-0.5 rounded-lg">
                  {m.rating}
                </div>
              )}
            </div>
            <p className="font-bold text-xs text-white/90 leading-tight truncate">{m.title}</p>
            <p className="text-xs text-white/40 mt-0.5">{m.year} · {m.genre}</p>
          </Link>
        ))}
      </div>
    </section>
  );
}

// ── Section header ────────────────────────────────────────────────────────────
function SectionHeader({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3 mb-6">
      <div className="w-1 h-6 rounded-full bg-yellow-400" />
      <h2 className="text-lg font-black tracking-wide text-white">{children}</h2>
    </div>
  );
}

// ── Main MoviePage ────────────────────────────────────────────────────────────
export default function MoviePage() {
  const { id } = useParams<{ id: string }>();
  const { movie, loading } = useMovie(id);
  const { movies } = useMovies();
  const [, navigate] = useLocation();
  const [bookmarked, setBookmarked] = useState(false);
  const [activeTab, setActiveTab] = useState<"movie" | "episodes" | "download">("movie");
  const [likeCount, setLikeCount] = useState(0);
  const [liked, setLiked] = useState(false);
  const [showPlayer, setShowPlayer] = useState(false);
  const [playingEpisodeIdx, setPlayingEpisodeIdx] = useState<number | null>(null);
  const tabRef = useRef<HTMLDivElement>(null);
  const user = getCurrentUser();

  const related = useMemo(() => {
    if (!movie) return [];
    return movies.filter((m) => m.id !== movie.id && m.genre === movie.genre).slice(0, 12);
  }, [movie, movies]);

  const { prevMovie, nextMovie } = useMemo(() => {
    if (!movie || !movies.length) return { prevMovie: null, nextMovie: null };
    const idx = movies.findIndex((m) => m.id === movie.id);
    return {
      prevMovie: idx > 0 ? movies[idx - 1] : null,
      nextMovie: idx < movies.length - 1 ? movies[idx + 1] : null,
    };
  }, [movie, movies]);

  const castList = useMemo(() => (movie?.cast ? parseCast(movie.cast) : []), [movie?.cast]);
  const galleryImages = useMemo(
    () => (movie?.gallery ? movie.gallery.split(",").map((u) => u.trim()).filter(Boolean).slice(0, 5) : []),
    [movie?.gallery]
  );

  const availableQualities = useMemo(
    () => QUALITY_META.filter((q) => {
      const url = movie?.[q.key] as string;
      return url && url.trim() !== "" && url !== "#";
    }),
    [movie]
  );

  useEffect(() => {
    if (id) {
      setBookmarked(isBookmarked(id));
      setLikeCount(likeStore.getLikes(id));
      setLiked(likeStore.hasLiked(id));
    }
  }, [id]);

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "smooth" });
    setActiveTab("movie");
  }, [id]);

  const handlePlay = async () => {
    if (!movie) return;
    if (user) {
      addToWatchHistory({ movieId: movie.id, movieTitle: movie.title, posterUrl: movie.poster_url });
      try { await api.addViewCount(movie.id, user.id); } catch {}
    }
    if (movie.type === "series" && Array.isArray(movie.episodes) && movie.episodes.length > 0) {
      setPlayingEpisodeIdx(0);
    } else {
      setPlayingEpisodeIdx(null);
    }
    setShowPlayer(true);
  };

  const handleBookmark = () => {
    if (!movie) return;
    setBookmarked(toggleBookmark(movie.id));
  };

  const handleLike = () => {
    if (!movie) return;
    const result = likeStore.toggleLike(movie.id);
    setLiked(result.liked);
    setLikeCount(result.count);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-black">
        <Navbar />
        <div className="pt-20 animate-pulse">
          <div className="h-[60vh] bg-black" />
          <div className="max-w-5xl mx-auto px-4 py-8 space-y-4">
            <div className="h-8 w-64 bg-zinc-900 rounded" />
            <div className="h-4 w-full bg-zinc-900 rounded" />
            <div className="h-4 w-3/4 bg-zinc-900 rounded" />
          </div>
        </div>
      </div>
    );
  }

  if (!movie) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <Navbar />
        <div className="text-center">
          <p className="text-white/60 text-lg mb-4">Movie not found</p>
          <Link href="/movies" className="text-yellow-400 hover:underline">Browse Movies</Link>
        </div>
      </div>
    );
  }

  const hasMovieContent = movie.synopsis || movie.rating || movie.tmdb_rating || movie.rt_rating || movie.director || movie.cast || galleryImages.length > 0;
  const hasDownloadContent = availableQualities.length > 0 || movie.download_url || movie.subtitle_url;

  return (
    <div className="min-h-screen bg-black text-white">
      {/* ── Video Player Modal ── */}
      {showPlayer && movie && (
        <VideoPlayerModal
          movie={movie}
          onClose={() => { setShowPlayer(false); setPlayingEpisodeIdx(null); }}
          episodes={movie.type === "series" && Array.isArray(movie.episodes) && movie.episodes.length > 0 ? movie.episodes : undefined}
          episodeIdx={playingEpisodeIdx ?? undefined}
          onEpisodeChange={(idx) => setPlayingEpisodeIdx(idx)}
        />
      )}

      <Navbar />

      <MovieBanner
        movie={movie}
        onPlay={handlePlay}
        bookmarked={bookmarked}
        onBookmark={handleBookmark}
        showBookmark={!!user}
      />

      {/* ── Tab Bar ─────────────────────────────────────────────────────── */}
      <div ref={tabRef} className="sticky top-0 z-30 bg-black/95 backdrop-blur-xl border-b border-white/8">
        <div className="max-w-5xl mx-auto px-4">
          <div className="flex">
            {([
              ["movie", movie?.type === "series" ? "Overview" : "Movie", <Info className="w-4 h-4" />],
              ...(movie?.type === "series" && Array.isArray(movie.episodes) && movie.episodes.length > 0
                ? [["episodes", `Episodes (${movie.episodes.length})`, <Play className="w-4 h-4" />]]
                : []),
              ["download", "Download", <Download className="w-4 h-4" />],
            ] as ["movie" | "episodes" | "download", string, React.ReactNode][]).map(([key, label, icon]) => (
              <button
                key={key}
                onClick={() => setActiveTab(key)}
                className={`flex items-center gap-2 px-5 py-4 text-sm font-bold transition-all border-b-2 ${
                  activeTab === key
                    ? "border-yellow-400 text-yellow-400"
                    : "border-transparent text-white/40 hover:text-white/70"
                }`}
              >
                {icon}
                {label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* ── Movie Tab ───────────────────────────────────────────────────── */}
      {activeTab === "movie" && (
        <main className="max-w-5xl mx-auto px-4 py-10 space-y-14">

          {/* Synopsis */}
          {movie.synopsis && (
            <section>
              <SectionHeader>Synopsis</SectionHeader>
              <p className="text-white/75 leading-8 text-base" style={{ fontFamily: "Georgia, serif" }}>
                {movie.synopsis}
              </p>
            </section>
          )}

          {/* Critical Analysis — modern B&W cards */}
          {(movie.rating || movie.tmdb_rating || movie.rt_rating) && (
            <section>
              <SectionHeader>Critical Analysis</SectionHeader>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                {movie.rating && (
                  <RatingCard
                    logo={<ImdbLogo />}
                    label="IMDb Score"
                    score={Number(movie.rating)}
                    max={10}
                  />
                )}
                {movie.tmdb_rating && (
                  <RatingCard
                    logo={<TmdbLogo />}
                    label="TMDB Score"
                    score={Number(movie.tmdb_rating)}
                    max={10}
                  />
                )}
                {!!movie.rt_rating && Number(movie.rt_rating) > 0 && (
                  <RatingCard
                    logo={<RtLogo />}
                    label="Tomatometer"
                    score={Number(movie.rt_rating)}
                    max={100}
                    pct
                  />
                )}
              </div>
            </section>
          )}

          {/* Director */}
          {movie.director && (
            <section>
              <SectionHeader>Director</SectionHeader>
              <div className="flex items-center gap-5">
                {movie.director_image ? (
                  <img src={movie.director_image} alt={movie.director}
                    className="w-20 h-20 rounded-full object-cover border-2 border-yellow-400/40" />
                ) : (
                  <div className="w-20 h-20 rounded-full bg-yellow-400/10 border-2 border-yellow-400/20 flex items-center justify-center text-yellow-400 font-black text-2xl">
                    {movie.director[0]}
                  </div>
                )}
                <div>
                  <p className="font-black text-lg text-white">{movie.director}</p>
                  <p className="text-sm text-white/40 mt-0.5">Director</p>
                </div>
              </div>
            </section>
          )}

          {/* Cast */}
          {castList.length > 0 && (
            <section>
              <SectionHeader>Cast</SectionHeader>
              <div className="flex gap-5 overflow-x-auto pb-3" style={{ scrollbarWidth: "none" }}>
                {castList.slice(0, 5).map((c, i) => (
                  <div key={i} className="flex-shrink-0 w-[120px] group text-center">
                    <div className="relative w-[120px] h-[170px] rounded-2xl overflow-hidden mb-3">
                      {c.image ? (
                        <img src={c.image} alt={c.name}
                          className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
                          onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }} />
                      ) : (
                        <div className="w-full h-full bg-white/5 flex items-center justify-center text-3xl font-black text-white/20">
                          {c.name[0]}
                        </div>
                      )}
                      <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent" />
                    </div>
                    <p className="font-bold text-xs text-white leading-tight">{c.name}</p>
                    {c.role && <p className="text-xs text-white/40 mt-0.5">{c.role}</p>}
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* Gallery */}
          {galleryImages.length > 0 && (
            <section>
              <SectionHeader>Gallery</SectionHeader>
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
                {galleryImages.map((img, i) => (
                  <div key={i} className="relative group aspect-video rounded-xl overflow-hidden cursor-pointer">
                    <img src={img} alt={`Gallery ${i + 1}`}
                      className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110" />
                    <div className="absolute inset-0 bg-black/0 group-hover:bg-black/65 transition-all duration-300 flex items-center justify-center">
                      <span className="font-black text-white opacity-0 group-hover:opacity-100 transition-all duration-300 scale-90 group-hover:scale-100"
                        style={{ fontSize: "clamp(12px, 2.5vw, 18px)", letterSpacing: "0.12em" }}>
                        MOOV<span className="text-yellow-400">IED</span>
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}

          {!hasMovieContent && (
            <div className="text-center py-20 text-white/30">
              <Info className="w-12 h-12 mx-auto mb-3 opacity-40" />
              <p>No additional movie details available.</p>
            </div>
          )}
        </main>
      )}

      {/* ── Episodes Tab ─────────────────────────────────────────────────── */}
      {activeTab === "episodes" && movie?.type === "series" && Array.isArray(movie.episodes) && (
        <main className="max-w-5xl mx-auto px-4 py-10 space-y-6">
          <SectionHeader>{movie.episodes.length} Episodes</SectionHeader>

          {/* Group by season */}
          {Array.from(new Set(movie.episodes.map(ep => ep.season))).sort((a,b)=>a-b).map(season => (
            <section key={season}>
              <h3 className="text-sm font-black text-yellow-400 mb-3 tracking-wider uppercase">
                Season {season}
              </h3>
              <div className="space-y-2">
                {movie.episodes!
                  .filter(ep => ep.season === season)
                  .sort((a,b) => a.episode - b.episode)
                  .map((ep) => {
                    const epIdx = movie.episodes!.indexOf(ep);
                    return (
                      <div
                        key={ep.id}
                        className="group flex items-center gap-4 rounded-2xl border border-white/8 bg-white/3 hover:bg-white/7 hover:border-yellow-400/20 transition-all p-4 cursor-pointer"
                        onClick={() => {
                          setPlayingEpisodeIdx(epIdx);
                          setShowPlayer(true);
                        }}
                      >
                        {/* Thumbnail */}
                        <div className="relative flex-shrink-0 w-28 h-16 rounded-xl overflow-hidden bg-white/5 border border-white/8">
                          {ep.thumbnail ? (
                            <img src={ep.thumbnail} alt={ep.title} className="w-full h-full object-cover" />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center">
                              <Play className="w-5 h-5 text-white/20" />
                            </div>
                          )}
                          {/* Play overlay */}
                          <div className="absolute inset-0 flex items-center justify-center bg-black/40 opacity-0 group-hover:opacity-100 transition-all">
                            <div className="w-8 h-8 rounded-full bg-yellow-400 flex items-center justify-center">
                              <Play className="w-4 h-4 text-black fill-black" />
                            </div>
                          </div>
                        </div>

                        {/* Info */}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-baseline gap-2">
                            <span className="text-xs font-black text-yellow-400/70 flex-shrink-0">
                              E{String(ep.episode).padStart(2,"0")}
                            </span>
                            <span className="font-bold text-white truncate">{ep.title}</span>
                            {ep.duration && (
                              <span className="text-xs text-white/30 flex-shrink-0">{ep.duration}</span>
                            )}
                          </div>
                          {ep.description && (
                            <p className="text-sm text-white/40 mt-1 line-clamp-2 leading-snug">{ep.description}</p>
                          )}
                        </div>

                        {/* Right actions */}
                        <div className="flex items-center gap-2 flex-shrink-0">
                          {ep.download_url && (
                            <a
                              href={ep.download_url}
                              download
                              onClick={e => e.stopPropagation()}
                              className="p-2 rounded-xl border border-white/10 hover:border-yellow-400/30 hover:bg-yellow-400/5 transition-all"
                              title="Download episode"
                            >
                              <Download className="w-4 h-4 text-white/40 hover:text-yellow-400" />
                            </a>
                          )}
                          <div className="w-9 h-9 rounded-xl border border-white/10 group-hover:border-yellow-400/30 bg-white/4 group-hover:bg-yellow-400/8 flex items-center justify-center transition-all">
                            <Play className="w-4 h-4 text-white/40 group-hover:text-yellow-400 transition-all" />
                          </div>
                        </div>
                      </div>
                    );
                  })}
              </div>
            </section>
          ))}
        </main>
      )}

      {/* ── Download Tab — System File Manager Look ──────────────────────── */}
      {activeTab === "download" && (
        <main className="max-w-5xl mx-auto px-4 py-10 space-y-8">

          {/* Download manager panel */}
          <section>
            {/* Panel header */}
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-3">
                <Folder className="w-5 h-5 text-yellow-400" />
                <h2 className="text-lg font-black tracking-wide">Download Manager</h2>
              </div>
              <div className="flex items-center gap-2 text-xs text-white/40">
                <span
                  className="w-1.5 h-1.5 rounded-full"
                  style={{ background: availableQualities.length > 0 ? "#4ade80" : "#ef4444" }}
                />
                {availableQualities.length} format{availableQualities.length !== 1 ? "s" : ""} available
              </div>
            </div>

            {/* Column headers */}
            <div className="flex items-center gap-4 px-5 py-2.5 rounded-t-xl border border-b-0 border-white/8"
              style={{ background: "rgba(255,255,255,0.025)" }}>
              <div className="w-11 flex-shrink-0" />
              <div className="flex-1 text-xs font-bold text-white/30 uppercase tracking-widest">File Info</div>
              <div className="w-28 text-xs font-bold text-white/30 uppercase tracking-widest text-right pr-4">Action</div>
            </div>

            {/* File rows */}
            <div className="border border-white/8 rounded-b-xl overflow-hidden"
              style={{ background: "rgba(0,0,0,0.5)" }}>
              {availableQualities.length > 0 ? (
                availableQualities.map((q, i) => (
                  <QualityFileRow
                    key={q.key}
                    label={q.label}
                    tag={q.tag}
                    url={(movie[q.key] as string) || ""}
                    color={q.color}
                    desc={q.desc}
                    codec={q.codec}
                    isFirst={i === 0}
                  />
                ))
              ) : (
                <div className="flex flex-col items-center justify-center py-16 gap-3 text-white/25">
                  <Download className="w-10 h-10 opacity-30" />
                  <p className="text-sm">No download links have been added yet.</p>
                </div>
              )}
            </div>

            {/* Fallback single download link */}
            {availableQualities.length === 0 && movie.download_url && movie.download_url !== "#" && (
              <div className="mt-3 flex items-center gap-4 px-5 py-4 rounded-xl border border-white/8"
                style={{ background: "rgba(0,0,0,0.5)" }}>
                <div className="w-11 h-11 rounded-xl flex items-center justify-center border border-yellow-400/30"
                  style={{ background: "rgba(245,197,24,0.1)" }}>
                  <FileVideo className="w-5 h-5 text-yellow-400" />
                </div>
                <div className="flex-1">
                  <p className="font-black text-sm text-white">{movie.title}</p>
                  <p className="text-xs text-white/35 mt-0.5">Standard Quality</p>
                </div>
                <a href={movie.download_url} target="_blank" rel="noreferrer"
                  className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold text-yellow-400 border border-yellow-400/35 transition-all hover:bg-yellow-400/15"
                  style={{ background: "rgba(245,197,24,0.1)" }}>
                  <Download className="w-4 h-4" />
                  Download
                </a>
              </div>
            )}
          </section>

          {/* Subtitle */}
          {movie.subtitle_url && movie.subtitle_url.trim() !== "" && (
            <section>
              <div className="flex items-center gap-3 mb-3">
                <Subtitles className="w-5 h-5 text-blue-400" />
                <h2 className="text-lg font-black tracking-wide">Subtitles</h2>
              </div>
              <div className="flex items-center gap-4 px-5 py-4 rounded-xl border border-white/8 transition-all hover:border-blue-500/30"
                style={{ background: "rgba(0,0,0,0.5)" }}>
                <div className="w-11 h-11 rounded-xl flex items-center justify-center border border-blue-500/30"
                  style={{ background: "rgba(59,130,246,0.1)" }}>
                  <Subtitles className="w-5 h-5 text-blue-400" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-black text-sm text-white">{movie.title} — Subtitle</p>
                  <div className="flex items-center gap-3 mt-0.5">
                    <span className="text-xs font-mono text-white/30">WebVTT / SRT</span>
                    <span className="flex items-center gap-1">
                      <span className="w-1.5 h-1.5 rounded-full bg-green-400" />
                      <span className="text-[11px] text-green-400">Available</span>
                    </span>
                  </div>
                </div>
                <a href={movie.subtitle_url} target="_blank" rel="noreferrer"
                  className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold text-blue-400 border border-blue-500/30 transition-all hover:bg-blue-500/15"
                  style={{ background: "rgba(59,130,246,0.08)" }}>
                  <Download className="w-4 h-4" />
                  Download
                </a>
              </div>
            </section>
          )}

          {/* Like system */}
          <section>
            <div className="flex flex-col items-center justify-center py-8 gap-4">
              <button onClick={handleLike} className="group flex flex-col items-center gap-3 transition-all duration-300">
                <div
                  className="w-20 h-20 rounded-full flex items-center justify-center border-2 transition-all duration-300"
                  style={{
                    background: liked ? "rgba(239,68,68,0.2)" : "rgba(255,255,255,0.05)",
                    borderColor: liked ? "#ef4444" : "rgba(255,255,255,0.15)",
                    boxShadow: liked ? "0 0 30px rgba(239,68,68,0.3)" : "none",
                  }}
                >
                  <Heart className="w-9 h-9 transition-all duration-300"
                    style={{
                      color: liked ? "#ef4444" : "rgba(255,255,255,0.3)",
                      fill: liked ? "#ef4444" : "none",
                      transform: liked ? "scale(1.1)" : "scale(1)",
                    }}
                  />
                </div>
                <div className="text-center">
                  <p className="font-black text-2xl" style={{ color: liked ? "#ef4444" : "rgba(255,255,255,0.7)" }}>
                    {likeCount}
                  </p>
                  <p className="text-xs text-white/40">{liked ? "You liked this" : "Tap to like"}</p>
                </div>
              </button>
            </div>
          </section>
        </main>
      )}

      {/* ── Prev / Next Navigation ──────────────────────────────────────── */}
      <div className="border-t border-white/6 bg-black">
        <div className="max-w-5xl mx-auto">
          <div className="grid grid-cols-2">
            {prevMovie ? (
              <Link href={`/movie/${prevMovie.id}`}
                className="group flex items-center gap-3 px-5 py-4 hover:bg-white/4 transition-all border-r border-white/6">
                <div className="flex-shrink-0 w-8 h-8 rounded-lg bg-white/8 group-hover:bg-yellow-400/15 flex items-center justify-center transition-all">
                  <ChevronLeft className="w-5 h-5 text-white/50 group-hover:text-yellow-400 transition-colors" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-xs text-white/30 mb-0.5">Previous</p>
                  <p className="font-bold text-sm text-white/80 group-hover:text-white truncate transition-colors">{prevMovie.title}</p>
                </div>
                <img src={prevMovie.poster_url} alt={prevMovie.title}
                  className="w-8 h-11 object-cover rounded-lg opacity-50 group-hover:opacity-100 transition-opacity flex-shrink-0" />
              </Link>
            ) : <div />}
            {nextMovie ? (
              <Link href={`/movie/${nextMovie.id}`}
                className="group flex items-center gap-3 px-5 py-4 hover:bg-white/4 transition-all justify-end text-right">
                <img src={nextMovie.poster_url} alt={nextMovie.title}
                  className="w-8 h-11 object-cover rounded-lg opacity-50 group-hover:opacity-100 transition-opacity flex-shrink-0" />
                <div className="min-w-0 flex-1">
                  <p className="text-xs text-white/30 mb-0.5">Next</p>
                  <p className="font-bold text-sm text-white/80 group-hover:text-white truncate transition-colors">{nextMovie.title}</p>
                </div>
                <div className="flex-shrink-0 w-8 h-8 rounded-lg bg-white/8 group-hover:bg-yellow-400/15 flex items-center justify-center transition-all">
                  <ChevronRight className="w-5 h-5 text-white/50 group-hover:text-yellow-400 transition-colors" />
                </div>
              </Link>
            ) : <div />}
          </div>
        </div>
      </div>

      {/* ── Comments ────────────────────────────────────────────────────── */}
      <div className="border-t border-white/6 bg-black">
        <CommentSection movieId={movie.id} />
      </div>

      {/* ── You Might Like ──────────────────────────────────────────────── */}
      {related.length > 0 && (
        <div className="border-t border-white/6 bg-black pt-10">
          <YouMightLike movies={related} />
        </div>
      )}
    </div>
  );
}
