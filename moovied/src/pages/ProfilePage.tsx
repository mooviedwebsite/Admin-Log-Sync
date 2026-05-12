import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { useLocation, Link } from "wouter";
import {
  Bookmark, Clock, LogOut, Film, Heart, Star,
  TrendingUp, Calendar, MapPin, Shield, ChevronRight,
  Play, BarChart3, Activity, Camera, Upload, Link2,
  Check, X, Edit3, Trash2, ImagePlus, Github,
  AlertCircle, Loader2,
} from "lucide-react";
import Navbar from "@/components/Navbar";
import MovieCard from "@/components/MovieCard";
import { api, DEMO_MOVIES, type Movie } from "@/lib/api";
import {
  getCurrentUser, logout, getBookmarks, getWatchHistory, type WatchEntry,
  updateUserName, updateUserAvatar, removeUserAvatar, type AuthUser,
} from "@/lib/auth";

// ── Helpers ──────────────────────────────────────────────────────────────────
function daysSince(dateStr: string): number {
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return 0;
  return Math.floor((Date.now() - d.getTime()) / (1000 * 60 * 60 * 24));
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
  try {
    return new Date(dateStr).toLocaleDateString("en-US", { year: "numeric", month: "long" });
  } catch { return ""; }
}

function getLikedMovieIds(): string[] {
  try {
    const raw = localStorage.getItem("moovied_user_liked") || "{}";
    const map: Record<string, boolean> = JSON.parse(raw);
    return Object.entries(map).filter(([, v]) => v).map(([k]) => k);
  } catch { return []; }
}

// ── Avatar Upload Modal ───────────────────────────────────────────────────────
type UploadTab = "upload" | "url";

interface AvatarModalProps {
  user: AuthUser;
  onClose: () => void;
  onSaved: (url: string) => void;
}

