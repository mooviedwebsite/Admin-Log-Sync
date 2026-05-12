import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { useLocation, Link } from "wouter";
import {
  Bookmark, Clock, LogOut, Film, Heart, Star, TrendingUp, Calendar,
  MapPin, Shield, ChevronRight, Play, BarChart3, Activity, Camera,
  Upload, Link2, Check, X, Edit3, Trash2, ImagePlus, Github,
  AlertCircle, Loader2, User, Sparkles,
} from "lucide-react";
import Navbar from "@/components/Navbar";
import MovieCard from "@/components/MovieCard";
import { api, DEMO_MOVIES, type Movie } from "@/lib/api";
import {
  getCurrentUser, logout, getBookmarks, getWatchHistory, type WatchEntry,
  updateUserName, removeUserAvatar, saveUserAvatar, type AuthUser,
} from "@/lib/auth";

// ── Helpers ───────────────────────────────────────────────────────────────────
function daysSince(dateStr: string): number {
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return 0;
  return Math.floor((Date.now() - d.getTime()) / 86400000);
}

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "Just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 30) return `${d}d ago`;
  return new Date(dateStr).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function formatJoined(dateStr: string): string {
  try { return new Date(dateStr).toLocaleDateString("en-US", { year: "numeric", month: "long" }); }
  catch { return ""; }
}

function getLikedMovieIds(): string[] {
  try {
    const map: Record<string, boolean> = JSON.parse(localStorage.getItem("moovied_user_liked") || "{}");
    return Object.entries(map).filter(([, v]) => v).map(([k]) => k);
  } catch { return []; }
}

// ── Avatar component ──────────────────────────────────────────────────────────
function Avatar({
  user, size = 96, onClick, showEditHint,
}: { user: AuthUser; size?: number; onClick?: () => void; showEditHint?: boolean }) {
  const initial = (user.name[0] || "?").toUpperCase();
  const px = `${size}px`;

  return (
    <div
      className={`relative flex-shrink-0 ${onClick ? "cursor-pointer group" : ""}`}
      style={{ width: px, height: px }}
      onClick={onClick}
    >
      {/* Glow ring */}
      <div
        className="absolute -inset-[3px] rounded-full opacity-60 blur-sm"
        style={{ background: "conic-gradient(from 0deg, #FACC15 0%, #000 50%, #FACC15 100%)" }}
      />
      {/* Circle */}
      <div
        className="relative w-full h-full rounded-full overflow-hidden border-2 border-yellow-400/50"
        style={{ background: "linear-gradient(135deg,#1a1a0a,#2a2000)" }}
      >
        {user.avatarUrl ? (
          <img src={user.avatarUrl} alt={user.name} className="w-full h-full object-cover" />
        ) : (
          <span
            className="flex items-center justify-center w-full h-full font-black text-yellow-400"
            style={{ fontSize: size * 0.38 }}
          >{initial}</span>
        )}
        {/* Hover overlay */}
        {onClick && (
          <div className="absolute inset-0 bg-black/0 group-hover:bg-black/55 transition-all flex items-center justify-center">
            <Camera className="w-6 h-6 text-white opacity-0 group-hover:opacity-100 transition-all" />
          </div>
        )}
      </div>
      {/* Online dot */}
      <div
        className="absolute rounded-full bg-green-400 border-2 border-black"
        style={{ width: Math.max(12, size * 0.165), height: Math.max(12, size * 0.165), bottom: 2, right: 2 }}
      />
      {/* Edit badge */}
      {showEditHint && onClick && (
        <div
          className="absolute -bottom-3 left-1/2 -translate-x-1/2 flex items-center gap-1 text-[10px] font-black text-black bg-yellow-400 rounded-full px-2 py-0.5 opacity-0 group-hover:opacity-100 transition-all whitespace-nowrap shadow-lg"
        >
          <Upload className="w-2.5 h-2.5" /> Change
        </div>
      )}
    </div>
  );
}

// ── Upload Modal ──────────────────────────────────────────────────────────────
type UploadTab = "upload" | "url";

