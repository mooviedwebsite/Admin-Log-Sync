import { useState, useEffect, useMemo } from "react";
import { useLocation, Link } from "wouter";
import {
  Bookmark, Clock, LogOut, Film, Heart, Star,
  TrendingUp, Calendar, MapPin, Shield, ChevronRight,
  Play, BarChart3, Activity,
} from "lucide-react";
import Navbar from "@/components/Navbar";
import MovieCard from "@/components/MovieCard";
import { api, DEMO_MOVIES, type Movie } from "@/lib/api";
import { getCurrentUser, logout, getBookmarks, getWatchHistory, type WatchEntry } from "@/lib/auth";

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
      {/* Glow orb — top right */}
      <div
        className="absolute -top-8 -right-8 w-24 h-24 rounded-full pointer-events-none"
        style={{ background: `radial-gradient(circle, ${color}30 0%, transparent 70%)`, filter: "blur(12px)" }}
      />
      {/* Top highlight sheen */}
      <div
        className="absolute top-0 left-4 right-4 h-px pointer-events-none"
        style={{ background: `linear-gradient(90deg, transparent, ${color}40, transparent)` }}
      />

      {/* Icon badge */}
      <div
        className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
        style={{
          background: `linear-gradient(135deg, ${color}20, ${color}0a)`,
          border: `1px solid ${color}35`,
          boxShadow: `0 0 14px ${color}20`,
        }}
      >
        <span style={{ color, filter: `drop-shadow(0 0 4px ${color}60)` }}>{icon}</span>
      </div>

      {/* Value */}
      <div>
        <p
          className="text-3xl sm:text-4xl font-black tracking-tight leading-none"
          style={{ color: "#fff", textShadow: `0 0 20px ${color}30` }}
        >
          {value}
        </p>
        {sub && (
          <p className="text-xs mt-1 font-medium" style={{ color: `${color}80` }}>
            {sub}
          </p>
        )}
      </div>

      {/* Label */}
      <p className="text-xs font-bold uppercase tracking-widest" style={{ color: `${color}70` }}>
        {label}
      </p>

      {/* Bottom accent bar */}
      <div
        className="absolute bottom-0 left-0 right-0 h-[2px] pointer-events-none"
        style={{ background: `linear-gradient(90deg, ${color}70, ${color}20, transparent)` }}
      />
    </div>
  );
}