function AvatarModal({ user, onClose, onSaved }: AvatarModalProps) {
  const [tab, setTab] = useState<UploadTab>("upload");
  const [isDragging, setIsDragging] = useState(false);
  const [preview, setPreview] = useState<string | null>(user.avatarUrl || null);
  const [urlInput, setUrlInput] = useState("");
  const [urlError, setUrlError] = useState("");
  const [saving, setSaving] = useState(false);
  const [githubStatus, setGithubStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [githubToken, setGithubToken] = useState(localStorage.getItem("moovied_gh_token") || "");
  const [githubRepo, setGithubRepo] = useState(localStorage.getItem("moovied_gh_repo") || "");
  const [showGithubConfig, setShowGithubConfig] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const dropRef = useRef<HTMLDivElement>(null);

  const handleFile = useCallback((file: File) => {
    if (!file.type.startsWith("image/")) return;
    if (file.size > 5 * 1024 * 1024) {
      alert("Image must be under 5MB");
      return;
    }
    const reader = new FileReader();
    reader.onload = (e) => {
      const result = e.target?.result as string;
      // Resize to max 400x400 for storage efficiency
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement("canvas");
        const max = 400;
        let w = img.width, h = img.height;
        if (w > max || h > max) {
          if (w > h) { h = Math.round(h * max / w); w = max; }
          else { w = Math.round(w * max / h); h = max; }
        }
        canvas.width = w; canvas.height = h;
        canvas.getContext("2d")!.drawImage(img, 0, 0, w, h);
        setPreview(canvas.toDataURL("image/jpeg", 0.85));
      };
      img.src = result;
    };
    reader.readAsDataURL(file);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  }, [handleFile]);

  const handleUrlLoad = () => {
    setUrlError("");
    if (!urlInput.trim()) { setUrlError("Please enter a URL"); return; }
    const url = urlInput.trim();
    // Quick validation
    if (!url.startsWith("http")) { setUrlError("URL must start with http:// or https://"); return; }
    // Test if image loads
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => setPreview(url);
    img.onerror = () => setUrlError("Could not load image from this URL");
    img.src = url;
  };

  // Save avatar to GitHub as a file in /data/avatars/
  const saveToGitHub = async (dataUrl: string): Promise<string> => {
    if (!githubToken || !githubRepo) throw new Error("GitHub not configured");
    const [owner, repo] = githubRepo.split("/");
    const fileName = `avatars/${user.id || user.email.replace(/[^a-z0-9]/gi, "_")}.jpg`;
    const apiUrl = `https://api.github.com/repos/${owner}/${repo}/contents/data/${fileName}`;

    // Check if file exists to get SHA
    let sha: string | undefined;
    try {
      const check = await fetch(apiUrl, {
        headers: { Authorization: `Bearer ${githubToken}`, Accept: "application/vnd.github+json" },
      });
      if (check.ok) { const j = await check.json(); sha = j.sha; }
    } catch { /* new file */ }

    // base64 strip data URL prefix
    const base64 = dataUrl.startsWith("data:") ? dataUrl.split(",")[1] : dataUrl;

    const body: Record<string, string> = {
      message: `chore: update avatar for ${user.name}`,
      content: base64,
    };
    if (sha) body.sha = sha;

    const res = await fetch(apiUrl, {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${githubToken}`,
        Accept: "application/vnd.github+json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error((err as { message?: string }).message || `GitHub API ${res.status}`);
    }

    const data = await res.json();
    // Return the raw GitHub CDN URL
    return data.content.download_url as string;
  };

  const handleSave = async () => {
    if (!preview) return;
    setSaving(true);

    try {
      let finalUrl = preview;

      // If it's a base64 and GitHub is configured, upload there
      if (preview.startsWith("data:") && githubToken && githubRepo) {
        setGithubStatus("saving");
        try {
          finalUrl = await saveToGitHub(preview);
          setGithubStatus("saved");
          localStorage.setItem("moovied_gh_token", githubToken);
          localStorage.setItem("moovied_gh_repo", githubRepo);
        } catch (e) {
          console.warn("GitHub upload failed, using base64 locally:", e);
          setGithubStatus("error");
          // Fall back to base64 stored in localStorage
          finalUrl = preview;
        }
      } else if (!preview.startsWith("data:") && githubToken && githubRepo) {
        // It's a URL — still save config
        localStorage.setItem("moovied_gh_token", githubToken);
        localStorage.setItem("moovied_gh_repo", githubRepo);
      }

      updateUserAvatar(finalUrl);
      onSaved(finalUrl);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center p-4"
      style={{ background: "rgba(0,0,0,0.85)", backdropFilter: "blur(12px)" }}
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        className="w-full max-w-md rounded-3xl overflow-hidden"
        style={{
          background: "linear-gradient(160deg, #111 0%, #0a0a0a 100%)",
          border: "1px solid rgba(250,204,21,0.15)",
          boxShadow: "0 40px 80px rgba(0,0,0,0.8), 0 0 0 1px rgba(250,204,21,0.05)",
        }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-5 border-b border-white/8">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-yellow-400/10 border border-yellow-400/20 flex items-center justify-center">
              <Camera className="w-4 h-4 text-yellow-400" />
            </div>
            <div>
              <h2 className="font-black text-sm text-white">Update Profile Picture</h2>
              <p className="text-xs text-white/35">Choose how to add your photo</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 rounded-xl hover:bg-white/8 text-white/40 hover:text-white transition-all">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Tab Switcher */}
        <div className="px-6 pt-5 flex gap-2">
          {(["upload", "url"] as UploadTab[]).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold transition-all ${
                tab === t
                  ? "bg-yellow-400 text-black"
                  : "bg-white/5 text-white/40 hover:text-white hover:bg-white/10"
              }`}
            >
              {t === "upload" ? <Upload className="w-3.5 h-3.5" /> : <Link2 className="w-3.5 h-3.5" />}
              {t === "upload" ? "Upload File" : "Paste URL"}
            </button>
          ))}
        </div>

        <div className="px-6 py-5 space-y-4">
          {/* Upload Zone */}
          {tab === "upload" && (
            <div
              ref={dropRef}
              onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
              onDragLeave={() => setIsDragging(false)}
              onDrop={handleDrop}
              onClick={() => fileRef.current?.click()}
              className="relative flex flex-col items-center justify-center gap-3 rounded-2xl cursor-pointer transition-all"
              style={{
                minHeight: 180,
                border: `2px dashed ${isDragging ? "rgba(250,204,21,0.8)" : "rgba(255,255,255,0.12)"}`,
                background: isDragging
                  ? "rgba(250,204,21,0.05)"
                  : preview
                  ? "transparent"
                  : "rgba(255,255,255,0.02)",
              }}
            >
              {preview ? (
                <>
                  <img
                    src={preview}
                    alt="Preview"
                    className="w-28 h-28 rounded-full object-cover border-2 border-yellow-400/40"
                  />
                  <p className="text-xs text-white/40">Click to change</p>
                </>
              ) : (
                <>
                  <div className="w-16 h-16 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center">
                    <ImagePlus className="w-7 h-7 text-white/30" />
                  </div>
                  <div className="text-center">
                    <p className="text-sm font-bold text-white/70">
                      {isDragging ? "Drop it!" : "Drag & drop or click"}
                    </p>
                    <p className="text-xs text-white/30 mt-1">JPG, PNG, WebP — max 5MB</p>
                  </div>
                </>
              )}
              <input
                ref={fileRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }}
              />
            </div>
          )}

          {/* URL Zone */}
          {tab === "url" && (
            <div className="space-y-3">
              <div className="flex gap-2">
                <input
                  type="url"
                  value={urlInput}
                  onChange={(e) => { setUrlInput(e.target.value); setUrlError(""); }}
                  onKeyDown={(e) => e.key === "Enter" && handleUrlLoad()}
                  placeholder="https://example.com/photo.jpg"
                  className="flex-1 bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white placeholder:text-white/25 outline-none focus:border-yellow-400/40 transition-colors"
                />
                <button
                  onClick={handleUrlLoad}
                  className="px-4 py-2.5 bg-yellow-400/10 hover:bg-yellow-400/20 border border-yellow-400/20 rounded-xl text-yellow-400 text-sm font-bold transition-all"
                >
                  Load
                </button>
              </div>
              {urlError && (
                <div className="flex items-center gap-2 text-xs text-red-400 bg-red-400/10 rounded-xl px-3 py-2">
                  <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" /> {urlError}
                </div>
              )}
              {preview && (
                <div className="flex items-center gap-4 p-3 bg-white/3 rounded-xl border border-white/8">
                  <img src={preview} alt="Preview" className="w-16 h-16 rounded-full object-cover border border-white/15" />
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-bold text-white/70">Preview looks good!</p>
                    <p className="text-xs text-white/30 truncate mt-0.5">{urlInput}</p>
                  </div>
                  <Check className="w-4 h-4 text-green-400 flex-shrink-0" />
                </div>
              )}
            </div>
          )}

          {/* GitHub Config */}
          <div className="rounded-xl border border-white/8 overflow-hidden">
            <button
              onClick={() => setShowGithubConfig((v) => !v)}
              className="flex items-center justify-between w-full px-4 py-3 hover:bg-white/4 transition-colors"
            >
              <div className="flex items-center gap-2.5">
                <Github className="w-4 h-4 text-white/50" />
                <span className="text-sm font-bold text-white/60">Save to GitHub</span>
                {githubToken && githubRepo && (
                  <span className="text-xs bg-green-400/10 text-green-400 border border-green-400/20 rounded-full px-2 py-0.5">
                    Configured
                  </span>
                )}
              </div>
              <ChevronRight className={`w-4 h-4 text-white/30 transition-transform ${showGithubConfig ? "rotate-90" : ""}`} />
            </button>

            {showGithubConfig && (
              <div className="px-4 pb-4 space-y-3 border-t border-white/6">
                <p className="text-xs text-white/35 pt-3">
                  Optional: upload your photo directly to your GitHub repository so it persists across devices.
                </p>
                <div className="space-y-2">
                  <input
                    type="text"
                    value={githubRepo}
                    onChange={(e) => setGithubRepo(e.target.value)}
                    placeholder="owner/repository"
                    className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-xs text-white placeholder:text-white/25 outline-none focus:border-yellow-400/40 transition-colors"
                  />
                  <input
                    type="password"
                    value={githubToken}
                    onChange={(e) => setGithubToken(e.target.value)}
                    placeholder="GitHub Personal Access Token"
                    className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-xs text-white placeholder:text-white/25 outline-none focus:border-yellow-400/40 transition-colors"
                  />
                  <p className="text-xs text-white/25">
                    Token needs <code className="text-yellow-400/60">contents:write</code> permission.{" "}
                    <a href="https://github.com/settings/tokens/new" target="_blank" rel="noopener noreferrer"
                      className="text-yellow-400/60 underline hover:text-yellow-400">Create token →</a>
                  </p>
                </div>
                {githubStatus === "saved" && (
                  <div className="flex items-center gap-2 text-xs text-green-400 bg-green-400/10 rounded-xl px-3 py-2">
                    <Check className="w-3.5 h-3.5" /> Saved to GitHub — image hosted on CDN!
                  </div>
                )}
                {githubStatus === "error" && (
                  <div className="flex items-center gap-2 text-xs text-amber-400 bg-amber-400/10 rounded-xl px-3 py-2">
                    <AlertCircle className="w-3.5 h-3.5" /> GitHub upload failed — saved locally instead
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 pb-6 flex gap-3">
          {user.avatarUrl && (
            <button
              onClick={() => { removeUserAvatar(); onSaved(""); }}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold text-red-400 bg-red-400/8 hover:bg-red-400/15 border border-red-400/15 transition-all"
            >
              <Trash2 className="w-3.5 h-3.5" /> Remove
            </button>
          )}
          <button
            onClick={handleSave}
            disabled={!preview || saving}
            className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-black transition-all disabled:opacity-40 disabled:cursor-not-allowed"
            style={{
              background: preview && !saving ? "linear-gradient(135deg, #FACC15, #f59e0b)" : undefined,
              backgroundColor: (!preview || saving) ? "rgba(255,255,255,0.05)" : undefined,
              color: preview && !saving ? "#000" : "rgba(255,255,255,0.3)",
            }}
          >
            {saving ? (
              <><Loader2 className="w-4 h-4 animate-spin" /> Saving…</>
            ) : githubStatus === "saving" ? (
              <><Github className="w-4 h-4" /> Uploading to GitHub…</>
            ) : (
              <><Check className="w-4 h-4" /> Save Photo</>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Name Edit Inline ──────────────────────────────────────────────────────────
interface NameEditorProps {
  name: string;
  onSave: (newName: string) => void;
}

function NameEditor({ name, onSave }: NameEditorProps) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(name);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing) setTimeout(() => inputRef.current?.focus(), 50);
  }, [editing]);

  const commit = () => {
    const trimmed = value.trim();
    if (!trimmed || trimmed === name) { setValue(name); setEditing(false); return; }
    onSave(trimmed);
    setEditing(false);
  };

  if (!editing) {
    return (
      <button
        onClick={() => setEditing(true)}
        className="group flex items-center gap-2 hover:gap-3 transition-all"
      >
        <span className="text-2xl sm:text-3xl font-black text-white">{name}</span>
        <Edit3 className="w-4 h-4 text-white/20 group-hover:text-yellow-400/60 transition-colors flex-shrink-0" />
      </button>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <input
        ref={inputRef}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") commit();
          if (e.key === "Escape") { setValue(name); setEditing(false); }
        }}
        maxLength={40}
        className="text-2xl sm:text-3xl font-black bg-transparent border-b-2 border-yellow-400/60 text-white outline-none w-48 sm:w-64"
      />
      <button onClick={commit} className="p-1.5 rounded-lg bg-yellow-400/15 hover:bg-yellow-400/25 text-yellow-400 transition-all">
        <Check className="w-4 h-4" />
      </button>
      <button onClick={() => { setValue(name); setEditing(false); }} className="p-1.5 rounded-lg bg-white/8 hover:bg-white/15 text-white/40 transition-all">
        <X className="w-4 h-4" />
      </button>
    </div>
  );
}

// ── Avatar Component ──────────────────────────────────────────────────────────
interface UserAvatarProps {
  user: AuthUser;
  size?: "sm" | "md" | "lg";
  onClick?: () => void;
}

export function UserAvatar({ user, size = "md", onClick }: UserAvatarProps) {
  const sizeMap = {
    sm: "w-8 h-8 text-sm",
    md: "w-10 h-10 text-base",
    lg: "w-24 h-24 text-4xl",
  };

  if (user.avatarUrl) {
    return (
      <div
        className={`${sizeMap[size]} rounded-full overflow-hidden flex-shrink-0 ${onClick ? "cursor-pointer" : ""}`}
        onClick={onClick}
      >
        <img
          src={user.avatarUrl}
          alt={user.name}
          className="w-full h-full object-cover"
          onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }}
        />
      </div>
    );
  }

  const initial = user.name[0]?.toUpperCase() || "?";
  return (
    <div
      className={`${sizeMap[size]} rounded-full bg-yellow-400 flex items-center justify-center flex-shrink-0 font-black text-black ${onClick ? "cursor-pointer" : ""}`}
      onClick={onClick}
    >
      {initial}
    </div>
  );
}