function UploadModal({ user, onClose, onSaved }: {
  user: AuthUser;
  onClose: () => void;
  onSaved: (user: AuthUser) => void;
}) {
  const [tab, setTab]             = useState<UploadTab>("upload");
  const [dragging, setDragging]   = useState(false);
  const [preview, setPreview]     = useState<string | null>(user.avatarUrl || null);
  const [urlInput, setUrlInput]   = useState("");
  const [urlErr, setUrlErr]       = useState("");
  const [saving, setSaving]       = useState(false);
  const [ghStatus, setGhStatus]   = useState<"idle"|"uploading"|"done"|"fail">("idle");
  const fileRef = useRef<HTMLInputElement>(null);

  const handleFile = useCallback((file: File) => {
    if (!file.type.startsWith("image/")) return;
    if (file.size > 5 * 1024 * 1024) { alert("Image must be under 5 MB"); return; }
    const reader = new FileReader();
    reader.onload = (e) => setPreview(e.target?.result as string);
    reader.readAsDataURL(file);
  }, []);

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault(); setDragging(false);
    const f = e.dataTransfer.files[0];
    if (f) handleFile(f);
  };

  const handleUrlLoad = () => {
    setUrlErr("");
    const url = urlInput.trim();
    if (!url) { setUrlErr("Please enter a URL"); return; }
    if (!url.startsWith("http")) { setUrlErr("URL must start with http:// or https://"); return; }
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => setPreview(url);
    img.onerror = () => setUrlErr("Could not load image from this URL. Try a direct image link.");
    img.src = url;
  };

  const handleSave = async () => {
    if (!preview) return;
    setSaving(true);
    if (preview.startsWith("data:")) setGhStatus("uploading");
    try {
      const { user: updated, hostedOnGitHub } = await saveUserAvatar(preview);
      setGhStatus(hostedOnGitHub ? "done" : "fail");
      setTimeout(() => onSaved(updated), hostedOnGitHub ? 800 : 0);
    } catch {
      setGhStatus("fail");
    } finally {
      setSaving(false);
    }
  };

  const handleRemove = () => {
    const updated = removeUserAvatar();
    if (updated) onSaved(updated);
  };

  return (
    <div
      className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center p-0 sm:p-4"
      style={{ background: "rgba(0,0,0,0.88)", backdropFilter: "blur(16px)" }}
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        className="w-full sm:max-w-[440px] rounded-t-3xl sm:rounded-3xl overflow-hidden"
        style={{
          background:  "linear-gradient(160deg,#141414 0%,#0c0c0c 100%)",
          border:      "1px solid rgba(250,204,21,0.18)",
          boxShadow:   "0 40px 80px rgba(0,0,0,0.9), 0 0 0 1px rgba(250,204,21,0.06)",
        }}
      >
        {/* Handle (mobile) */}
        <div className="flex justify-center pt-3 pb-1 sm:hidden">
          <div className="w-10 h-1 rounded-full bg-white/20" />
        </div>

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/8">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-yellow-400/12 border border-yellow-400/20 flex items-center justify-center">
              <Camera className="w-4 h-4 text-yellow-400" />
            </div>
            <div>
              <p className="font-black text-sm text-white">Update Profile Photo</p>
              <p className="text-[11px] text-white/35 mt-0.5">Saved to GitHub CDN for fast loading</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 rounded-xl hover:bg-white/8 text-white/35 hover:text-white transition-all">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex gap-2 px-5 pt-4">
          {(["upload","url"] as UploadTab[]).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-black transition-all ${
                tab === t ? "bg-yellow-400 text-black" : "bg-white/6 text-white/40 hover:text-white hover:bg-white/10"
              }`}
            >
              {t === "upload" ? <Upload className="w-3 h-3" /> : <Link2 className="w-3 h-3" />}
              {t === "upload" ? "Upload / Drag" : "Paste URL"}
            </button>
          ))}
        </div>

        <div className="px-5 py-4 space-y-4">
          {/* Upload zone */}
          {tab === "upload" && (
            <div
              onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
              onDragLeave={() => setDragging(false)}
              onDrop={handleDrop}
              onClick={() => fileRef.current?.click()}
              className="relative flex flex-col items-center justify-center gap-3 rounded-2xl cursor-pointer transition-all"
              style={{
                minHeight: 170,
                border: `2px dashed ${dragging ? "rgba(250,204,21,0.9)" : "rgba(255,255,255,0.10)"}`,
                background: dragging ? "rgba(250,204,21,0.04)" : "rgba(255,255,255,0.015)",
              }}
            >
              {preview ? (
                <>
                  <img src={preview} alt="preview" className="w-24 h-24 rounded-full object-cover border-2 border-yellow-400/40 shadow-lg" />
                  <p className="text-xs text-white/35">Click or drag to replace</p>
                </>
              ) : (
                <>
                  <div className="w-14 h-14 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center">
                    <ImagePlus className="w-6 h-6 text-white/25" />
                  </div>
                  <div className="text-center">
                    <p className="text-sm font-bold text-white/60">{dragging ? "Drop it!" : "Drag & drop here"}</p>
                    <p className="text-xs text-white/25 mt-1">or click to browse  ·  JPG PNG WebP  ·  max 5 MB</p>
                  </div>
                </>
              )}
              <input ref={fileRef} type="file" accept="image/*" className="hidden"
                onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }} />
            </div>
          )}

          {/* URL zone */}
          {tab === "url" && (
            <div className="space-y-3">
              <div className="flex gap-2">
                <input
                  type="url"
                  value={urlInput}
                  onChange={(e) => { setUrlInput(e.target.value); setUrlErr(""); }}
                  onKeyDown={(e) => e.key === "Enter" && handleUrlLoad()}
                  placeholder="https://example.com/your-photo.jpg"
                  className="flex-1 bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 text-sm text-white placeholder:text-white/20 outline-none focus:border-yellow-400/40 transition-colors"
                />
                <button onClick={handleUrlLoad}
                  className="px-4 py-2.5 bg-yellow-400/10 hover:bg-yellow-400/20 border border-yellow-400/20 rounded-xl text-yellow-400 text-xs font-black transition-all">
                  Load
                </button>
              </div>
              {urlErr && (
                <div className="flex items-center gap-2 text-xs text-red-400 bg-red-400/10 rounded-xl px-3 py-2">
                  <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" /> {urlErr}
                </div>
              )}
              {preview && !urlErr && (
                <div className="flex items-center gap-3 p-3 bg-white/3 rounded-xl border border-green-400/15">
                  <img src={preview} alt="preview" className="w-14 h-14 rounded-full object-cover" />
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-bold text-green-400">Image loaded!</p>
                    <p className="text-[10px] text-white/25 truncate mt-0.5">{urlInput}</p>
                  </div>
                  <Check className="w-4 h-4 text-green-400 flex-shrink-0" />
                </div>
              )}
            </div>
          )}

          {/* GitHub status */}
          {ghStatus === "uploading" && (
            <div className="flex items-center gap-2 text-xs text-yellow-400/80 bg-yellow-400/8 rounded-xl px-3 py-2.5">
              <Github className="w-3.5 h-3.5 flex-shrink-0" />
              <Loader2 className="w-3 h-3 animate-spin flex-shrink-0" />
              Uploading to GitHub CDN…
            </div>
          )}
          {ghStatus === "done" && (
            <div className="flex items-center gap-2 text-xs text-green-400 bg-green-400/8 rounded-xl px-3 py-2.5">
              <Github className="w-3.5 h-3.5 flex-shrink-0" />
              <Check className="w-3 h-3 flex-shrink-0" />
              Saved to GitHub — loads from CDN worldwide!
            </div>
          )}
          {ghStatus === "fail" && (
            <div className="flex items-center gap-2 text-xs text-amber-400/80 bg-amber-400/8 rounded-xl px-3 py-2.5">
              <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" />
              GitHub unavailable — saved locally on this device
            </div>
          )}
        </div>

        {/* Footer actions */}
        <div className="px-5 pb-6 flex gap-2">
          {user.avatarUrl && (
            <button onClick={handleRemove}
              className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-xs font-black text-red-400 bg-red-400/8 hover:bg-red-400/15 border border-red-400/15 transition-all">
              <Trash2 className="w-3.5 h-3.5" /> Remove
            </button>
          )}
          <button
            onClick={handleSave}
            disabled={!preview || saving}
            className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-black transition-all disabled:opacity-40 disabled:cursor-not-allowed"
            style={{
              background: preview && !saving ? "linear-gradient(135deg,#FACC15,#f59e0b)" : "rgba(255,255,255,0.05)",
              color: preview && !saving ? "#000" : "rgba(255,255,255,0.3)",
            }}
          >
            {saving ? <><Loader2 className="w-4 h-4 animate-spin" /> Saving…</> : <><Check className="w-4 h-4" /> Save Photo</>}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Inline name editor ────────────────────────────────────────────────────────
function NameEditor({ name, onSave }: { name: string; onSave: (v: string) => void }) {
  const [editing, setEditing] = useState(false);
  const [value, setValue]     = useState(name);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { if (editing) setTimeout(() => inputRef.current?.focus(), 40); }, [editing]);
  useEffect(() => { setValue(name); }, [name]);

  const commit = () => {
    const t = value.trim();
    if (t && t !== name) onSave(t);
    else setValue(name);
    setEditing(false);
  };

  if (!editing) {
    return (
      <button onClick={() => setEditing(true)} className="group flex items-center gap-2">
        <span className="text-2xl md:text-3xl font-black text-white leading-tight">{name}</span>
        <Edit3 className="w-4 h-4 text-white/15 group-hover:text-yellow-400/60 transition-colors flex-shrink-0 mt-0.5" />
      </button>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <input
        ref={inputRef}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => { if (e.key === "Enter") commit(); if (e.key === "Escape") { setValue(name); setEditing(false); } }}
        maxLength={40}
        className="text-2xl md:text-3xl font-black bg-transparent border-b-2 border-yellow-400/70 text-white outline-none w-44 md:w-60 leading-tight pb-0.5"
      />
      <button onClick={commit} className="p-1.5 rounded-lg bg-yellow-400/15 hover:bg-yellow-400/25 text-yellow-400 transition-all flex-shrink-0">
        <Check className="w-3.5 h-3.5" />
      </button>
      <button onClick={() => { setValue(name); setEditing(false); }} className="p-1.5 rounded-lg bg-white/8 hover:bg-white/12 text-white/40 transition-all flex-shrink-0">
        <X className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}

// ── Stat card ─────────────────────────────────────────────────────────────────
function StatCard({ icon, label, value, color, sub }: {
  icon: React.ReactNode; label: string; value: number | string; color: string; sub?: string;
}) {
  return (
    <div
      className="relative overflow-hidden rounded-2xl p-4 sm:p-5 flex flex-col gap-2 sm:gap-3 cursor-default"
      style={{
        background:  `linear-gradient(145deg,#0e0e0e 0%,${color}0e 100%)`,
        border:      `1px solid ${color}25`,
        boxShadow:   `0 0 0 1px ${color}0a,0 6px 24px ${color}10`,
        transition:  "transform 0.2s,box-shadow 0.2s",
      }}
      onMouseEnter={(e) => {
        const el = e.currentTarget as HTMLDivElement;
        el.style.transform  = "translateY(-2px) scale(1.01)";
        el.style.boxShadow  = `0 0 0 1px ${color}35,0 12px 36px ${color}1e`;
      }}
      onMouseLeave={(e) => {
        const el = e.currentTarget as HTMLDivElement;
        el.style.transform  = "";
        el.style.boxShadow  = `0 0 0 1px ${color}0a,0 6px 24px ${color}10`;
      }}
    >
      <div className="absolute -top-6 -right-6 w-20 h-20 rounded-full pointer-events-none"
        style={{ background: `radial-gradient(circle,${color}28 0%,transparent 70%)`, filter: "blur(10px)" }} />
      <div className="absolute top-0 left-4 right-4 h-px pointer-events-none"
        style={{ background: `linear-gradient(90deg,transparent,${color}38,transparent)` }} />

      <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
        style={{ background: `${color}18`, border: `1px solid ${color}30`, boxShadow: `0 0 12px ${color}18` }}>
        <span style={{ color }}>{icon}</span>
      </div>

      <div>
        <p className="text-2xl sm:text-3xl font-black tracking-tight leading-none text-white">{value}</p>
        {sub && <p className="text-[10px] mt-0.5 font-semibold" style={{ color: `${color}75` }}>{sub}</p>}
      </div>
      <p className="text-[10px] font-bold uppercase tracking-widest" style={{ color: `${color}65` }}>{label}</p>

      <div className="absolute bottom-0 left-0 right-0 h-[2px] pointer-events-none"
        style={{ background: `linear-gradient(90deg,${color}65,${color}18,transparent)` }} />
    </div>
  );
}