// ── Genre Bar ─────────────────────────────────────────────────────────────────
function GenreBar({ genre, count, max }: { genre: string; count: number; max: number }) {
  const pct = max > 0 ? Math.round((count / max) * 100) : 0;
  return (
    <div className="flex items-center gap-3">
      <span className="text-xs text-white/50 w-20 flex-shrink-0 text-right truncate">{genre}</span>
      <div className="flex-1 h-1.5 rounded-full bg-white/8">
        <div
          className="h-full rounded-full bg-yellow-400 transition-all duration-700"
          style={{ width: `${pct}%` }}
        />
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
          <img
            src={entry.posterUrl}
            alt={entry.movieTitle}
            className="w-10 h-14 object-cover rounded-lg"
            onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }}
          />
          <div className="absolute inset-0 rounded-lg bg-black/20 group-hover:bg-black/0 transition-all" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-sm text-white group-hover:text-yellow-400 transition-colors truncate">
            {entry.movieTitle}
          </p>
          <p className="text-xs text-white/35 mt-0.5 flex items-center gap-1">
            <Clock className="w-3 h-3" />
            {timeAgo(entry.watchedAt)}
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
  const user = getCurrentUser();
  const [, navigate] = useLocation();
  const [activeTab, setActiveTab] = useState<Tab>("overview");
  const [movies, setMovies] = useState<Movie[]>([]);
  const [watchHistory, setWatchHistory] = useState<WatchEntry[]>([]);
  const [bookmarkIds, setBookmarkIds] = useState<string[]>([]);
  const [likedIds, setLikedIds] = useState<string[]>([]);

  useEffect(() => {
    if (!user) { navigate("/login"); return; }
    setWatchHistory(getWatchHistory());
    setBookmarkIds(getBookmarks());
    setLikedIds(getLikedMovieIds());
    api.getMovies().then((d) => setMovies(d.movies)).catch(() => setMovies(DEMO_MOVIES));
  }, []);

  const bookmarkedMovies = useMemo(() => movies.filter((m) => bookmarkIds.includes(m.id)), [movies, bookmarkIds]);
  const likedMovies = useMemo(() => movies.filter((m) => likedIds.includes(m.id)), [movies, likedIds]);

  // Genre breakdown from watch history cross-ref
  const genreStats = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const entry of watchHistory) {
      const movie = movies.find((m) => m.id === entry.movieId);
      if (!movie) continue;
      const genres = movie.genre.split(",").map((g) => g.trim()).filter(Boolean);
      for (const g of genres) { counts[g] = (counts[g] || 0) + 1; }
    }
    return Object.entries(counts)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 6);
  }, [watchHistory, movies]);

  const memberDays = user ? daysSince(user.created_at) : 0;

  const handleLogout = () => { logout(); navigate("/"); };
  const refreshBookmarks = () => setBookmarkIds(getBookmarks());

  if (!user) return null;

  // Avatar letter + bg
  const initial = user.name[0]?.toUpperCase() || "?";

  const tabs: { key: Tab; label: string; icon: React.ReactNode; count?: number }[] = [
    { key: "overview",  label: "Overview",  icon: <BarChart3 className="w-4 h-4" /> },
    { key: "history",   label: "History",   icon: <Clock className="w-4 h-4" />,     count: watchHistory.length },
    { key: "saved",     label: "Saved",     icon: <Bookmark className="w-4 h-4" />,  count: bookmarkIds.length },
    { key: "liked",     label: "Liked",     icon: <Heart className="w-4 h-4" />,     count: likedIds.length },
  ];

  return (
    <div className="min-h-screen bg-black text-white">
      <Navbar />

      {/* ── Hero ─────────────────────────────────────────────────────────── */}
      <div className="relative overflow-hidden pt-16">
        {/* Background gradient */}
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute top-0 left-1/4 w-96 h-96 rounded-full blur-3xl opacity-10"
            style={{ background: "radial-gradient(circle, #FACC15 0%, transparent 70%)" }} />
          <div className="absolute bottom-0 right-1/4 w-64 h-64 rounded-full blur-3xl opacity-5"
            style={{ background: "radial-gradient(circle, #FACC15 0%, transparent 70%)" }} />
        </div>

        <div className="relative max-w-5xl mx-auto px-4 py-10">
          <div className="flex flex-col sm:flex-row gap-6 items-start sm:items-end">

            {/* Avatar */}
            <div className="relative flex-shrink-0">
              <div className="absolute -inset-1 rounded-full opacity-70 blur-sm"
                style={{ background: "conic-gradient(from 0deg, #FACC15, #000, #FACC15)" }} />
              <div className="relative w-24 h-24 rounded-full flex items-center justify-center border-2 border-yellow-400/60"
                style={{ background: "linear-gradient(135deg, #1a1a0a 0%, #2a2000 100%)" }}>
                <span className="text-4xl font-black text-yellow-400">{initial}</span>
              </div>
              {/* Online dot */}
              <div className="absolute bottom-1 right-1 w-4 h-4 rounded-full bg-green-400 border-2 border-black" />
            </div>

            {/* Info */}
            <div className="flex-1 min-w-0">
              <div className="flex flex-wrap items-center gap-2 mb-1">
                <h1 className="text-2xl sm:text-3xl font-black text-white">{user.name}</h1>
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

        {/* ── Overview ──────────────────────────────────────────────────── */}
        {activeTab === "overview" && (
          <div className="space-y-8">

            {/* Recent Activity */}
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
                    <button
                      onClick={() => setActiveTab("history")}
                      className="w-full text-xs text-white/30 hover:text-yellow-400 py-3 transition-colors"
                    >
                      View all {watchHistory.length} watched movies
                    </button>
                  )}
                </div>
              )}
            </section>

            {/* Two-column: Genre + Quick Stats */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">

              {/* Genre Breakdown */}
              <section className="rounded-2xl border border-white/8 p-5"
                style={{ background: "rgba(255,255,255,0.03)" }}>
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
                      <GenreBar
                        key={genre}
                        genre={genre}
                        count={count}
                        max={genreStats[0][1]}
                      />
                    ))}
                  </div>
                )}
              </section>

              {/* Watch Summary */}
              <section className="rounded-2xl border border-white/8 p-5 flex flex-col gap-4"
                style={{ background: "rgba(255,255,255,0.03)" }}>
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

                {/* Membership progress */}
                <div className="pt-2 border-t border-white/6">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs text-white/30">Membership</span>
                    <span className="text-xs font-bold text-yellow-400">{memberDays} days</span>
                  </div>
                  <div className="h-1.5 rounded-full bg-white/8">
                    <div
                      className="h-full rounded-full bg-yellow-400"
                      style={{ width: `${Math.min(100, (memberDays / 365) * 100)}%` }}
                    />
                  </div>
                  <p className="text-xs text-white/20 mt-1.5 text-right">
                    {365 - Math.min(365, memberDays) > 0 ? `${365 - Math.min(365, memberDays)} days to 1 year` : "1+ year member"}
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
                    <h2 className="font-black text-base tracking-wide">Saved</h2>
                  </div>
                  <button
                    onClick={() => setActiveTab("saved")}
                    className="text-xs text-white/30 hover:text-yellow-400 transition-colors flex items-center gap-1"
                  >
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

        {/* ── Watch History ─────────────────────────────────────────────── */}
        {activeTab === "history" && (
          <div>
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-2">
                <Clock className="w-4 h-4 text-yellow-400" />
                <h2 className="font-black text-base tracking-wide">Watch History</h2>
                <span className="text-xs text-white/30 bg-white/6 border border-white/8 rounded-full px-2 py-0.5">
                  {watchHistory.length}
                </span>
              </div>
            </div>
            {watchHistory.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-20 rounded-2xl border border-white/6"
                style={{ background: "rgba(255,255,255,0.02)" }}>
                <Film className="w-12 h-12 text-white/15 mb-4" />
                <p className="text-sm text-white/30 mb-3">No watch history yet</p>
                <Link href="/movies">
                  <button className="text-xs text-yellow-400 hover:underline">Browse Movies</button>
                </Link>
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
              <span className="text-xs text-white/30 bg-white/6 border border-white/8 rounded-full px-2 py-0.5">
                {bookmarkedMovies.length}
              </span>
            </div>
            {bookmarkedMovies.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-20 rounded-2xl border border-white/6"
                style={{ background: "rgba(255,255,255,0.02)" }}>
                <Bookmark className="w-12 h-12 text-white/15 mb-4" />
                <p className="text-sm text-white/30 mb-3">No saved movies yet</p>
                <Link href="/movies">
                  <button className="text-xs text-yellow-400 hover:underline">Browse Movies</button>
                </Link>
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
              <span className="text-xs text-white/30 bg-white/6 border border-white/8 rounded-full px-2 py-0.5">
                {likedMovies.length}
              </span>
            </div>
            {likedMovies.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-20 rounded-2xl border border-white/6"
                style={{ background: "rgba(255,255,255,0.02)" }}>
                <Heart className="w-12 h-12 text-white/15 mb-4" />
                <p className="text-sm text-white/30 mb-3">No liked movies yet</p>
                <Link href="/movies">
                  <button className="text-xs text-yellow-400 hover:underline">Browse Movies</button>
                </Link>
              </div>
            ) : (
              <div className="space-y-2">
                {likedMovies.map((movie) => (
                  <Link key={movie.id} href={`/movie/${movie.id}`}>
                    <div className="flex items-center gap-4 p-3 rounded-xl border border-white/6 hover:border-red-400/20 hover:bg-red-400/4 transition-all group cursor-pointer">
                      <img
                        src={movie.poster_url}
                        alt={movie.title}
                        className="w-10 h-14 object-cover rounded-lg flex-shrink-0"
                        onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }}
                      />
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-sm text-white group-hover:text-red-400 transition-colors truncate">
                          {movie.title}
                        </p>
                        <div className="flex items-center gap-2 mt-0.5">
                          <span className="text-xs text-white/30">{movie.genre}</span>
                          {movie.year && <span className="text-xs text-white/20">{movie.year}</span>}
                        </div>
                      </div>
                      <div className="flex items-center gap-1 flex-shrink-0">
                        <Heart className="w-3.5 h-3.5 text-red-400 fill-red-400" />
                        {movie.rating && (
                          <span className="text-xs text-white/30 ml-2">{movie.rating}</span>
                        )}
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