// ── Stat Card ────────────────────────────────────────────────────────────────
function StatCard({ icon, label, value, color, sub }: {
  icon: React.ReactNode; label: string; value: number | string; color: string; sub?: string;
}) {
  return (
    <div
      className="relative flex-1 min-w-[140px] overflow-hidden rounded-2xl p-5 flex flex-col gap-3 cursor-default group"
      style={{
        background: `linear-gradient(145deg, #0e0e0e 0%, ${color}0d 100%)`,
        border: `1px solid ${color}28`,
        boxShadow: `0 0 0 1px ${color}0a, 0 8px 32px ${color}12`,
        transition: "transform 0.2s ease, box-shadow 0.2s ease",
      }}
      onMouseEnter={(e) => {
        const el = e.currentTarget as HTMLDivElement;
        el.style.transform = "translateY(-2px) scale(1.015)";
        el.style.boxShadow = `0 0 0 1px ${color}40, 0 12px 40px ${color}22`;
      }}
      onMouseLeave={(e) => {
        const el = e.currentTarget as HTMLDivElement;
        el.style.transform = "";
        el.style.boxShadow = `0 0 0 1px ${color}0a, 0 8px 32px ${color}12`;
      }}
    >
      <div className="absolute -top-8 -right-8 w-24 h-24 rounded-full pointer-events-none"
        style={{ background: `radial-gradient(circle, ${color}30 0%, transparent 70%)`, filter: "blur(12px)" }} />
      <div className="absolute top-0 left-4 right-4 h-px pointer-events-none"
        style={{ background: `linear-gradient(90deg, transparent, ${color}40, transparent)` }} />
      <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
        style={{ background: `linear-gradient(135deg, ${color}20, ${color}0a)`, border: `1px solid ${color}35`, boxShadow: `0 0 14px ${color}20` }}>
        <span style={{ color, filter: `drop-shadow(0 0 4px ${color}60)` }}>{icon}</span>
      </div>
      <div>
        <p className="text-3xl sm:text-4xl font-black tracking-tight leading-none"
          style={{ color: "#fff", textShadow: `0 0 20px ${color}30` }}>{value}</p>
        {sub && <p className="text-xs mt-1 font-medium" style={{ color: `${color}80` }}>{sub}</p>}
      </div>
      <p className="text-xs font-bold uppercase tracking-widest" style={{ color: `${color}70` }}>{label}</p>
      <div className="absolute bottom-0 left-0 right-0 h-[2px] pointer-events-none"
        style={{ background: `linear-gradient(90deg, ${color}70, ${color}20, transparent)` }} />
    </div>
  );
}