// ── Genre bar ─────────────────────────────────────────────────────────────────
function GenreBar({ genre, count, max }: { genre: string; count: number; max: number }) {
  const pct = max > 0 ? Math.round((count / max) * 100) : 0;
  return (
    <div className="flex items-center gap-3">
      <span className="text-xs text-white/45 w-[72px] flex-shrink-0 text-right truncate">{genre}</span>
      <div className="flex-1 h-1.5 rounded-full bg-white/8">
        <div className="h-full rounded-full bg-yellow-400 transition-all duration-700" style={{ width: `${pct}%` }} />
      </div>
      <span className="text-xs text-white/35 w-5 text-right flex-shrink-0">{count}</span>
    </div>
  );
}

// ── History row ───────────────────────────────────────────────────────────────
function HistoryRow({ entry, idx }: { entry: WatchEntry; idx: number }) {
  return (
    <Link href={`/movie/${entry.movieId}`}>
      <div className="flex items-center gap-3 sm:gap-4 px-3 py-2.5 rounded-xl border border-white/6 hover:border-yellow-400/20 hover:bg-yellow-400/4 transition-all group cursor-pointer">
        <span className="text-xs text-white/20 w-5 text-center flex-shrink-0 hidden sm:block">{idx + 1}</span>
        <div className="relative flex-shrink-0">
          <img src={entry.posterUrl} alt={entry.movieTitle}
            className="w-9 h-12 sm:w-10 sm:h-14 object-cover rounded-lg"
            onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }} />
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-sm text-white group-hover:text-yellow-400 transition-colors truncate">{entry.movieTitle}</p>
          <p className="text-[11px] text-white/30 mt-0.5 flex items-center gap-1">
            <Clock className="w-2.5 h-2.5" /> {timeAgo(entry.watchedAt)}
          </p>
        </div>
        <ChevronRight className="w-4 h-4 text-white/15 group-hover:text-yellow-400/50 transition-colors flex-shrink-0" />
      </div>
    </Link>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────
