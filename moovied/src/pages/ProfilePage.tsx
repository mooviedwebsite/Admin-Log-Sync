import { useState, useEffect, useMemo } from "react";
import { useLocation, Link } from "wouter";
import {
  Bookmark, Clock, LogOut, Film, Heart,
  TrendingUp, Calendar, MapPin, Shield, ChevronRight,
  Play, BarChart3, Activity, Loader2,
} from "lucide-react";
import Navbar from "@/components/Navbar";
import MovieCard from "@/components/MovieCard";
import { api, DEMO_MOVIES, cfUser, type Movie, type WatchEntry, type UserProfile } from "@/lib/api";
import { getCurrentUser, logout } from "@/lib/auth";

// ── Helpers ───────────────────────────────────────────────────────────────────
function daysSince(dateStr: string): number {
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return 0;
  return Math.floor((Date.now() - d.getTime()) / (1000 * 60 * 60 * 24));
}

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1)  return "Just now";
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

// ── Sub-components ────────────────────────────────────────────────────────────
function StatCard({ icon, label, value, color, sub }: {
  icon: React.ReactNode; label: string; value: number | string; color: string; sub?: string;
}) {
  return (
    <div
      className="relative flex-1 min-w-[140px] overflow-hidden rounded-2xl p-5 flex flex-col gap-3"
      style={{
        background: `linear-gradient(145deg,#0e0e0e 0%,${color}0d 100%)`,
        border: `1px solid ${color}28`,
        boxShadow: `0 0 0 1px ${color}0a,0 8px 32px ${color}12`,
      }}
    >
      <div className="absolute -top-8 -right-8 w-24 h-24 rounded-full pointer-events-none"
        style={{ background:`radial-gradient(circle,${color}30 0%,transparent 70%)`, filter:"blur(12px)" }} />
      <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
        style={{ background:`linear-gradient(135deg,${color}20,${color}0a)`, border:`1px solid ${color}35` }}>
        <span style={{ color, filter:`drop-shadow(0 0 4px ${color}60)` }}>{icon}</span>
      </div>
      <div>
        <p className="text-3xl sm:text-4xl font-black tracking-tight leading-none text-white">{value}</p>
        {sub && <p className="text-xs mt-1 font-medium" style={{ color:`${color}80` }}>{sub}</p>}
      </div>
      <p className="text-xs font-bold uppercase tracking-widest" style={{ color:`${color}70` }}>{label}</p>
      <div className="absolute bottom-0 left-0 right-0 h-[2px] pointer-events-none"
        style={{ background:`linear-gradient(90deg,${color}70,${color}20,transparent)` }} />
    </div>
  );
}

function GenreBar({ genre, count, max }: { genre: string; count: number; max: number }) {
  const pct = max > 0 ? Math.round((count / max) * 100) : 0;
  return (
    <div className="flex items-center gap-3">
      <span className="text-xs text-white/50 w-20 flex-shrink-0 text-right truncate">{genre}</span>
      <div className="flex-1 h-1.5 rounded-full bg-white/8">
        <div className="h-full rounded-full bg-yellow-400 transition-all duration-700" style={{ width:`${pct}%` }} />
      </div>
      <span className="text-xs text-white/40 w-6 text-right flex-shrink-0">{count}</span>
    </div>
  );
}