// ── Genre Bar ──────────────────────────────────────────────────────────────────
function GenreBar({ genre, count, max }: { genre: string; count: number; max: number }) {
  const pct = max > 0 ? Math.round((count / max) * 100) : 0;
  return (
    <div className="flex items-center gap-3">
      <span className="text-xs text-white/50 w-20 flex-shrink-0 text-right truncate">{genre}</span>
      <div className="flex-1 h-1.5 rounded-full bg-white/8">
        <div className="h-full rounded-full bg-yellow-400 transition-all duration-700" style={{ width: `${pct}%` }} />
      </div>
      <span className="text-xs text-white/40 w-6 text-right flex-shrink-0">{count}</span>
    </div>
  );
}

// ── Watch History Row ─────────────────────────────────────────────────────────
function HistoryRow({ entry, idx }: { entry: WatchEntry; idx: number }) {
  return (
    <Link href={`/movie/${entry.movieId}`}>
      <div className="flex items-center gap-4 p-3 rounded-xl border border-white/6 hover:border-yellow-400/20 hover:bg-yellow-400/4 transition-all group cursor-pointer">
        <span className="text-xs text-white/25 w-5 text-center flex-shrink-0">{idx + 1}</span>
        <div className="relative flex-shrink-0">
          <img src={entry.posterUrl} alt={entry.movieTitle}
            className="w-10 h-14 object-cover rounded-lg"
            onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }} />
          <div className="absolute inset-0 rounded-lg bg-black/20 group-hover:bg-black/0 transition-all" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-sm text-white group-hover:text-yellow-400 transition-colors truncate">{entry.movieTitle}</p>
          <p className="text-xs text-white/35 mt-0.5 flex items-center gap-1">
            <Clock className="w-3 h-3" /> {timeAgo(entry.watchedAt)}
          </p>
        </div>
        <ChevronRight className="w-4 h-4 text-white/20 group-hover:text-yellow-400/60 transition-colors flex-shrink-0" />
      </div>
    </Link>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────