type Tab = "overview" | "history" | "saved" | "liked";

export default function ProfilePage() {
  const [user, setUser]                 = useState<AuthUser | null>(getCurrentUser());
  const [, navigate]                    = useLocation();
  const [activeTab, setActiveTab]       = useState<Tab>("overview");
  const [movies, setMovies]             = useState<Movie[]>([]);
  const [watchHistory, setWatchHistory] = useState<WatchEntry[]>([]);
  const [bookmarkIds, setBookmarkIds]   = useState<string[]>([]);
  const [likedIds, setLikedIds]         = useState<string[]>([]);
  const [uploadOpen, setUploadOpen]     = useState(false);
  const [savedToast, setSavedToast]     = useState<string | null>(null);

  useEffect(() => {
    if (!user) { navigate("/login"); return; }
    setWatchHistory(getWatchHistory());
    setBookmarkIds(getBookmarks());
    setLikedIds(getLikedMovieIds());
    api.getMovies().then((d) => setMovies(d.movies)).catch(() => setMovies(DEMO_MOVIES));
  }, []);

  const bookmarkedMovies = useMemo(() => movies.filter((m) => bookmarkIds.includes(m.id)), [movies, bookmarkIds]);
  const likedMovies      = useMemo(() => movies.filter((m) => likedIds.includes(m.id)), [movies, likedIds]);

  const genreStats = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const e of watchHistory) {
      const movie = movies.find((m) => m.id === e.movieId);
      if (!movie) continue;
      for (const g of movie.genre.split(",").map((g) => g.trim()).filter(Boolean)) {
        counts[g] = (counts[g] || 0) + 1;
      }
    }
    return Object.entries(counts).sort(([, a], [, b]) => b - a).slice(0, 6);
  }, [watchHistory, movies]);

  const memberDays = user ? daysSince(user.created_at) : 0;

  const toast = (msg: string) => {
    setSavedToast(msg);
    setTimeout(() => setSavedToast(null), 2800);
  };

  const handleNameSave = (newName: string) => {
    const updated = updateUserName(newName);
    if (updated) { setUser(updated); toast("Name updated!"); }
  };

  const handleAvatarSaved = (updated: AuthUser) => {
    setUser(updated);
    setUploadOpen(false);
    toast(updated.avatarUrl ? "Profile photo saved!" : "Photo removed");
  };

  if (!user) return null;

  const tabs: { key: Tab; label: string; icon: React.ReactNode; count?: number }[] = [
    { key: "overview",  label: "Overview",  icon: <BarChart3 className="w-4 h-4" /> },
    { key: "history",   label: "History",   icon: <Clock className="w-4 h-4" />,     count: watchHistory.length },
    { key: "saved",     label: "Saved",     icon: <Bookmark className="w-4 h-4" />,  count: bookmarkIds.length },
    { key: "liked",     label: "Liked",     icon: <Heart className="w-4 h-4" />,     count: likedIds.length },
  ];

  return (
    <div className="min-h-screen bg-black text-white">
      <Navbar />

      {/* Upload modal */}
      {uploadOpen && (
        <UploadModal user={user} onClose={() => setUploadOpen(false)} onSaved={handleAvatarSaved} />
      )}

      {/* Toast */}
      {savedToast && (
        <div
          className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 flex items-center gap-2 px-5 py-2.5 rounded-2xl text-sm font-black text-black shadow-2xl"
          style={{ background: "linear-gradient(135deg,#FACC15,#f59e0b)", boxShadow: "0 8px 24px rgba(250,204,21,0.45)" }}
        >
          <Check className="w-4 h-4" /> {savedToast}
        </div>
      )}

      {/* ── Hero ── */}
      <div className="relative overflow-hidden pt-16">
        {/* BG orbs */}
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute top-8 left-1/4 w-80 h-80 rounded-full blur-3xl opacity-[0.08]"
            style={{ background: "radial-gradient(circle,#FACC15,transparent 70%)" }} />
          <div className="absolute bottom-0 right-1/3 w-60 h-60 rounded-full blur-3xl opacity-[0.05]"
            style={{ background: "radial-gradient(circle,#FACC15,transparent 70%)" }} />
        </div>

        <div className="relative max-w-5xl mx-auto px-4 pt-8 pb-6">

          {/* ── Profile header card ── */}
          <div
            className="rounded-3xl p-5 sm:p-7 mb-6"
            style={{
              background: "linear-gradient(160deg,rgba(255,255,255,0.04) 0%,rgba(255,255,255,0.01) 100%)",
              border: "1px solid rgba(255,255,255,0.08)",
              backdropFilter: "blur(12px)",
            }}
          >
            <div className="flex flex-col sm:flex-row gap-5 sm:gap-7 items-start">

              {/* Avatar */}
              <Avatar user={user} size={96} onClick={() => setUploadOpen(true)} showEditHint />

              {/* Info block */}
              <div className="flex-1 min-w-0">
                <NameEditor name={user.name} onSave={handleNameSave} />

                <p className="text-white/40 text-sm mt-1 mb-3 flex items-center gap-1.5">
                  <User className="w-3 h-3" /> {user.email}
                </p>

                {/* Badges */}
                <div className="flex flex-wrap gap-2">
                  {user.country && (
                    <span className="flex items-center gap-1.5 text-xs text-white/40 bg-white/6 border border-white/8 rounded-full px-3 py-1">
                      <MapPin className="w-3 h-3" /> {user.country}
                    </span>
                  )}
                  <span className="flex items-center gap-1.5 text-xs text-white/40 bg-white/6 border border-white/8 rounded-full px-3 py-1">
                    <Calendar className="w-3 h-3" /> Joined {formatJoined(user.created_at)}
                  </span>
                  <span className="flex items-center gap-1.5 text-xs text-white/40 bg-white/6 border border-white/8 rounded-full px-3 py-1">
                    <Sparkles className="w-3 h-3" /> {memberDays} days with MOOVIED
                  </span>
                  {user.isAdmin && (
                    <span className="flex items-center gap-1 text-xs text-yellow-400 bg-yellow-400/10 border border-yellow-400/25 rounded-full px-3 py-1 font-bold">
                      <Shield className="w-3 h-3" /> Admin
                    </span>
                  )}
                </div>
              </div>

              {/* Actions — desktop: beside info; mobile: below */}
              <div className="flex flex-row sm:flex-col gap-2 flex-wrap sm:flex-nowrap flex-shrink-0 w-full sm:w-auto mt-1 sm:mt-0">
                <button
                  onClick={() => setUploadOpen(true)}
                  className="flex items-center gap-2 text-xs font-black text-white/60 bg-white/5 hover:bg-white/10 border border-white/10 px-4 py-2.5 rounded-xl transition-all"
                >
                  <Camera className="w-3.5 h-3.5" /> Change Photo
                </button>
                {user.isAdmin && (
                  <Link href="/admin">
                    <button className="flex items-center gap-2 text-xs font-black text-yellow-400 bg-yellow-400/10 hover:bg-yellow-400/18 border border-yellow-400/25 px-4 py-2.5 rounded-xl transition-all w-full sm:w-auto justify-center sm:justify-start">
                      <Shield className="w-3.5 h-3.5" /> Admin Panel
                    </button>
                  </Link>
                )}
                <button
                  onClick={() => { logout(); navigate("/"); }}
                  className="flex items-center gap-2 text-xs font-black text-red-400 bg-red-500/8 hover:bg-red-500/14 border border-red-500/18 px-4 py-2.5 rounded-xl transition-all"
                >
                  <LogOut className="w-3.5 h-3.5" /> Sign Out
                </button>
              </div>
            </div>

            {/* Stats grid */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-5 sm:mt-6">
              <StatCard icon={<Film className="w-4 h-4" />}     label="Movies Watched" value={watchHistory.length} color="#FACC15" sub="All time" />
              <StatCard icon={<Bookmark className="w-4 h-4" />}  label="Saved"          value={bookmarkIds.length}  color="#60a5fa" sub="In watchlist" />
              <StatCard icon={<Heart className="w-4 h-4" />}     label="Liked"          value={likedIds.length}     color="#f87171" sub="Favorites" />
              <StatCard icon={<Star className="w-4 h-4" />}      label="Days Active"    value={memberDays}          color="#34d399" sub="Member streak" />
            </div>
          </div>

          {/* ── Tab Bar ── */}
          <div
            className="sticky top-0 z-30 -mx-4 px-4 py-0"
            style={{ background: "rgba(0,0,0,0.96)", backdropFilter: "blur(20px)", borderBottom: "1px solid rgba(255,255,255,0.07)" }}
          >
            <div className="max-w-5xl mx-auto flex gap-0 overflow-x-auto" style={{ scrollbarWidth: "none" }}>
              {tabs.map((t) => (
                <button
                  key={t.key}
                  onClick={() => setActiveTab(t.key)}
                  className={`flex items-center gap-2 px-4 sm:px-5 py-4 text-xs sm:text-sm font-black border-b-2 transition-all whitespace-nowrap ${
                    activeTab === t.key
                      ? "border-yellow-400 text-yellow-400"
                      : "border-transparent text-white/35 hover:text-white/65"
                  }`}
                >
                  {t.icon}
                  <span className="hidden xs:inline sm:inline">{t.label}</span>
                  {t.count !== undefined && (
                    <span className={`text-[10px] rounded-full px-1.5 py-0.5 font-bold ${
                      activeTab === t.key ? "bg-yellow-400/15 text-yellow-400" : "bg-white/8 text-white/25"
                    }`}>{t.count}</span>
                  )}
                </button>
              ))}
            </div>
          </div>

          {/* ── Tab content ── */}
          <div className="pt-6">

            {/* Overview */}
            {activeTab === "overview" && (
              <div className="space-y-7">
                {/* Recent activity */}
                <section>
                  <div className="flex items-center gap-2 mb-4">
                    <Activity className="w-4 h-4 text-yellow-400" />
                    <h2 className="font-black text-sm sm:text-base tracking-wide">Recent Activity</h2>
                  </div>
                  {watchHistory.length === 0 ? (
                    <EmptyState icon={<Film className="w-10 h-10 text-white/12" />} text="No activity yet — start watching!" action={{ label: "Browse Movies", href: "/movies" }} />
                  ) : (
                    <div className="space-y-2">
                      {watchHistory.slice(0, 6).map((e, i) => <HistoryRow key={`${e.movieId}-${i}`} entry={e} idx={i} />)}
                      {watchHistory.length > 6 && (
                        <button onClick={() => setActiveTab("history")}
                          className="w-full text-xs text-white/25 hover:text-yellow-400 py-3 transition-colors">
                          View all {watchHistory.length} watched →
                        </button>
                      )}
                    </div>
                  )}
                </section>

                {/* Genre + Summary */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                  <section className="rounded-2xl border border-white/8 p-5" style={{ background: "rgba(255,255,255,0.025)" }}>
                    <div className="flex items-center gap-2 mb-5">
                      <BarChart3 className="w-4 h-4 text-yellow-400" />
                      <h3 className="font-black text-sm">Favorite Genres</h3>
                    </div>
                    {genreStats.length === 0 ? (
                      <p className="text-xs text-white/20 text-center py-8">Watch movies to see your breakdown</p>
                    ) : (
                      <div className="space-y-3">
                        {genreStats.map(([g, c]) => <GenreBar key={g} genre={g} count={c} max={genreStats[0][1]} />)}
                      </div>
                    )}
                  </section>

                  <section className="rounded-2xl border border-white/8 p-5 flex flex-col gap-4" style={{ background: "rgba(255,255,255,0.025)" }}>
                    <div className="flex items-center gap-2">
                      <TrendingUp className="w-4 h-4 text-yellow-400" />
                      <h3 className="font-black text-sm">Your Summary</h3>
                    </div>
                    <div className="space-y-3">
                      {[
                        { label: "Movies watched",  value: watchHistory.length, icon: <Play className="w-3 h-3" />,      color: "#FACC15" },
                        { label: "Movies saved",     value: bookmarkIds.length,  icon: <Bookmark className="w-3 h-3" />, color: "#60a5fa" },
                        { label: "Movies liked",     value: likedIds.length,     icon: <Heart className="w-3 h-3" />,   color: "#f87171" },
                        { label: "Genres explored",  value: genreStats.length,   icon: <Star className="w-3 h-3" />,     color: "#34d399" },
                      ].map(({ label, value, icon, color }) => (
                        <div key={label} className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <span style={{ color }} className="opacity-70">{icon}</span>
                            <span className="text-xs text-white/40">{label}</span>
                          </div>
                          <span className="text-sm font-black" style={{ color }}>{value}</span>
                        </div>
                      ))}
                    </div>
                    {/* Membership bar */}
                    <div className="pt-2 border-t border-white/6">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-xs text-white/25">Membership progress</span>
                        <span className="text-xs font-black text-yellow-400">{memberDays}d</span>
                      </div>
                      <div className="h-1.5 rounded-full bg-white/8">
                        <div className="h-full rounded-full bg-yellow-400 transition-all" style={{ width: `${Math.min(100, (memberDays / 365) * 100)}%` }} />
                      </div>
                      <p className="text-[10px] text-white/20 mt-1.5 text-right">
                        {365 - Math.min(365, memberDays) > 0 ? `${365 - Math.min(365, memberDays)} days to 1 year` : "1+ year member 🎉"}
                      </p>
                    </div>
                  </section>
                </div>

                {/* Saved preview */}
                {bookmarkedMovies.length > 0 && (
                  <section>
                    <div className="flex items-center justify-between mb-4">
                      <div className="flex items-center gap-2">
                        <Bookmark className="w-4 h-4 text-blue-400" />
                        <h2 className="font-black text-sm sm:text-base">Saved Movies</h2>
                      </div>
                      <button onClick={() => setActiveTab("saved")}
                        className="text-xs text-white/25 hover:text-yellow-400 transition-colors flex items-center gap-1">
                        View all <ChevronRight className="w-3 h-3" />
                      </button>
                    </div>
                    <div className="grid grid-cols-3 sm:grid-cols-5 gap-3">
                      {bookmarkedMovies.slice(0, 5).map((m) => (
                        <MovieCard key={m.id} movie={m} onBookmarkChange={() => setBookmarkIds(getBookmarks())} />
                      ))}
                    </div>
                  </section>
                )}
              </div>
            )}

            {/* History */}
            {activeTab === "history" && (
              <div>
                <SectionHeader icon={<Clock className="w-4 h-4 text-yellow-400" />} label="Watch History" count={watchHistory.length} />
                {watchHistory.length === 0 ? (
                  <EmptyState icon={<Film className="w-12 h-12 text-white/12" />} text="No watch history yet" action={{ label: "Browse Movies", href: "/movies" }} />
                ) : (
                  <div className="space-y-2">
                    {watchHistory.map((e, i) => <HistoryRow key={`${e.movieId}-${i}`} entry={e} idx={i} />)}
                  </div>
                )}
              </div>
            )}

            {/* Saved */}
            {activeTab === "saved" && (
              <div>
                <SectionHeader icon={<Bookmark className="w-4 h-4 text-blue-400" />} label="Saved Movies" count={bookmarkedMovies.length} />
                {bookmarkedMovies.length === 0 ? (
                  <EmptyState icon={<Bookmark className="w-12 h-12 text-white/12" />} text="No saved movies yet" action={{ label: "Browse Movies", href: "/movies" }} />
                ) : (
                  <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-3">
                    {bookmarkedMovies.map((m) => (
                      <MovieCard key={m.id} movie={m} onBookmarkChange={() => setBookmarkIds(getBookmarks())} />
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Liked */}
            {activeTab === "liked" && (
              <div>
                <SectionHeader icon={<Heart className="w-4 h-4 text-red-400" />} label="Liked Movies" count={likedMovies.length} />
                {likedMovies.length === 0 ? (
                  <EmptyState icon={<Heart className="w-12 h-12 text-white/12" />} text="No liked movies yet" action={{ label: "Browse Movies", href: "/movies" }} />
                ) : (
                  <div className="space-y-2">
                    {likedMovies.map((movie) => (
                      <Link key={movie.id} href={`/movie/${movie.id}`}>
                        <div className="flex items-center gap-3 sm:gap-4 px-3 py-2.5 rounded-xl border border-white/6 hover:border-red-400/20 hover:bg-red-400/4 transition-all group cursor-pointer">
                          <img src={movie.poster_url} alt={movie.title}
                            className="w-9 h-12 sm:w-10 sm:h-14 object-cover rounded-lg flex-shrink-0"
                            onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }} />
                          <div className="flex-1 min-w-0">
                            <p className="font-semibold text-sm text-white group-hover:text-red-400 transition-colors truncate">{movie.title}</p>
                            <div className="flex items-center gap-2 mt-0.5">
                              <span className="text-[11px] text-white/28">{movie.genre}</span>
                              {movie.year && <span className="text-[11px] text-white/18">{movie.year}</span>}
                            </div>
                          </div>
                          <div className="flex items-center gap-1.5 flex-shrink-0">
                            <Heart className="w-3.5 h-3.5 text-red-400 fill-red-400" />
                            {movie.rating && <span className="text-[11px] text-white/28 ml-1">{movie.rating}</span>}
                          </div>
                        </div>
                      </Link>
                    ))}
                  </div>
                )}
              </div>
            )}

          </div>
        </div>
      </div>
    </div>
  );
}

// ── Tiny helpers ──────────────────────────────────────────────────────────────
function SectionHeader({ icon, label, count }: { icon: React.ReactNode; label: string; count: number }) {
  return (
    <div className="flex items-center gap-2 mb-5">
      {icon}
      <h2 className="font-black text-sm sm:text-base tracking-wide">{label}</h2>
      <span className="text-xs text-white/25 bg-white/6 border border-white/8 rounded-full px-2 py-0.5">{count}</span>
    </div>
  );
}

function EmptyState({ icon, text, action }: {
  icon: React.ReactNode;
  text: string;
  action?: { label: string; href: string };
}) {
  return (
    <div className="flex flex-col items-center justify-center py-16 sm:py-20 rounded-2xl border border-white/6"
      style={{ background: "rgba(255,255,255,0.018)" }}>
      {icon}
      <p className="text-sm text-white/25 mt-3 mb-3">{text}</p>
      {action && (
        <Link href={action.href}>
          <button className="text-xs text-yellow-400 hover:underline">{action.label}</button>
        </Link>
      )}
    </div>
  );
}