function HistoryRow({ entry, idx }: { entry: WatchEntry; idx: number }) {
  return (
    <Link href={`/movie/${entry.movieId}`}>
      <div className="flex items-center gap-4 p-3 rounded-xl border border-white/6 hover:border-yellow-400/20 hover:bg-yellow-400/4 transition-all group cursor-pointer">
        <span className="text-xs text-white/25 w-5 text-center flex-shrink-0">{idx + 1}</span>
        <div className="relative flex-shrink-0">
          <img src={entry.posterUrl} alt={entry.movieTitle}
            className="w-10 h-14 object-cover rounded-lg"
            onError={e => { (e.currentTarget as HTMLImageElement).style.display = "none"; }} />
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-sm text-white group-hover:text-yellow-400 transition-colors truncate">
            {entry.movieTitle}
          </p>
          <p className="text-xs text-white/35 mt-0.5 flex items-center gap-1">
            <Clock className="w-3 h-3" />{timeAgo(entry.watchedAt)}
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
  const [activeTab, setActiveTab]       = useState<Tab>("overview");
  const [movies, setMovies]             = useState<Movie[]>([]);
  const [profile, setProfile]           = useState<UserProfile | null>(null);
  const [loading, setLoading]           = useState(true);
  const [refreshing, setRefreshing]     = useState(false);

  // Derived from D1 profile data
  const watchHistory = useMemo((): WatchEntry[] => {
    if (!profile) return [];
    return profile.history.map(h => ({
      movieId:    h.movie_id,
      movieTitle: h.movie_title,
      posterUrl:  h.poster_url,
      watchedAt:  h.watched_at,
      progress:   h.progress,
    }));
  }, [profile]);

  const bookmarkIds  = useMemo(() => profile?.bookmarks   ?? [], [profile]);
  const likedIds     = useMemo(() => profile?.likedMovies ?? [], [profile]);

  useEffect(() => {
    if (!user) { navigate("/login"); return; }
    loadData();
  }, []);

  async function loadData() {
    if (!user) return;
    setLoading(true);
    try {
      // Load movies and D1 profile in parallel
      const [moviesResult, profileResult] = await Promise.all([
        api.getMovies().catch(() => ({ movies: DEMO_MOVIES })),
        cfUser.getProfile(user.id),
      ]);
      setMovies(moviesResult.movies);
      setProfile(profileResult);
    } catch {
      setMovies(DEMO_MOVIES);
      setProfile({ history: [], bookmarks: [], likedMovies: [] });
    } finally {
      setLoading(false);
    }
  }

  async function refreshProfile() {
    if (!user) return;
    setRefreshing(true);
    try {
      const p = await cfUser.getProfile(user.id);
      setProfile(p);
    } finally {
      setRefreshing(false);
    }
  }

  const bookmarkedMovies = useMemo(() => movies.filter(m => bookmarkIds.includes(m.id)), [movies, bookmarkIds]);
  const likedMovies      = useMemo(() => movies.filter(m => likedIds.includes(m.id)), [movies, likedIds]);

  const genreStats = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const entry of watchHistory) {
      const movie = movies.find(m => m.id === entry.movieId);
      if (!movie) continue;
      for (const g of movie.genre.split(",").map(s => s.trim()).filter(Boolean)) {
        counts[g] = (counts[g] || 0) + 1;
      }
    }
    return Object.entries(counts).sort(([, a], [, b]) => b - a).slice(0, 6);
  }, [watchHistory, movies]);

  const daysActive = user ? daysSince(user.created_at) : 0;

  const handleLogout = () => { logout(); navigate("/"); };

  if (!user) return null;

  const tabs: { key: Tab; label: string; icon: React.ReactNode; count?: number }[] = [
    { key:"overview",  label:"Overview",  icon:<BarChart3 className="w-4 h-4" /> },
    { key:"history",   label:"History",   icon:<Clock     className="w-4 h-4" />, count:watchHistory.length },
    { key:"saved",     label:"Saved",     icon:<Bookmark  className="w-4 h-4" />, count:bookmarkIds.length },
    { key:"liked",     label:"Liked",     icon:<Heart     className="w-4 h-4" />, count:likedIds.length },
  ];

  if (loading) return (
    <div className="min-h-screen bg-black flex items-center justify-center">
      <Navbar />
      <div className="flex flex-col items-center gap-4 text-white/40">
        <Loader2 className="w-10 h-10 animate-spin" />
        <p className="text-sm">Loading your profile from Cloudflare…</p>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-black text-white">
      <Navbar />

      {/* ── Header ── */}
      <div className="relative overflow-hidden pt-16">
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute top-0 left-1/4 w-96 h-96 rounded-full blur-3xl opacity-10"
            style={{ background:"radial-gradient(circle,#FACC15 0%,transparent 70%)" }} />
        </div>

        <div className="relative max-w-5xl mx-auto px-4 py-10">
          <div className="flex flex-col sm:flex-row gap-6 items-start sm:items-end">
            {/* Avatar */}
            <div className="relative flex-shrink-0">
              <div className="absolute -inset-1 rounded-full opacity-70 blur-sm"
                style={{ background:"conic-gradient(from 0deg,#FACC15,#000,#FACC15)" }} />
              <div className="relative w-24 h-24 rounded-full flex items-center justify-center border-2 border-yellow-400/60"
                style={{ background:"linear-gradient(135deg,#1a1a0a 0%,#2a2000 100%)" }}>
                <span className="text-4xl font-black text-yellow-400">
                  {user.name[0]?.toUpperCase() || "?"}
                </span>
              </div>
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
                  <Activity className="w-3 h-3" /> {daysActive} days with MOOVIED
                </span>
                <span className="flex items-center gap-1.5 text-xs text-green-400/60 bg-green-400/5 border border-green-400/20 rounded-full px-3 py-1">
                  ☁ Data synced from Cloudflare
                </span>
              </div>
            </div>

            {/* Actions */}
            <div className="flex gap-2 flex-shrink-0">
              <button
                onClick={refreshProfile}
                disabled={refreshing}
                className="flex items-center gap-2 text-sm font-semibold text-white/60 bg-white/5 hover:bg-white/10 border border-white/10 px-3 py-2 rounded-xl transition-all disabled:opacity-40"
              >
                <Activity className={`w-4 h-4 ${refreshing ? "animate-spin" : ""}`} />
                {refreshing ? "Syncing…" : "Refresh"}
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

          {/* Stat cards */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-8">
            <StatCard icon={<Film className="w-4 h-4" />}     label="Watched"     value={watchHistory.length} color="#FACC15" sub="All time" />
            <StatCard icon={<Bookmark className="w-4 h-4" />} label="Saved"       value={bookmarkIds.length}  color="#60a5fa" sub="In watchlist" />
            <StatCard icon={<Heart className="w-4 h-4" />}    label="Liked"       value={likedIds.length}     color="#f87171" sub="Favorites" />
            <StatCard icon={<TrendingUp className="w-4 h-4" />} label="Days Active" value={daysActive}         color="#34d399" sub="Member streak" />
          </div>
        </div>
      </div>

      {/* ── Tabs ── */}
      <div className="sticky top-0 z-30 bg-black/95 backdrop-blur-xl border-b border-white/8">
        <div className="max-w-5xl mx-auto px-4">
          <div className="flex gap-1 overflow-x-auto" style={{ scrollbarWidth:"none" }}>
            {tabs.map(t => (
              <button
                key={t.key}
                onClick={() => setActiveTab(t.key)}
                className={`flex items-center gap-2 px-4 py-4 text-sm font-bold border-b-2 transition-all whitespace-nowrap ${
                  activeTab === t.key
                    ? "border-yellow-400 text-yellow-400"
                    : "border-transparent text-white/40 hover:text-white/70"
                }`}
              >
                {t.icon}{t.label}
                {t.count !== undefined && (
                  <span className={`text-xs rounded-full px-1.5 py-0.5 ${
                    activeTab === t.key ? "bg-yellow-400/15 text-yellow-400" : "bg-white/8 text-white/30"
                  }`}>{t.count}</span>
                )}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* ── Tab content ── */}
      <main className="max-w-5xl mx-auto px-4 py-8">

        {/* Overview */}
        {activeTab === "overview" && (
          <div className="space-y-8">
            {/* Recent activity */}
            <section>
              <div className="flex items-center gap-2 mb-4">
                <Clock className="w-4 h-4 text-yellow-400" />
                <h2 className="font-black text-base tracking-wide">Recent Activity</h2>
              </div>
              {watchHistory.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 rounded-2xl border border-white/6" style={{ background:"rgba(255,255,255,0.02)" }}>
                  <Film className="w-10 h-10 text-white/15 mb-3" />
                  <p className="text-sm text-white/30">No activity yet — start watching!</p>
                  <Link href="/movies"><button className="mt-3 text-xs text-yellow-400 hover:underline">Browse Movies</button></Link>
                </div>
              ) : (
                <div className="space-y-2">
                  {watchHistory.slice(0, 6).map((e, i) => <HistoryRow key={`${e.movieId}-${i}`} entry={e} idx={i} />)}
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
              {/* Genre breakdown */}
              <section className="rounded-2xl border border-white/8 p-5" style={{ background:"rgba(255,255,255,0.03)" }}>
                <div className="flex items-center gap-2 mb-5">
                  <BarChart3 className="w-4 h-4 text-yellow-400" />
                  <h3 className="font-black text-sm tracking-wide">Favorite Genres</h3>
                </div>
                {genreStats.length === 0 ? (
                  <p className="text-center text-xs text-white/25 py-8">Watch movies to see genre breakdown</p>
                ) : (
                  <div className="space-y-3">
                    {genreStats.map(([g, c]) => <GenreBar key={g} genre={g} count={c} max={genreStats[0][1]} />)}
                  </div>
                )}
              </section>

              {/* Summary */}
              <section className="rounded-2xl border border-white/8 p-5 flex flex-col gap-4" style={{ background:"rgba(255,255,255,0.03)" }}>
                <div className="flex items-center gap-2">
                  <Activity className="w-4 h-4 text-yellow-400" />
                  <h3 className="font-black text-sm tracking-wide">Your Summary</h3>
                </div>
                <div className="space-y-3">
                  {[
                    { label:"Movies watched", value:watchHistory.length, color:"#FACC15" },
                    { label:"Movies saved",   value:bookmarkIds.length,  color:"#60a5fa" },
                    { label:"Movies liked",   value:likedIds.length,     color:"#f87171" },
                    { label:"Genres explored",value:genreStats.length,   color:"#34d399" },
                  ].map(({ label, value, color }) => (
                    <div key={label} className="flex items-center justify-between">
                      <span className="text-xs text-white/45">{label}</span>
                      <span className="text-sm font-black" style={{ color }}>{value}</span>
                    </div>
                  ))}
                  <div className="pt-2 border-t border-white/6">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs text-white/30">Membership</span>
                      <span className="text-xs font-bold text-yellow-400">{daysActive} days</span>
                    </div>
                    <div className="h-1.5 rounded-full bg-white/8">
                      <div className="h-full rounded-full bg-yellow-400" style={{ width:`${Math.min(100, daysActive / 365 * 100)}%` }} />
                    </div>
                  </div>
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
                  <button onClick={() => setActiveTab("saved")}
                    className="text-xs text-white/30 hover:text-yellow-400 transition-colors flex items-center gap-1">
                    View all <ChevronRight className="w-3 h-3" />
                  </button>
                </div>
                <div className="grid grid-cols-3 sm:grid-cols-5 gap-3">
                  {bookmarkedMovies.slice(0, 5).map(m => <MovieCard key={m.id} movie={m} />)}
                </div>
              </section>
            )}
          </div>
        )}

        {/* History tab */}
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
              <div className="flex flex-col items-center justify-center py-20 rounded-2xl border border-white/6" style={{ background:"rgba(255,255,255,0.02)" }}>
                <Film className="w-12 h-12 text-white/15 mb-4" />
                <p className="text-sm text-white/30 mb-3">No watch history yet</p>
                <Link href="/movies"><button className="text-xs text-yellow-400 hover:underline">Browse Movies</button></Link>
              </div>
            ) : (
              <div className="space-y-2">
                {watchHistory.map((e, i) => <HistoryRow key={`${e.movieId}-${i}`} entry={e} idx={i} />)}
              </div>
            )}
          </div>
        )}

        {/* Saved tab */}
        {activeTab === "saved" && (
          <div>
            <div className="flex items-center gap-2 mb-6">
              <Bookmark className="w-4 h-4 text-blue-400" />
              <h2 className="font-black text-base tracking-wide">Saved Movies</h2>
              <span className="text-xs text-white/30 bg-white/6 border border-white/8 rounded-full px-2 py-0.5">{bookmarkedMovies.length}</span>
            </div>
            {bookmarkedMovies.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-20 rounded-2xl border border-white/6" style={{ background:"rgba(255,255,255,0.02)" }}>
                <Bookmark className="w-12 h-12 text-white/15 mb-4" />
                <p className="text-sm text-white/30 mb-3">No saved movies yet</p>
                <Link href="/movies"><button className="text-xs text-yellow-400 hover:underline">Browse Movies</button></Link>
              </div>
            ) : (
              <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-3">
                {bookmarkedMovies.map(m => <MovieCard key={m.id} movie={m} />)}
              </div>
            )}
          </div>
        )}

        {/* Liked tab */}
        {activeTab === "liked" && (
          <div>
            <div className="flex items-center gap-2 mb-6">
              <Heart className="w-4 h-4 text-red-400" />
              <h2 className="font-black text-base tracking-wide">Liked Movies</h2>
              <span className="text-xs text-white/30 bg-white/6 border border-white/8 rounded-full px-2 py-0.5">{likedMovies.length}</span>
            </div>
            {likedMovies.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-20 rounded-2xl border border-white/6" style={{ background:"rgba(255,255,255,0.02)" }}>
                <Heart className="w-12 h-12 text-white/15 mb-4" />
                <p className="text-sm text-white/30 mb-3">No liked movies yet</p>
                <Link href="/movies"><button className="text-xs text-yellow-400 hover:underline">Browse Movies</button></Link>
              </div>
            ) : (
              <div className="space-y-2">
                {likedMovies.map(m => (
                  <Link key={m.id} href={`/movie/${m.id}`}>
                    <div className="flex items-center gap-4 p-3 rounded-xl border border-white/6 hover:border-red-400/20 hover:bg-red-400/4 transition-all group cursor-pointer">
                      <img src={m.poster_url} alt={m.title}
                        className="w-10 h-14 object-cover rounded-lg flex-shrink-0"
                        onError={e => { (e.currentTarget as HTMLImageElement).style.display = "none"; }} />
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-sm text-white group-hover:text-red-400 transition-colors truncate">{m.title}</p>
                        <div className="flex items-center gap-2 mt-0.5">
                          <span className="text-xs text-white/30">{m.genre}</span>
                          {m.year && <span className="text-xs text-white/20">{m.year}</span>}
                        </div>
                      </div>
                      <div className="flex items-center gap-1 flex-shrink-0">
                        <Heart className="w-3.5 h-3.5 text-red-400 fill-red-400" />
                        {m.rating && <span className="text-xs text-white/30 ml-2">{m.rating}</span>}
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