type Tab = "overview" | "history" | "saved" | "liked";

export default function ProfilePage() {
  const [user, setUser] = useState<AuthUser | null>(getCurrentUser());
  const [, navigate] = useLocation();
  const [activeTab, setActiveTab] = useState<Tab>("overview");
  const [movies, setMovies] = useState<Movie[]>([]);
  const [watchHistory, setWatchHistory] = useState<WatchEntry[]>([]);
  const [bookmarkIds, setBookmarkIds] = useState<string[]>([]);
  const [likedIds, setLikedIds] = useState<string[]>([]);
  const [avatarModalOpen, setAvatarModalOpen] = useState(false);
  const [nameSaved, setNameSaved] = useState(false);

  useEffect(() => {
    if (!user) { navigate("/login"); return; }
    setWatchHistory(getWatchHistory());
    setBookmarkIds(getBookmarks());
    setLikedIds(getLikedMovieIds());
    api.getMovies().then((d) => setMovies(d.movies)).catch(() => setMovies(DEMO_MOVIES));
  }, []);

  const bookmarkedMovies = useMemo(() => movies.filter((m) => bookmarkIds.includes(m.id)), [movies, bookmarkIds]);
  const likedMovies = useMemo(() => movies.filter((m) => likedIds.includes(m.id)), [movies, likedIds]);

  const genreStats = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const entry of watchHistory) {
      const movie = movies.find((m) => m.id === entry.movieId);
      if (!movie) continue;
      const genres = movie.genre.split(",").map((g) => g.trim()).filter(Boolean);
      for (const g of genres) { counts[g] = (counts[g] || 0) + 1; }
    }
    return Object.entries(counts).sort(([, a], [, b]) => b - a).slice(0, 6);
  }, [watchHistory, movies]);

  const memberDays = user ? daysSince(user.created_at) : 0;

  const handleLogout = () => { logout(); navigate("/"); };
  const refreshBookmarks = () => setBookmarkIds(getBookmarks());

  const handleNameSave = (newName: string) => {
    const updated = updateUserName(newName);
    if (updated) {
      setUser(updated);
      setNameSaved(true);
      setTimeout(() => setNameSaved(false), 2500);
    }
  };

  const handleAvatarSaved = (url: string) => {
    const fresh = getCurrentUser();
    if (fresh) setUser(fresh);
    setAvatarModalOpen(false);
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

      {/* Avatar Modal */}
      {avatarModalOpen && (
        <AvatarModal user={user} onClose={() => setAvatarModalOpen(false)} onSaved={handleAvatarSaved} />
      )}

      {/* Name saved toast */}
      {nameSaved && (
        <div
          className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 flex items-center gap-2 px-4 py-2.5 rounded-2xl text-sm font-bold text-black"
          style={{ background: "linear-gradient(135deg, #FACC15, #f59e0b)", boxShadow: "0 8px 24px rgba(250,204,21,0.4)" }}
        >
          <Check className="w-4 h-4" /> Name updated!
        </div>
      )}

      {/* ── Hero ─────────────────────────────────────────────────────────── */}
      <div className="relative overflow-hidden pt-16">
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute top-0 left-1/4 w-96 h-96 rounded-full blur-3xl opacity-10"
            style={{ background: "radial-gradient(circle, #FACC15 0%, transparent 70%)" }} />
          <div className="absolute bottom-0 right-1/4 w-64 h-64 rounded-full blur-3xl opacity-5"
            style={{ background: "radial-gradient(circle, #FACC15 0%, transparent 70%)" }} />
        </div>

        <div className="relative max-w-5xl mx-auto px-4 py-10">
          <div className="flex flex-col sm:flex-row gap-6 items-start sm:items-end">

            {/* Avatar — clickable to change */}
            <div className="relative flex-shrink-0 group">
              {/* Glow ring */}
              <div className="absolute -inset-1 rounded-full opacity-70 blur-sm"
                style={{ background: "conic-gradient(from 0deg, #FACC15, #000, #FACC15)" }} />

              <div className="relative w-24 h-24 rounded-full overflow-hidden border-2 border-yellow-400/60 cursor-pointer"
                onClick={() => setAvatarModalOpen(true)}
                style={{ background: "linear-gradient(135deg, #1a1a0a 0%, #2a2000 100%)" }}>
                {user.avatarUrl ? (
                  <img src={user.avatarUrl} alt={user.name} className="w-full h-full object-cover" />
                ) : (
                  <span className="w-full h-full flex items-center justify-center text-4xl font-black text-yellow-400">
                    {user.name[0]?.toUpperCase() || "?"}
                  </span>
                )}

                {/* Hover overlay */}
                <div className="absolute inset-0 bg-black/0 group-hover:bg-black/60 transition-all flex items-center justify-center">
                  <Camera className="w-6 h-6 text-white opacity-0 group-hover:opacity-100 transition-all" />
                </div>
              </div>

              {/* Online dot */}
              <div className="absolute bottom-1 right-1 w-4 h-4 rounded-full bg-green-400 border-2 border-black" />

              {/* Edit button tooltip */}
              <button
                onClick={() => setAvatarModalOpen(true)}
                className="absolute -bottom-2 left-1/2 -translate-x-1/2 flex items-center gap-1 text-xs font-bold text-black bg-yellow-400 hover:bg-yellow-300 rounded-full px-2.5 py-1 transition-all shadow-lg opacity-0 group-hover:opacity-100 whitespace-nowrap"
              >
                <Upload className="w-2.5 h-2.5" /> Change
              </button>
            </div>

            {/* Info */}
            <div className="flex-1 min-w-0">
              <div className="flex flex-wrap items-center gap-2 mb-1">
                <NameEditor name={user.name} onSave={handleNameSave} />
                {user.isAdmin && (
                  <span className="flex items-center gap-1 text-xs text-yellow-400 bg-yellow-400/10 border border-yellow-400/30 rounded-full px-2 py-0.5 font-bold">
                    <Shield className="w-3 h-3" /> Admin
                  </span>
                )}
              </div>
              <p className="text-white/45 text-sm mb-3">{user.email}</p>
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
                  <TrendingUp className="w-3 h-3" /> {memberDays} days with MOOVIED
                </span>
              </div>
            </div>

            {/* Actions */}
            <div className="flex gap-2 flex-shrink-0">
              <button
                onClick={() => setAvatarModalOpen(true)}
                className="flex items-center gap-2 text-sm font-semibold text-white/60 bg-white/5 hover:bg-white/10 border border-white/10 px-4 py-2 rounded-xl transition-all"
              >
                <Camera className="w-4 h-4" /> Photo
              </button>
              {user.isAdmin && (
                <Link href="/admin">
                  <button className="flex items-center gap-2 text-sm font-semibold text-yellow-400 bg-yellow-400/10 hover:bg-yellow-400/20 border border-yellow-400/30 px-4 py-2 rounded-xl transition-all">
                    <Shield className="w-4 h-4" /> Admin
                  </button>
                </Link>
              )}
              <button
                onClick={handleLogout}
                className="flex items-center gap-2 text-sm font-semibold text-red-400 bg-red-500/8 hover:bg-red-500/15 border border-red-500/20 px-4 py-2 rounded-xl transition-all"
              >
                <LogOut className="w-4 h-4" /> Sign Out
              </button>
            </div>
          </div>

          {/* Stats Grid */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-8">
            <StatCard icon={<Film className="w-4 h-4" />}     label="Movies Watched" value={watchHistory.length}  color="#FACC15" sub="All time" />
            <StatCard icon={<Bookmark className="w-4 h-4" />}  label="Saved"          value={bookmarkIds.length}   color="#60a5fa" sub="In watchlist" />
            <StatCard icon={<Heart className="w-4 h-4" />}     label="Liked"          value={likedIds.length}      color="#f87171" sub="Favorites" />
            <StatCard icon={<Star className="w-4 h-4" />}      label="Days Active"    value={memberDays}           color="#34d399" sub="Member streak" />
          </div>
        </div>
      </div>

      {/* ── Tab Bar ──────────────────────────────────────────────────────── */}
      <div className="sticky top-0 z-30 bg-black/95 backdrop-blur-xl border-b border-white/8">
        <div className="max-w-5xl mx-auto px-4">
          <div className="flex gap-1 overflow-x-auto" style={{ scrollbarWidth: "none" }}>
            {tabs.map((t) => (
              <button
                key={t.key}
                onClick={() => setActiveTab(t.key)}
                className={`flex items-center gap-2 px-4 py-4 text-sm font-bold border-b-2 transition-all whitespace-nowrap ${
                  activeTab === t.key
                    ? "border-yellow-400 text-yellow-400"
                    : "border-transparent text-white/40 hover:text-white/70"
                }`}
              >
                {t.icon}
                {t.label}
                {t.count !== undefined && (
                  <span className={`text-xs rounded-full px-1.5 py-0.5 ${
                    activeTab === t.key ? "bg-yellow-400/15 text-yellow-400" : "bg-white/8 text-white/30"
                  }`}>
                    {t.count}
                  </span>
                )}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* ── Tab Content ──────────────────────────────────────────────────── */}
      <main className="max-w-5xl mx-auto px-4 py-8">

        {/* ── Overview ─────────────────────────────────────────────────── */}
        {activeTab === "overview" && (
          <div className="space-y-8">
            <section>
              <div className="flex items-center gap-2 mb-4">
                <Activity className="w-4 h-4 text-yellow-400" />
                <h2 className="font-black text-base tracking-wide">Recent Activity</h2>
              </div>
              {watchHistory.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 rounded-2xl border border-white/6"
                  style={{ background: "rgba(255,255,255,0.02)" }}>
                  <Film className="w-10 h-10 text-white/15 mb-3" />
                  <p className="text-sm text-white/30">No activity yet — start watching!</p>
                  <Link href="/movies">
                    <button className="mt-3 text-xs text-yellow-400 hover:underline">Browse Movies</button>
                  </Link>
                </div>
              ) : (
                <div className="space-y-2">
                  {watchHistory.slice(0, 6).map((entry, i) => (
                    <HistoryRow key={`${entry.movieId}-${i}`} entry={entry} idx={i} />
                  ))}
                  {watchHistory.length > 6 && (
                    <button onClick={() => setActiveTab("history")}
                      className="w-full text-xs text-white/30 hover:text-yellow-400 py-3 transition-colors">
                      View all {watchHistory.length} watched movies
                    </button>
                  )}
                </div>
              )}
            </section>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
              <section className="rounded-2xl border border-white/8 p-5" style={{ background: "rgba(255,255,255,0.03)" }}>
                <div className="flex items-center gap-2 mb-5">
                  <BarChart3 className="w-4 h-4 text-yellow-400" />
                  <h3 className="font-black text-sm tracking-wide">Favorite Genres</h3>
                </div>
                {genreStats.length === 0 ? (
                  <div className="text-center py-8">
                    <p className="text-xs text-white/25">Watch movies to see your genre breakdown</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {genreStats.map(([genre, count]) => (
                      <GenreBar key={genre} genre={genre} count={count} max={genreStats[0][1]} />
                    ))}
                  </div>
                )}
              </section>

              <section className="rounded-2xl border border-white/8 p-5 flex flex-col gap-4" style={{ background: "rgba(255,255,255,0.03)" }}>
                <div className="flex items-center gap-2">
                  <TrendingUp className="w-4 h-4 text-yellow-400" />
                  <h3 className="font-black text-sm tracking-wide">Your Summary</h3>
                </div>
                <div className="space-y-3">
                  {[
                    { label: "Movies watched",   value: watchHistory.length,  icon: <Play className="w-3 h-3" />,      color: "#FACC15" },
                    { label: "Movies saved",      value: bookmarkIds.length,   icon: <Bookmark className="w-3 h-3" />, color: "#60a5fa" },
                    { label: "Movies liked",      value: likedIds.length,      icon: <Heart className="w-3 h-3" />,   color: "#f87171" },
                    { label: "Genres explored",   value: genreStats.length,    icon: <Star className="w-3 h-3" />,     color: "#34d399" },
                  ].map(({ label, value, icon, color }) => (
                    <div key={label} className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span style={{ color }} className="opacity-70">{icon}</span>
                        <span className="text-xs text-white/45">{label}</span>
                      </div>
                      <span className="text-sm font-black" style={{ color }}>{value}</span>
                    </div>
                  ))}
                </div>
                <div className="pt-2 border-t border-white/6">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs text-white/30">Membership</span>
                    <span className="text-xs font-bold text-yellow-400">{memberDays} days</span>
                  </div>
                  <div className="h-1.5 rounded-full bg-white/8">
                    <div className="h-full rounded-full bg-yellow-400"
                      style={{ width: `${Math.min(100, (memberDays / 365) * 100)}%` }} />
                  </div>
                  <p className="text-xs text-white/20 mt-1.5 text-right">
                    {365 - Math.min(365, memberDays) > 0 ? `${365 - Math.min(365, memberDays)} days to 1 year` : "1+ year member"}
                  </p>
                </div>
              </section>
            </div>

            {bookmarkedMovies.length > 0 && (
              <section>
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-2">
                    <Bookmark className="w-4 h-4 text-blue-400" />
                    <h2 className="font-black text-base tracking-wide">Saved</h2>
                  </div>
                  <button onClick={() => setActiveTab("saved")}
                    className="text-xs text-white/30 hover:text-yellow-400 transition-colors flex items-center gap-1">
                    View all <ChevronRight className="w-3 h-3" />
                  </button>
                </div>
                <div className="grid grid-cols-3 sm:grid-cols-5 gap-3">
                  {bookmarkedMovies.slice(0, 5).map((m) => (
                    <MovieCard key={m.id} movie={m} onBookmarkChange={refreshBookmarks} />
                  ))}
                </div>
              </section>
            )}
          </div>
        )}

        {/* ── History ──────────────────────────────────────────────────── */}
        {activeTab === "history" && (
          <div>
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-2">
                <Clock className="w-4 h-4 text-yellow-400" />
                <h2 className="font-black text-base tracking-wide">Watch History</h2>
                <span className="text-xs text-white/30 bg-white/6 border border-white/8 rounded-full px-2 py-0.5">{watchHistory.length}</span>
              </div>
            </div>
            {watchHistory.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-20 rounded-2xl border border-white/6" style={{ background: "rgba(255,255,255,0.02)" }}>
                <Film className="w-12 h-12 text-white/15 mb-4" />
                <p className="text-sm text-white/30 mb-3">No watch history yet</p>
                <Link href="/movies"><button className="text-xs text-yellow-400 hover:underline">Browse Movies</button></Link>
              </div>
            ) : (
              <div className="space-y-2">
                {watchHistory.map((entry, i) => (
                  <HistoryRow key={`${entry.movieId}-${i}`} entry={entry} idx={i} />
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── Saved ────────────────────────────────────────────────────── */}
        {activeTab === "saved" && (
          <div>
            <div className="flex items-center gap-2 mb-6">
              <Bookmark className="w-4 h-4 text-blue-400" />
              <h2 className="font-black text-base tracking-wide">Saved Movies</h2>
              <span className="text-xs text-white/30 bg-white/6 border border-white/8 rounded-full px-2 py-0.5">{bookmarkedMovies.length}</span>
            </div>
            {bookmarkedMovies.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-20 rounded-2xl border border-white/6" style={{ background: "rgba(255,255,255,0.02)" }}>
                <Bookmark className="w-12 h-12 text-white/15 mb-4" />
                <p className="text-sm text-white/30 mb-3">No saved movies yet</p>
                <Link href="/movies"><button className="text-xs text-yellow-400 hover:underline">Browse Movies</button></Link>
              </div>
            ) : (
              <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-3">
                {bookmarkedMovies.map((movie) => (
                  <MovieCard key={movie.id} movie={movie} onBookmarkChange={refreshBookmarks} />
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── Liked ────────────────────────────────────────────────────── */}
        {activeTab === "liked" && (
          <div>
            <div className="flex items-center gap-2 mb-6">
              <Heart className="w-4 h-4 text-red-400" />
              <h2 className="font-black text-base tracking-wide">Liked Movies</h2>
              <span className="text-xs text-white/30 bg-white/6 border border-white/8 rounded-full px-2 py-0.5">{likedMovies.length}</span>
            </div>
            {likedMovies.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-20 rounded-2xl border border-white/6" style={{ background: "rgba(255,255,255,0.02)" }}>
                <Heart className="w-12 h-12 text-white/15 mb-4" />
                <p className="text-sm text-white/30 mb-3">No liked movies yet</p>
                <Link href="/movies"><button className="text-xs text-yellow-400 hover:underline">Browse Movies</button></Link>
              </div>
            ) : (
              <div className="space-y-2">
                {likedMovies.map((movie) => (
                  <Link key={movie.id} href={`/movie/${movie.id}`}>
                    <div className="flex items-center gap-4 p-3 rounded-xl border border-white/6 hover:border-red-400/20 hover:bg-red-400/4 transition-all group cursor-pointer">
                      <img src={movie.poster_url} alt={movie.title}
                        className="w-10 h-14 object-cover rounded-lg flex-shrink-0"
                        onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }} />
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-sm text-white group-hover:text-red-400 transition-colors truncate">{movie.title}</p>
                        <div className="flex items-center gap-2 mt-0.5">
                          <span className="text-xs text-white/30">{movie.genre}</span>
                          {movie.year && <span className="text-xs text-white/20">{movie.year}</span>}
                        </div>
                      </div>
                      <div className="flex items-center gap-1 flex-shrink-0">
                        <Heart className="w-3.5 h-3.5 text-red-400 fill-red-400" />
                        {movie.rating && <span className="text-xs text-white/30 ml-2">{movie.rating}</span>}
                      </div>
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </div>
        )}

      </main>
    </div>
  );
}
