import { useState, useEffect } from "react";
import { useLocation, Link } from "wouter";
import {
  Film, Users, Eye, Plus, Pencil, Trash2, X, Check, LogOut,
  Activity, Settings, Home, Loader2, Upload, Check as CheckIcon,
  MessageSquare, ChevronDown, ChevronUp, Mail, Send, Play,
} from "lucide-react";
import { api, realComments, getCommentsApiUrl, setCommentsApiUrl, type Movie, type Episode, type User as UserType, type ActivityLog, type Comment } from "@/lib/api";
import { getGasUrl, setGasUrl, getGasSecret, setGasSecret } from "@/lib/api";
import { getCurrentUser, logout } from "@/lib/auth";
import { formatViews, formatDate } from "@/lib/utils";
import { mergeAllMovieMeta, EXTENDED_FIELDS } from "@/lib/movieMeta";
import { invalidateCache } from "@/lib/movieCache";

type Tab = "dashboard" | "movies" | "series" | "comments" | "users" | "logs" | "email" | "settings";

const EMPTY_MOVIE = {
  title: "", description: "", synopsis: "",
  poster_url: "", video_url: "", yt_link: "", download_url: "", subtitle_url: "",
  dl_2160p: "", dl_1080p: "", dl_720p: "", dl_480p: "", dl_360p: "",
  genre: "Action", year: String(new Date().getFullYear()),
  rating: 8.0, tmdb_rating: "", rt_rating: "", runtime: "",
  director: "", director_image: "",
  cast: "",
  gallery: "",
};

export default function AdminPage() {
  const user = getCurrentUser();
  const [, navigate] = useLocation();
  const [tab, setTab] = useState<Tab>("dashboard");

  // Admin always loads fresh from GAS — never from local cache or demo movies
  const [movies, setMovies] = useState<Movie[]>([]);
  const [loading, setLoading] = useState(true);
  const [users, setUsers] = useState<UserType[]>([]);
  const [logs, setLogs] = useState<ActivityLog[]>([]);
  const [stats, setStats] = useState({ totalUsers: 0, totalMovies: 0, totalViews: 0, totalComments: 0 });
  const [auxLoading, setAuxLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingMovie, setEditingMovie] = useState<Movie | null>(null);
  const [form, setForm] = useState({ ...EMPTY_MOVIE });
  const [formType, setFormType] = useState<"movie" | "series">("movie");
  const [formEpisodes, setFormEpisodes] = useState<Episode[]>([]);
  const [expandedEp, setExpandedEp] = useState<string | null>(null);
  const [formLoading, setFormLoading] = useState(false);
  const [formError, setFormError] = useState("");
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState("");
  const [syncStatus, setSyncStatus] = useState<string>("");

  // Comments state
  const [allCommentsMeta, setAllCommentsMeta] = useState<{ movieId: string; count: number }[]>([]);
  const [selectedCommentMovieId, setSelectedCommentMovieId] = useState<string | null>(null);
  const [viewedComments, setViewedComments] = useState<Comment[]>([]);
  const [editCommentId, setEditCommentId] = useState<string | null>(null);
  const [editCommentContent, setEditCommentContent] = useState("");

  // Email state
  const [emailTarget, setEmailTarget] = useState<"all" | string>("all");
  const [emailSubject, setEmailSubject] = useState("");
  const [emailBody, setEmailBody] = useState("");
  const [emailSending, setEmailSending] = useState(false);
  const [emailResult, setEmailResult] = useState<{ ok: boolean; msg: string } | null>(null);

  useEffect(() => {
    if (!user?.isAdmin) navigate("/login");
  }, [user]);

  useEffect(() => { loadAllFromGas(); }, []);

  // Load EVERYTHING from Google Sheets, then enrich with local meta and auto-sync back
  async function loadAllFromGas() {
    setLoading(true);
    setAuxLoading(true);
    setSyncStatus("");

    const [moviesData, statsData, userData, actData] = await Promise.allSettled([
      api.getMovies(),
      api.getStats(),
      api.getUsers(),
      api.getActivityLogs(),
    ]);

    // Movies — load from GAS, enrich with local meta, then auto-sync to GAS
    if (moviesData.status === "fulfilled") {
      const gasMovies = moviesData.value.movies.filter((m) => !m.id.startsWith("demo"));

      // Merge local meta (synopsis, cast, gallery, yt_link, dl_*, etc.) into GAS movies
      // On this device (admin), local meta was saved when movies were added/edited
      const enrichedMovies = mergeAllMovieMeta(gasMovies);
      setMovies(enrichedMovies);

      // Find movies that have local data richer than what GAS returned
      // (GAS v2 or movies added before GAS v3 update won't have extended fields)
      const toSync = enrichedMovies.filter((enriched, i) => {
        const original = gasMovies[i];
        return EXTENDED_FIELDS.some(
          (f) => enriched[f] && enriched[f] !== "" && (!original[f] || original[f] === "")
        );
      });

      // Auto-sync enriched movies back to GAS so other devices can see them
      if (toSync.length > 0) {
        setSyncStatus(`Syncing ${toSync.length} movie(s) to Google Sheets...`);
        Promise.all(toSync.map((m) => api.editMovie(m).catch(() => {})))
          .then(() => {
            setSyncStatus(`${toSync.length} movie(s) synced — all devices will now see full details.`);
            setTimeout(() => setSyncStatus(""), 6000);
          });
      }
    }

    // Stats — only from GAS
    if (statsData.status === "fulfilled") {
      setStats(statsData.value as typeof stats);
    }

    // Users
    if (userData.status === "fulfilled") {
      setUsers(userData.value.users);
    }

    // Activity logs
    if (actData.status === "fulfilled") {
      setLogs(actData.value.logs);
    }

    setLoading(false);
    setAuxLoading(false);
  }

  useEffect(() => {
    if (tab === "comments") loadComments();
  }, [tab]);

  // Comments — GAS is the ONLY source of truth
  function loadComments() {
    realComments.getAllComments().then((serverAll) => {
      const grouped: Record<string, number> = {};
      serverAll.forEach((c) => { grouped[c.movie_id] = (grouped[c.movie_id] || 0) + 1; });
      setAllCommentsMeta(Object.entries(grouped).map(([movieId, count]) => ({ movieId, count })));
      if (selectedCommentMovieId) {
        setViewedComments(serverAll.filter((c) => c.movie_id === selectedCommentMovieId)
          .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()));
      }
    }).catch(() => {});
  }

  function selectCommentMovie(movieId: string) {
    setSelectedCommentMovieId(movieId);
    setViewedComments([]);
    setEditCommentId(null);
    realComments.getComments(movieId).then((serverComments) => {
      setViewedComments(serverComments.sort(
        (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
      ));
    }).catch(() => {});
  }

  function handleDeleteComment(comment: Comment) {
    realComments.deleteComment(comment.id).catch(() => {});
    setViewedComments((prev) => prev.filter((c) => c.id !== comment.id));
    setAllCommentsMeta((prev) =>
      prev.map((m) => m.movieId === comment.movie_id ? { ...m, count: m.count - 1 } : m).filter(m => m.count > 0)
    );
  }

  function handleSaveCommentEdit(comment: Comment) {
    if (!editCommentContent.trim()) return;
    realComments.editComment(comment.id, comment.movie_id, editCommentContent.trim()).catch(() => {});
    setViewedComments((prev) => prev.map((c) => c.id === comment.id ? { ...c, content: editCommentContent.trim(), edited: true } : c));
    setEditCommentId(null);
  }

  async function handleSendEmail(e: React.FormEvent) {
    e.preventDefault();
    if (!emailSubject.trim() || !emailBody.trim()) return;
    setEmailSending(true);
    setEmailResult(null);
    try {
      if (emailTarget === "all") {
        const r = await api.sendEmailToAll(emailSubject, emailBody);
        setEmailResult({ ok: true, msg: `Sent to ${(r as { sent: number }).sent} users successfully.` });
      } else {
        await api.sendEmailToUser(emailTarget, emailSubject, emailBody);
        const targetUser = users.find((u) => u.id === emailTarget);
        setEmailResult({ ok: true, msg: `Sent to ${targetUser?.name || targetUser?.email || "user"} successfully.` });
      }
      setEmailSubject("");
      setEmailBody("");
    } catch (err: unknown) {
      setEmailResult({ ok: false, msg: err instanceof Error ? err.message : "Failed to send email." });
    } finally { setEmailSending(false); }
  }

  const makeBlankEpisode = (): Episode => ({
    id: `ep_${Date.now()}_${Math.random().toString(36).slice(2,6)}`,
    season: 1, episode: (formEpisodes.length + 1),
    title: "", description: "", video_url: "",
    download_url: "", subtitle_url: "", thumbnail: "", duration: "",
  });

  const openAddForm = (presetType: "movie" | "series" = "movie") => {
    setForm({ ...EMPTY_MOVIE });
    setFormType(presetType);
    setFormEpisodes([]);
    setExpandedEp(null);
    setEditingMovie(null);
    setFormError("");
    setShowForm(true);
  };

  const openEditForm = (movie: Movie) => {
    setForm({
      title: movie.title, description: movie.description || "",
      synopsis: movie.synopsis || "",
      poster_url: movie.poster_url, video_url: movie.video_url,
      yt_link: movie.yt_link || "", download_url: movie.download_url || "",
      subtitle_url: movie.subtitle_url || "",
      dl_2160p: movie.dl_2160p || "", dl_1080p: movie.dl_1080p || "",
      dl_720p: movie.dl_720p || "", dl_480p: movie.dl_480p || "", dl_360p: movie.dl_360p || "",
      genre: movie.genre, year: movie.year,
      rating: movie.rating || 8.0,
      tmdb_rating: String(movie.tmdb_rating || ""), rt_rating: String(movie.rt_rating || ""),
      runtime: movie.runtime || "",
      director: movie.director || "", director_image: movie.director_image || "",
      cast: movie.cast || "", gallery: movie.gallery || "",
    });
    const t = movie.type === "series" ? "series" : "movie";
    setFormType(t);
    const eps: Episode[] = Array.isArray(movie.episodes) ? movie.episodes : [];
    setFormEpisodes(eps);
    setExpandedEp(null);
    setEditingMovie(movie);
    setFormError("");
    setShowForm(true);
  };

  const handleFormSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.title || !form.poster_url) {
      setFormError("Title and Poster URL are required.");
      return;
    }
    if (formType === "movie" && !form.video_url) {
      setFormError("Video URL is required for movies.");
      return;
    }
    setFormLoading(true);
    setFormError("");
    try {
      const payload = {
        ...form,
        type: formType,
        episodes: JSON.stringify(formEpisodes),
        rating: Number(form.rating) || undefined,
        tmdb_rating: form.tmdb_rating !== "" ? Number(form.tmdb_rating) : undefined,
        rt_rating: form.rt_rating !== "" ? Number(form.rt_rating) : undefined,
      };
      if (editingMovie) {
        await api.editMovie({ ...editingMovie, ...payload, episodes: formEpisodes } as Movie);
        setSuccessMsg(`${formType === "series" ? "Series" : "Movie"} updated successfully.`);
      } else {
        await api.addMovie({ ...payload, episodes: formEpisodes } as Omit<Movie, "id" | "views">);
        setSuccessMsg(`${formType === "series" ? "Series" : "Movie"} added successfully.`);
      }
      setShowForm(false);
      setTimeout(() => setSuccessMsg(""), 4000);
      // Reload movies list from GAS to show real server data
      api.getMovies().then((d) => {
        setMovies(d.movies.filter((m) => !m.id.startsWith("demo")));
      }).catch(() => {});
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Operation failed";
      setFormError(msg.includes("not configured")
        ? "Backend not connected. Configure Google Apps Script URL in Settings first."
        : msg);
    } finally { setFormLoading(false); }
  };

  const handleDelete = async (id: string) => {
    if (deleteConfirm !== id) { setDeleteConfirm(id); return; }
    try {
      await api.deleteMovie(id);
      setMovies((prev) => prev.filter((m) => m.id !== id));
      setStats((s) => ({ ...s, totalMovies: Math.max(0, s.totalMovies - 1) }));
    } catch {}
    setDeleteConfirm(null);
  };

  if (!user?.isAdmin) return null;

  const tabs: { key: Tab; label: string; icon: React.ReactNode }[] = [
    { key: "dashboard", label: "Dashboard", icon: <Home className="w-4 h-4" /> },
    { key: "movies", label: "Movies", icon: <Film className="w-4 h-4" /> },
    { key: "series", label: "TV Series", icon: <Play className="w-4 h-4" /> },
    { key: "comments", label: "Comments", icon: <MessageSquare className="w-4 h-4" /> },
    { key: "users", label: "Users", icon: <Users className="w-4 h-4" /> },
    { key: "logs", label: "Activity", icon: <Activity className="w-4 h-4" /> },
    { key: "email", label: "Email", icon: <Mail className="w-4 h-4" /> },
    { key: "settings", label: "Settings", icon: <Settings className="w-4 h-4" /> },
  ];

  const timeAgo = (ts: string) => {
    const diff = Date.now() - new Date(ts).getTime();
    const m = Math.floor(diff / 60000);
    if (m < 1) return "just now";
    if (m < 60) return `${m}m ago`;
    const h = Math.floor(m / 60);
    if (h < 24) return `${h}h ago`;
    return `${Math.floor(h / 24)}d ago`;
  };

  const getMovieTitle = (movieId: string) => {
    const m = movies.find(x => x.id === movieId);
    return m?.title || `Movie #${movieId}`;
  };

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-white">
      <div className="flex">
        {/* Sidebar */}
        <aside className="w-64 min-h-screen bg-black/80 border-r border-white/10 flex-shrink-0 hidden md:flex flex-col">
          <div className="p-6 border-b border-white/10">
            <Link href="/" className="flex items-center gap-2">
              <Film className="w-6 h-6 text-yellow-400" />
              <span className="text-xl font-black">MOOV<span className="text-yellow-400">IED</span></span>
            </Link>
            <p className="text-xs text-white/40 mt-1">Admin Panel</p>
          </div>
          <nav className="flex-1 p-4 space-y-1">
            {tabs.map((t) => (
              <button
                key={t.key}
                onClick={() => setTab(t.key)}
                className={`w-full flex items-center gap-3 px-4 py-2.5 rounded-lg text-sm transition-all ${
                  tab === t.key
                    ? "bg-yellow-400/15 text-yellow-400 border border-yellow-400/30"
                    : "text-white/60 hover:bg-white/5 hover:text-white"
                }`}
              >
                {t.icon}{t.label}
              </button>
            ))}
          </nav>
          <div className="p-4 border-t border-white/10">
            <button
              onClick={() => { logout(); navigate("/"); }}
              className="flex items-center gap-3 w-full px-4 py-2.5 text-sm text-red-400 hover:bg-red-500/10 rounded-lg transition-all"
            >
              <LogOut className="w-4 h-4" /> Sign Out
            </button>
          </div>
        </aside>

        {/* Main content */}
        <div className="flex-1 min-h-screen">
          <header className="bg-black/60 border-b border-white/10 px-6 py-4 flex items-center justify-between">
            <div>
              <h1 className="font-bold text-lg capitalize">{tab}</h1>
              <p className="text-xs text-white/40">Welcome, {user.name}</p>
            </div>
            <div className="flex items-center gap-1 md:hidden">
              {tabs.map((t) => (
                <button key={t.key} onClick={() => setTab(t.key)} className={`p-2 rounded-lg ${tab === t.key ? "text-yellow-400" : "text-white/40"}`}>
                  {t.icon}
                </button>
              ))}
            </div>
          </header>

          <main className="p-6">
            {successMsg && (
              <div className="mb-4 bg-green-500/10 border border-green-500/30 text-green-400 text-sm rounded-xl px-4 py-3 flex items-center gap-2">
                <CheckIcon className="w-4 h-4 flex-shrink-0" />{successMsg}
              </div>
            )}
            {syncStatus && (
              <div className="mb-4 bg-blue-500/10 border border-blue-500/30 text-blue-300 text-sm rounded-xl px-4 py-3 flex items-center gap-2">
                {syncStatus.includes("Syncing") ? (
                  <Loader2 className="w-4 h-4 flex-shrink-0 animate-spin" />
                ) : (
                  <CheckIcon className="w-4 h-4 flex-shrink-0" />
                )}
                {syncStatus}
              </div>
            )}

            {/* ── Dashboard ── */}
            {tab === "dashboard" && (
              <div className="space-y-6">
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                  {[
                    { label: "Movies", value: stats.totalMovies, icon: <Film className="w-5 h-5" />, color: "yellow" },
                    { label: "Users", value: stats.totalUsers, icon: <Users className="w-5 h-5" />, color: "blue" },
                    { label: "Total Views", value: formatViews(stats.totalViews), icon: <Eye className="w-5 h-5" />, color: "green" },
                    { label: "Comments", value: stats.totalComments, icon: <MessageSquare className="w-5 h-5" />, color: "purple" },
                  ].map((stat) => (
                    <div key={stat.label} className="bg-white/5 border border-white/10 rounded-xl p-5">
                      <div className={`w-10 h-10 rounded-xl flex items-center justify-center mb-3 ${
                        stat.color === "yellow" ? "bg-yellow-400/15 text-yellow-400" :
                        stat.color === "blue" ? "bg-blue-400/15 text-blue-400" :
                        stat.color === "purple" ? "bg-purple-400/15 text-purple-400" :
                        "bg-green-400/15 text-green-400"
                      }`}>{stat.icon}</div>
                      <p className="text-2xl font-black">{auxLoading ? "—" : stat.value}</p>
                      <p className="text-xs text-white/40 mt-1 uppercase tracking-wider font-semibold">{stat.label}</p>
                      <p className="text-[10px] text-white/20 mt-0.5">from Google Sheets</p>
                    </div>
                  ))}
                </div>
                <div className="bg-white/5 border border-white/10 rounded-xl p-6">
                  <div className="flex items-center justify-between mb-4">
                    <h2 className="font-bold">Recent Movies</h2>
                    <span className="text-xs text-white/30 font-semibold">Google Sheets</span>
                  </div>
                  {loading ? (
                    <div className="flex items-center gap-3 py-8 justify-center text-white/30">
                      <Loader2 className="w-5 h-5 animate-spin" />
                      <span className="text-sm">Loading from Google Sheets...</span>
                    </div>
                  ) : movies.length === 0 ? (
                    <div className="text-center py-10 text-white/30">
                      <Film className="w-10 h-10 mx-auto mb-3 opacity-30" />
                      <p className="text-sm">No movies in Google Sheets yet.</p>
                      <p className="text-xs mt-1 text-white/20">Add a movie using the Movies tab.</p>
                    </div>
                  ) : (
                    movies.slice(0, 5).map((m) => (
                      <div key={m.id} className="flex items-center gap-4 py-3 border-b border-white/5 last:border-0">
                        <img src={m.poster_url} alt={m.title} className="w-10 h-14 object-cover rounded-lg" />
                        <div className="flex-1">
                          <p className="font-medium text-sm">{m.title}</p>
                          <p className="text-xs text-white/40">{m.genre} • {m.year}</p>
                        </div>
                        <span className="text-xs text-white/40">{formatViews(m.views)} views</span>
                      </div>
                    ))
                  )}
                </div>
              </div>
            )}

            {/* ── Movies Tab (only movies, not series) ── */}
            {tab === "movies" && (() => {
              const movieList = movies.filter(m => m.type !== "series");
              return (
                <div>
                  <div className="flex items-center justify-between mb-6">
                    <div>
                      <h2 className="font-bold text-lg">Movies ({movieList.length})</h2>
                      <p className="text-xs text-white/35 mt-0.5">Single films from Google Sheets</p>
                    </div>
                    <button
                      onClick={() => openAddForm("movie")}
                      className="flex items-center gap-2 bg-yellow-400 hover:bg-yellow-300 text-black font-bold px-4 py-2 rounded-lg text-sm transition-all"
                    >
                      <Plus className="w-4 h-4" /> Add Movie
                    </button>
                  </div>
                  {movieList.length === 0 ? (
                    <div className="text-center py-16 text-white/30">
                      <Film className="w-12 h-12 mx-auto mb-3 opacity-30" />
                      <p>No movies yet. Add one above.</p>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {movieList.map((m) => (
                        <div key={m.id} className="flex items-center gap-4 bg-white/5 border border-white/10 rounded-xl p-4 hover:border-white/20 transition-all">
                          <img src={m.poster_url} alt={m.title} className="w-12 h-16 object-cover rounded-lg flex-shrink-0 bg-white/5" />
                          <div className="flex-1 min-w-0">
                            <p className="font-bold truncate">{m.title}</p>
                            <p className="text-xs text-white/50">{m.genre} • {m.year} • {formatViews(m.views)} views</p>
                            <div className="flex flex-wrap gap-2 mt-1.5">
                              {m.rating && <span className="text-[10px] font-bold bg-yellow-400/10 text-yellow-400 px-2 py-0.5 rounded-full">IMDb {m.rating}</span>}
                              {m.dl_1080p && <span className="text-[10px] font-bold bg-green-400/10 text-green-400 px-2 py-0.5 rounded-full">1080p</span>}
                              {m.dl_2160p && <span className="text-[10px] font-bold bg-yellow-300/10 text-yellow-300 px-2 py-0.5 rounded-full">4K</span>}
                              {m.synopsis && <span className="text-[10px] font-bold bg-blue-400/10 text-blue-400 px-2 py-0.5 rounded-full">Synopsis</span>}
                              {m.cast && <span className="text-[10px] font-bold bg-purple-400/10 text-purple-400 px-2 py-0.5 rounded-full">Cast</span>}
                            </div>
                          </div>
                          <div className="flex items-center gap-2 flex-shrink-0">
                            <button onClick={() => openEditForm(m)} className="p-2 bg-white/10 hover:bg-white/20 rounded-lg text-white/70 hover:text-white transition-all" title="Edit">
                              <Pencil className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => handleDelete(m.id)}
                              className={`p-2 rounded-lg transition-all ${deleteConfirm === m.id ? "bg-red-500 text-white" : "bg-white/10 hover:bg-red-500/20 text-white/70 hover:text-red-400"}`}
                              title={deleteConfirm === m.id ? "Confirm delete?" : "Delete"}
                            >
                              {deleteConfirm === m.id ? <Check className="w-4 h-4" /> : <Trash2 className="w-4 h-4" />}
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })()}

            {/* ── TV Series Tab ── */}
            {tab === "series" && (() => {
              const seriesList = movies.filter(m => m.type === "series");
              return (
                <div>
                  <div className="flex items-center justify-between mb-6">
                    <div>
                      <h2 className="font-bold text-lg">TV Series ({seriesList.length})</h2>
                      <p className="text-xs text-white/35 mt-0.5">Multi-episode series from Google Sheets</p>
                    </div>
                    <button
                      onClick={() => openAddForm("series")}
                      className="flex items-center gap-2 bg-yellow-400 hover:bg-yellow-300 text-black font-bold px-4 py-2 rounded-lg text-sm transition-all"
                    >
                      <Plus className="w-4 h-4" /> Add TV Series
                    </button>
                  </div>
                  {seriesList.length === 0 ? (
                    <div className="text-center py-20 border border-dashed border-white/10 rounded-2xl">
                      <Play className="w-12 h-12 mx-auto mb-3 text-yellow-400/30" />
                      <p className="font-bold text-white/40">No TV series yet</p>
                      <p className="text-sm text-white/25 mt-1 mb-5">Add your first TV series with episode management</p>
                      <button
                        onClick={() => openAddForm("series")}
                        className="inline-flex items-center gap-2 bg-yellow-400 hover:bg-yellow-300 text-black font-bold px-5 py-2.5 rounded-xl text-sm transition-all"
                      >
                        <Plus className="w-4 h-4" /> Add TV Series
                      </button>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {seriesList.map((m) => {
                        const epCount = Array.isArray(m.episodes) ? m.episodes.length : 0;
                        const seasons = Array.isArray(m.episodes)
                          ? new Set(m.episodes.map(ep => ep.season)).size : 0;
                        return (
                          <div key={m.id} className="flex items-center gap-4 bg-white/5 border border-yellow-400/10 rounded-xl p-4 hover:border-yellow-400/25 transition-all">
                            <img src={m.poster_url} alt={m.title} className="w-12 h-16 object-cover rounded-lg flex-shrink-0 bg-white/5" />
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2">
                                <p className="font-bold truncate">{m.title}</p>
                                <span className="text-[10px] font-black bg-yellow-400/15 text-yellow-400 px-2 py-0.5 rounded-full flex-shrink-0">SERIES</span>
                              </div>
                              <p className="text-xs text-white/50">{m.genre} • {m.year} • {formatViews(m.views)} views</p>
                              <div className="flex flex-wrap gap-2 mt-1.5">
                                <span className="text-[10px] font-bold bg-yellow-400/10 text-yellow-400 px-2 py-0.5 rounded-full">{seasons} Season{seasons !== 1 ? "s" : ""}</span>
                                <span className="text-[10px] font-bold bg-white/8 text-white/50 px-2 py-0.5 rounded-full">{epCount} Episode{epCount !== 1 ? "s" : ""}</span>
                                {m.rating && <span className="text-[10px] font-bold bg-yellow-400/10 text-yellow-400 px-2 py-0.5 rounded-full">IMDb {m.rating}</span>}
                                {m.synopsis && <span className="text-[10px] font-bold bg-blue-400/10 text-blue-400 px-2 py-0.5 rounded-full">Synopsis</span>}
                              </div>
                            </div>
                            <div className="flex items-center gap-2 flex-shrink-0">
                              <button onClick={() => openEditForm(m)} className="p-2 bg-white/10 hover:bg-yellow-400/20 rounded-lg text-white/70 hover:text-yellow-400 transition-all" title="Edit series & episodes">
                                <Pencil className="w-4 h-4" />
                              </button>
                              <button
                                onClick={() => handleDelete(m.id)}
                                className={`p-2 rounded-lg transition-all ${deleteConfirm === m.id ? "bg-red-500 text-white" : "bg-white/10 hover:bg-red-500/20 text-white/70 hover:text-red-400"}`}
                                title={deleteConfirm === m.id ? "Confirm delete?" : "Delete series"}
                              >
                                {deleteConfirm === m.id ? <Check className="w-4 h-4" /> : <Trash2 className="w-4 h-4" />}
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })()}

            {/* ── Comments ── */}
            {tab === "comments" && (
              <div className="space-y-6">
                <h2 className="font-bold text-lg">Manage Comments</h2>
                {allCommentsMeta.length === 0 ? (
                  <div className="text-center py-16 text-white/30">
                    <MessageSquare className="w-12 h-12 mx-auto mb-3 opacity-30" />
                    <p>No comments yet across any movies.</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {allCommentsMeta.map(({ movieId, count }) => {
                      const isOpen = selectedCommentMovieId === movieId;
                      return (
                        <div key={movieId} className="bg-white/5 border border-white/10 rounded-xl overflow-hidden">
                          <button
                            onClick={() => isOpen ? setSelectedCommentMovieId(null) : selectCommentMovie(movieId)}
                            className="w-full flex items-center gap-4 p-4 hover:bg-white/5 transition-all text-left"
                          >
                            <MessageSquare className="w-5 h-5 text-yellow-400 flex-shrink-0" />
                            <div className="flex-1">
                              <p className="font-bold">{getMovieTitle(movieId)}</p>
                              <p className="text-xs text-white/40">{count} comment{count !== 1 ? "s" : ""}</p>
                            </div>
                            {isOpen ? <ChevronUp className="w-4 h-4 text-white/40" /> : <ChevronDown className="w-4 h-4 text-white/40" />}
                          </button>

                          {isOpen && (
                            <div className="border-t border-white/10 divide-y divide-white/5">
                              {viewedComments.length === 0 ? (
                                <p className="text-center text-white/30 text-sm py-6">No comments.</p>
                              ) : viewedComments.map((c) => (
                                <div key={c.id} className="p-4">
                                  <div className="flex items-start gap-3">
                                    <div className="w-8 h-8 rounded-full bg-yellow-400/15 flex items-center justify-center text-yellow-400 font-black text-xs flex-shrink-0">
                                      {c.user_name[0]?.toUpperCase()}
                                    </div>
                                    <div className="flex-1 min-w-0">
                                      <div className="flex items-center gap-2 mb-1">
                                        <span className="font-bold text-sm">{c.user_name}</span>
                                        {c.edited && <span className="text-xs text-white/30">(edited)</span>}
                                        <span className="text-xs text-white/30">{timeAgo(c.timestamp)}</span>
                                      </div>
                                      {editCommentId === c.id ? (
                                        <div className="space-y-2">
                                          <textarea
                                            value={editCommentContent}
                                            onChange={(e) => setEditCommentContent(e.target.value)}
                                            rows={2}
                                            className="w-full bg-white/10 border border-white/20 focus:border-yellow-400/60 text-white rounded-xl px-3 py-2 text-sm resize-none outline-none"
                                          />
                                          <div className="flex gap-2">
                                            <button onClick={() => handleSaveCommentEdit(c)} className="flex items-center gap-1 bg-yellow-400 text-black font-bold px-3 py-1.5 rounded-lg text-xs">
                                              <Check className="w-3 h-3" /> Save
                                            </button>
                                            <button onClick={() => setEditCommentId(null)} className="flex items-center gap-1 bg-white/10 text-white px-3 py-1.5 rounded-lg text-xs">
                                              <X className="w-3 h-3" /> Cancel
                                            </button>
                                          </div>
                                        </div>
                                      ) : (
                                        <p className="text-sm text-white/70 leading-relaxed">{c.content}</p>
                                      )}
                                    </div>
                                    {editCommentId !== c.id && (
                                      <div className="flex items-center gap-1.5 flex-shrink-0">
                                        <button
                                          onClick={() => { setEditCommentId(c.id); setEditCommentContent(c.content); }}
                                          className="p-1.5 bg-white/10 hover:bg-white/20 rounded-lg transition-all"
                                          title="Edit comment"
                                        >
                                          <Pencil className="w-3.5 h-3.5 text-white/60" />
                                        </button>
                                        <button
                                          onClick={() => handleDeleteComment(c)}
                                          className="p-1.5 bg-red-500/10 hover:bg-red-500/25 rounded-lg transition-all"
                                          title="Delete comment"
                                        >
                                          <Trash2 className="w-3.5 h-3.5 text-red-400" />
                                        </button>
                                      </div>
                                    )}
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {/* ── Users ── */}
            {tab === "users" && (
              <div>
                <h2 className="font-bold text-lg mb-6">Registered Users ({users.length})</h2>
                {users.length === 0 ? (
                  <div className="text-center py-16 text-white/40">
                    <Users className="w-12 h-12 mx-auto mb-4 opacity-30" />
                    <p>No users found. Connect the backend to view users.</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {users.map((u) => (
                      <div key={u.id} className="flex items-center gap-4 bg-white/5 border border-white/10 rounded-xl p-4">
                        <div className="w-10 h-10 rounded-full bg-yellow-400/20 flex items-center justify-center flex-shrink-0">
                          <span className="text-yellow-400 font-bold">{u.name[0]?.toUpperCase()}</span>
                        </div>
                        <div className="flex-1">
                          <p className="font-medium">{u.name}</p>
                          <p className="text-xs text-white/50">{u.email} • {u.country}</p>
                          <p className="text-xs text-white/30">Joined {formatDate(u.created_at)}</p>
                        </div>
                        {deleteConfirm === `user-${u.id}` ? (
                          <div className="flex items-center gap-2">
                            <span className="text-xs text-red-400">Delete?</span>
                            <button onClick={async () => { try { await api.deleteUser(u.id); setUsers(p => p.filter(x => x.id !== u.id)); } catch(e) { alert(e instanceof Error ? e.message : "Error"); } setDeleteConfirm(null); }} className="p-1.5 bg-red-500/20 hover:bg-red-500/40 text-red-400 rounded-lg transition-all"><Check className="w-4 h-4" /></button>
                            <button onClick={() => setDeleteConfirm(null)} className="p-1.5 bg-white/10 hover:bg-white/20 rounded-lg transition-all"><X className="w-4 h-4" /></button>
                          </div>
                        ) : (
                          <button onClick={() => setDeleteConfirm(`user-${u.id}`)} className="p-2 text-white/30 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-all"><Trash2 className="w-4 h-4" /></button>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* ── Logs ── */}
            {tab === "logs" && (
              <div>
                <h2 className="font-bold text-lg mb-6">Activity Logs</h2>
                {logs.length === 0 ? (
                  <div className="text-center py-16 text-white/40">
                    <Activity className="w-12 h-12 mx-auto mb-4 opacity-30" />
                    <p>No activity logs. Connect the backend to view logs.</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {logs.map((l) => (
                      <div key={l.id} className="flex items-center gap-4 bg-white/5 border border-white/10 rounded-lg p-3">
                        <div className="w-2 h-2 rounded-full bg-yellow-400 flex-shrink-0" />
                        <p className="text-sm flex-1">{l.action}</p>
                        <span className="text-xs text-white/30">{formatDate(l.timestamp)}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* ── Email ── */}
            {tab === "email" && (
              <div className="max-w-2xl">
                <h2 className="font-bold text-lg mb-2">Email Blast</h2>
                <p className="text-sm text-white/40 mb-6">Send a message to one user or all registered users. Emails are sent with the MOOVIED branded template.</p>

                <form onSubmit={handleSendEmail} className="space-y-5">
                  {/* Target */}
                  <div>
                    <label className="block text-xs font-semibold text-white/60 uppercase tracking-widest mb-3">Send To</label>
                    <div className="flex flex-wrap gap-3">
                      <button
                        type="button"
                        onClick={() => setEmailTarget("all")}
                        className={`px-4 py-2 rounded-lg text-sm font-semibold transition-all border ${
                          emailTarget === "all"
                            ? "bg-yellow-400 text-black border-yellow-400"
                            : "bg-white/5 border-white/10 text-white/60 hover:bg-white/10"
                        }`}
                      >
                        All Users ({users.length})
                      </button>
                      {users.map((u) => (
                        <button
                          key={u.id}
                          type="button"
                          onClick={() => setEmailTarget(u.id)}
                          className={`px-4 py-2 rounded-lg text-sm font-semibold transition-all border ${
                            emailTarget === u.id
                              ? "bg-white/20 text-white border-white/40"
                              : "bg-white/5 border-white/10 text-white/60 hover:bg-white/10"
                          }`}
                        >
                          {u.name || u.email}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Subject */}
                  <div>
                    <label className="block text-xs font-semibold text-white/60 uppercase tracking-widest mb-2">Subject</label>
                    <input
                      type="text"
                      value={emailSubject}
                      onChange={(e) => setEmailSubject(e.target.value)}
                      placeholder="Your email subject line..."
                      required
                      className="w-full bg-white/5 border border-white/10 focus:border-yellow-400/60 text-white placeholder:text-white/30 rounded-xl px-4 py-3 outline-none text-sm"
                    />
                  </div>

                  {/* Body */}
                  <div>
                    <label className="block text-xs font-semibold text-white/60 uppercase tracking-widest mb-2">Message Body</label>
                    <textarea
                      value={emailBody}
                      onChange={(e) => setEmailBody(e.target.value)}
                      placeholder={"Write your message here...\nSupports plain text. Line breaks are preserved."}
                      required
                      rows={8}
                      className="w-full bg-white/5 border border-white/10 focus:border-yellow-400/60 text-white placeholder:text-white/30 rounded-xl px-4 py-3 outline-none text-sm resize-none"
                    />
                    <p className="text-xs text-white/30 mt-1.5">The message is automatically wrapped in the MOOVIED branded email template.</p>
                  </div>

                  {/* Result */}
                  {emailResult && (
                    <div className={`rounded-xl px-4 py-3 text-sm flex items-center gap-3 border ${
                      emailResult.ok
                        ? "bg-green-500/10 border-green-500/30 text-green-400"
                        : "bg-red-500/10 border-red-500/30 text-red-400"
                    }`}>
                      {emailResult.ok ? <Check className="w-4 h-4 flex-shrink-0" /> : <X className="w-4 h-4 flex-shrink-0" />}
                      {emailResult.msg}
                    </div>
                  )}

                  {/* Send */}
                  <button
                    type="submit"
                    disabled={emailSending || !emailSubject.trim() || !emailBody.trim()}
                    className="w-full bg-yellow-400 hover:bg-yellow-300 disabled:opacity-50 disabled:cursor-not-allowed text-black font-black py-3.5 rounded-xl transition-all flex items-center justify-center gap-2 text-sm"
                  >
                    {emailSending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                    {emailSending
                      ? "Sending..."
                      : emailTarget === "all"
                        ? `Send to All ${users.length} Users`
                        : `Send to ${users.find(u => u.id === emailTarget)?.name || "User"}`
                    }
                  </button>
                </form>
              </div>
            )}

            {tab === "settings" && <SettingsTab />}
          </main>
        </div>
      </div>

      {/* ── Movie Form Modal ── */}
      {showForm && (
        <div className="fixed inset-0 bg-black/85 backdrop-blur-sm z-50 flex items-start justify-center p-4 overflow-y-auto">
          <div className="bg-[#111] border border-white/10 rounded-2xl w-full max-w-3xl my-4">
            {/* ── Modal Header ── */}
            <div className="sticky top-0 bg-[#111] rounded-t-2xl z-10 border-b border-white/10">
              <div className="flex items-center justify-between px-6 pt-5 pb-4">
                <div>
                  <h2 className="font-black text-lg leading-tight">
                    {editingMovie
                      ? (formType === "series" ? "Edit TV Series" : "Edit Movie")
                      : (formType === "series" ? "Add TV Series" : "Add New Movie")}
                  </h2>
                  <p className="text-xs text-white/35 mt-0.5">
                    {formType === "series"
                      ? "Add a TV series with multiple episodes"
                      : "Add a single movie with stream & download links"}
                  </p>
                </div>
                <button onClick={() => setShowForm(false)} className="p-2 hover:bg-white/10 rounded-lg transition-all ml-4 flex-shrink-0">
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Type Switch — large pill tabs */}
              <div className="flex px-6 pb-0 gap-0">
                {([
                  ["movie", "Movie", "Single film with one video link"],
                  ["series", "TV Series", "Multi-episode series with per-episode videos"],
                ] as const).map(([t, label, sub]) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setFormType(t)}
                    className="flex-1 flex flex-col items-center gap-0.5 py-3 border-b-2 transition-all text-center"
                    style={{
                      borderBottomColor: formType === t ? "#FACC15" : "transparent",
                      color: formType === t ? "#FACC15" : "rgba(255,255,255,0.35)",
                    }}
                  >
                    <span className="text-sm font-black">{label}</span>
                    <span className="text-[10px] leading-tight" style={{ color: formType === t ? "rgba(250,204,21,0.55)" : "rgba(255,255,255,0.2)" }}>{sub}</span>
                  </button>
                ))}
              </div>
            </div>

            <form onSubmit={handleFormSubmit} className="p-6 space-y-8">
              {formError && (
                <div className="bg-red-500/10 border border-red-500/30 text-red-400 text-sm rounded-lg px-4 py-3">
                  {formError}
                </div>
              )}

              {/* Section: Basic Info */}
              <FormSection label="Basic Info">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <Field label={formType === "series" ? "Series Title *" : "Title *"} value={form.title} onChange={v => setForm(f => ({ ...f, title: v }))} placeholder={formType === "series" ? "Series title" : "Movie title"} />
                  <Field label="Genre" value={form.genre} onChange={v => setForm(f => ({ ...f, genre: v }))} placeholder="Action, Sci-Fi, ..." />
                  <Field label="Year" value={form.year} onChange={v => setForm(f => ({ ...f, year: v }))} placeholder="2024" />
                  <Field label={formType === "series" ? "Season Count / Episodes" : "Runtime"} value={form.runtime} onChange={v => setForm(f => ({ ...f, runtime: v }))} placeholder={formType === "series" ? "e.g. 2 Seasons • 24 Episodes" : "2h 15m"} />
                </div>
                <Field label="Short Description" value={form.description} onChange={v => setForm(f => ({ ...f, description: v }))} placeholder="Short description shown in cards..." multiline rows={3} />
              </FormSection>

              {/* Section: Synopsis */}
              <FormSection label="Synopsis">
                <Field label="Full Synopsis" value={form.synopsis} onChange={v => setForm(f => ({ ...f, synopsis: v }))} placeholder="Write the full movie synopsis here..." multiline rows={6} />
              </FormSection>

              {/* Section: Ratings */}
              <FormSection label="Ratings">
                <div className="grid grid-cols-3 gap-4">
                  <Field label="IMDb Rating" value={String(form.rating)} onChange={v => setForm(f => ({ ...f, rating: v as unknown as number }))} placeholder="8.5 (0-10)" />
                  <Field label="TMDB Rating" value={form.tmdb_rating} onChange={v => setForm(f => ({ ...f, tmdb_rating: v }))} placeholder="7.9 (0-10)" />
                  <Field label="Rotten Tomatoes %" value={form.rt_rating} onChange={v => setForm(f => ({ ...f, rt_rating: v }))} placeholder="84 (0-100)" />
                </div>
              </FormSection>

              {/* Section: Media Links */}
              <FormSection label="Media Links">
                <Field label="Poster / Thumbnail URL *" value={form.poster_url} onChange={v => setForm(f => ({ ...f, poster_url: v }))} placeholder="https://..." />

                {formType === "movie" ? (
                  <>
                    <Field label="Video / Stream URL *" value={form.video_url} onChange={v => setForm(f => ({ ...f, video_url: v }))} placeholder="https://..." />

                    {/* Unlimited subtitles */}
                    <div>
                      <label className="block text-xs font-medium text-white/60 mb-1.5">
                        Subtitles — Unlimited tracks
                        <span className="ml-2 text-yellow-400 font-bold">Label | URL</span>
                        <span className="ml-1 text-white/30">— one per line</span>
                      </label>
                      <textarea
                        value={form.subtitle_url}
                        onChange={(e) => setForm(f => ({ ...f, subtitle_url: e.target.value }))}
                        rows={4}
                        placeholder={"English | https://example.com/en.vtt\nSinhala | https://example.com/si.vtt\nFrench | https://example.com/fr.vtt"}
                        className="w-full bg-white/10 border border-white/20 focus:border-yellow-400/60 text-white placeholder:text-white/30 rounded-lg px-3 py-2 outline-none text-sm resize-none font-mono"
                      />
                      <p className="text-xs text-white/25 mt-1">
                        Each subtitle track: <code className="text-yellow-400/70">Language Name | https://url-to-file.vtt</code> — all tracks appear in player. A single bare URL also works.
                      </p>
                    </div>

                    <Field label="General Download URL" value={form.download_url} onChange={v => setForm(f => ({ ...f, download_url: v }))} placeholder="https://..." />
                  </>
                ) : (
                  <div className="flex items-start gap-3 rounded-xl px-4 py-3 bg-yellow-400/6 border border-yellow-400/20">
                    <span className="text-yellow-400 text-lg mt-0.5">&#9432;</span>
                    <p className="text-sm text-yellow-400/80 leading-snug">
                      For TV Series, video URLs, subtitles, and download links are set <strong>per episode</strong> in the Episodes section below.
                    </p>
                  </div>
                )}

                <Field label="YouTube Trailer Link" value={form.yt_link} onChange={v => setForm(f => ({ ...f, yt_link: v }))} placeholder="https://youtube.com/watch?v=..." />
              </FormSection>

              {/* Section: Download by Quality — movies only */}
              {formType === "movie" && (
                <FormSection label="Download Links by Quality">
                  <p className="text-xs text-white/40 mb-3">Leave blank for qualities you don't have. Only filled links will be shown to users.</p>
                  <div className="space-y-3">
                    {[
                      { label: "4K 2160p", key: "dl_2160p" as const, color: "#F5C518" },
                      { label: "1080p Full HD", key: "dl_1080p" as const, color: "#4ade80" },
                      { label: "720p HD", key: "dl_720p" as const, color: "#60a5fa" },
                      { label: "480p SD", key: "dl_480p" as const, color: "#a78bfa" },
                      { label: "360p Low", key: "dl_360p" as const, color: "#94a3b8" },
                    ].map(({ label, key, color }) => (
                      <div key={key} className="flex items-center gap-3">
                        <span className="text-xs font-black w-24 flex-shrink-0 px-2 py-1 rounded-lg text-center" style={{ background: `${color}20`, color }}>
                          {label.split(" ")[0]}
                        </span>
                        <input
                          type="text"
                          value={form[key]}
                          onChange={(e) => setForm(f => ({ ...f, [key]: e.target.value }))}
                          placeholder={`${label} download link...`}
                          className="flex-1 bg-white/10 border border-white/20 focus:border-yellow-400/60 text-white placeholder:text-white/30 rounded-lg px-3 py-2 outline-none text-sm"
                        />
                      </div>
                    ))}
                  </div>
                </FormSection>
              )}

              {/* Section: Director & Cast */}
              <FormSection label="Director & Cast">
                <div className="grid grid-cols-2 gap-4">
                  <Field label="Director Name" value={form.director} onChange={v => setForm(f => ({ ...f, director: v }))} placeholder="Director name" />
                  <Field label="Director Image URL" value={form.director_image} onChange={v => setForm(f => ({ ...f, director_image: v }))} placeholder="https://..." />
                </div>
                <div>
                  <label className="block text-xs font-medium text-white/60 mb-1.5">
                    Cast (up to 5) — one per line: <span className="text-yellow-400">Name | Image URL | Character Role</span>
                  </label>
                  <textarea
                    value={form.cast}
                    onChange={(e) => setForm(f => ({ ...f, cast: e.target.value }))}
                    rows={6}
                    placeholder={"Tom Hardy | https://img.com/tom.jpg | Captain\nScarlett Johansson | https://img.com/scar.jpg | Lead Scientist"}
                    className="w-full bg-white/10 border border-white/20 focus:border-yellow-400/60 text-white placeholder:text-white/30 rounded-lg px-3 py-2 outline-none text-sm resize-none font-mono"
                  />
                </div>
              </FormSection>

              {/* Section: Gallery */}
              <FormSection label="Gallery Images (up to 5)">
                <div>
                  <label className="block text-xs font-medium text-white/60 mb-1.5">
                    Paste image URLs separated by commas or one per line
                  </label>
                  <textarea
                    value={form.gallery}
                    onChange={(e) => setForm(f => ({ ...f, gallery: e.target.value }))}
                    rows={4}
                    placeholder={"https://img1.com/scene1.jpg, https://img2.com/scene2.jpg, ..."}
                    className="w-full bg-white/10 border border-white/20 focus:border-yellow-400/60 text-white placeholder:text-white/30 rounded-lg px-3 py-2 outline-none text-sm resize-none"
                  />
                  <p className="text-xs text-white/30 mt-1">Images hover to show dark overlay with "MOOVIED" watermark.</p>
                </div>
              </FormSection>

              {/* Section: Episodes (TV Series only) */}
              {formType === "series" && (
                <FormSection label={`Episodes (${formEpisodes.length})`}>
                  <p className="text-xs text-white/35 -mt-2 mb-3">Add each episode with its own video, download link, and subtitles.</p>

                  {/* Episode list */}
                  <div className="space-y-2">
                    {formEpisodes.map((ep, idx) => (
                      <div key={ep.id} className="border border-white/10 rounded-xl overflow-hidden">
                        {/* Episode header */}
                        <div className="flex items-center gap-3 px-4 py-3 bg-white/4">
                          <span className="text-xs font-black text-yellow-400 w-14 flex-shrink-0">
                            S{ep.season}E{String(ep.episode).padStart(2,"0")}
                          </span>
                          <span className="flex-1 text-sm font-medium truncate text-white/80">{ep.title || "Untitled Episode"}</span>
                          {ep.duration && <span className="text-xs text-white/30 flex-shrink-0">{ep.duration}</span>}
                          <button
                            type="button"
                            onClick={() => setExpandedEp(expandedEp === ep.id ? null : ep.id)}
                            className="p-1 hover:bg-white/10 rounded-lg transition-all flex-shrink-0"
                          >
                            {expandedEp === ep.id ? <ChevronUp className="w-4 h-4 text-white/50" /> : <ChevronDown className="w-4 h-4 text-white/50" />}
                          </button>
                          <button
                            type="button"
                            onClick={() => setFormEpisodes(prev => prev.filter((_, i) => i !== idx))}
                            className="p-1 hover:bg-red-500/20 rounded-lg transition-all flex-shrink-0"
                          >
                            <Trash2 className="w-3.5 h-3.5 text-red-400/60 hover:text-red-400" />
                          </button>
                        </div>

                        {/* Episode fields (expanded) */}
                        {expandedEp === ep.id && (
                          <div className="p-4 space-y-3 border-t border-white/8">
                            <div className="grid grid-cols-3 gap-3">
                              <div>
                                <label className="block text-xs text-white/50 mb-1">Season</label>
                                <input type="number" min={1} value={ep.season}
                                  onChange={e => setFormEpisodes(prev => prev.map((x,i) => i===idx ? {...x,season:Number(e.target.value)} : x))}
                                  className="w-full bg-white/10 border border-white/20 focus:border-yellow-400/60 text-white rounded-lg px-3 py-2 outline-none text-sm" />
                              </div>
                              <div>
                                <label className="block text-xs text-white/50 mb-1">Episode #</label>
                                <input type="number" min={1} value={ep.episode}
                                  onChange={e => setFormEpisodes(prev => prev.map((x,i) => i===idx ? {...x,episode:Number(e.target.value)} : x))}
                                  className="w-full bg-white/10 border border-white/20 focus:border-yellow-400/60 text-white rounded-lg px-3 py-2 outline-none text-sm" />
                              </div>
                              <div>
                                <label className="block text-xs text-white/50 mb-1">Duration</label>
                                <input type="text" value={ep.duration||""} placeholder="42m"
                                  onChange={e => setFormEpisodes(prev => prev.map((x,i) => i===idx ? {...x,duration:e.target.value} : x))}
                                  className="w-full bg-white/10 border border-white/20 focus:border-yellow-400/60 text-white placeholder:text-white/25 rounded-lg px-3 py-2 outline-none text-sm" />
                              </div>
                            </div>
                            <div>
                              <label className="block text-xs text-white/50 mb-1">Episode Title *</label>
                              <input type="text" value={ep.title} placeholder="Episode title"
                                onChange={e => setFormEpisodes(prev => prev.map((x,i) => i===idx ? {...x,title:e.target.value} : x))}
                                className="w-full bg-white/10 border border-white/20 focus:border-yellow-400/60 text-white placeholder:text-white/25 rounded-lg px-3 py-2 outline-none text-sm" />
                            </div>
                            <div>
                              <label className="block text-xs text-white/50 mb-1">Thumbnail URL</label>
                              <input type="text" value={ep.thumbnail||""} placeholder="https://..."
                                onChange={e => setFormEpisodes(prev => prev.map((x,i) => i===idx ? {...x,thumbnail:e.target.value} : x))}
                                className="w-full bg-white/10 border border-white/20 focus:border-yellow-400/60 text-white placeholder:text-white/25 rounded-lg px-3 py-2 outline-none text-sm" />
                            </div>
                            <div>
                              <label className="block text-xs text-white/50 mb-1">Video / Stream URL *</label>
                              <input type="text" value={ep.video_url} placeholder="https://..."
                                onChange={e => setFormEpisodes(prev => prev.map((x,i) => i===idx ? {...x,video_url:e.target.value} : x))}
                                className="w-full bg-white/10 border border-white/20 focus:border-yellow-400/60 text-white placeholder:text-white/25 rounded-lg px-3 py-2 outline-none text-sm" />
                            </div>
                            <div>
                              <label className="block text-xs text-white/50 mb-1">Download URL</label>
                              <input type="text" value={ep.download_url||""} placeholder="https://..."
                                onChange={e => setFormEpisodes(prev => prev.map((x,i) => i===idx ? {...x,download_url:e.target.value} : x))}
                                className="w-full bg-white/10 border border-white/20 focus:border-yellow-400/60 text-white placeholder:text-white/25 rounded-lg px-3 py-2 outline-none text-sm" />
                            </div>
                            <div>
                              <label className="block text-xs text-white/50 mb-1">
                                Subtitles <span className="text-yellow-400">Label | URL</span> — one per line
                              </label>
                              <textarea value={ep.subtitle_url||""} rows={3} placeholder={"English | https://url.vtt\nSinhala | https://url.vtt"}
                                onChange={e => setFormEpisodes(prev => prev.map((x,i) => i===idx ? {...x,subtitle_url:e.target.value} : x))}
                                className="w-full bg-white/10 border border-white/20 focus:border-yellow-400/60 text-white placeholder:text-white/25 rounded-lg px-3 py-2 outline-none text-sm resize-none font-mono" />
                            </div>
                            <div>
                              <label className="block text-xs text-white/50 mb-1">Episode Description</label>
                              <textarea value={ep.description||""} rows={2} placeholder="Brief episode description..."
                                onChange={e => setFormEpisodes(prev => prev.map((x,i) => i===idx ? {...x,description:e.target.value} : x))}
                                className="w-full bg-white/10 border border-white/20 focus:border-yellow-400/60 text-white placeholder:text-white/25 rounded-lg px-3 py-2 outline-none text-sm resize-none" />
                            </div>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>

                  {/* Add Episode button */}
                  <button
                    type="button"
                    onClick={() => {
                      const ep = makeBlankEpisode();
                      setFormEpisodes(prev => [...prev, ep]);
                      setExpandedEp(ep.id);
                    }}
                    className="w-full flex items-center justify-center gap-2 py-3 border border-dashed border-white/20 hover:border-yellow-400/40 hover:bg-yellow-400/4 rounded-xl text-sm text-white/40 hover:text-yellow-400 transition-all"
                  >
                    <Plus className="w-4 h-4" /> Add Episode
                  </button>
                </FormSection>
              )}

              <div className="flex gap-3 pt-2 sticky bottom-0 bg-[#111] pb-1">
                <button type="button" onClick={() => setShowForm(false)} className="flex-1 bg-white/10 hover:bg-white/20 text-white font-medium py-2.5 rounded-lg transition-all text-sm">
                  Cancel
                </button>
                <button type="submit" disabled={formLoading} className="flex-1 bg-yellow-400 hover:bg-yellow-300 disabled:opacity-50 text-black font-bold py-2.5 rounded-lg transition-all text-sm flex items-center justify-center gap-2">
                  {formLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                  {editingMovie ? "Save Changes" : formType === "series" ? "Add Series" : "Add Movie"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Reusable form helpers ─────────────────────────────────────────────────────
function FormSection({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 pb-2 border-b border-white/8">
        <div className="w-1 h-4 rounded-full bg-yellow-400" />
        <h3 className="text-sm font-black text-yellow-400 uppercase tracking-wider">{label}</h3>
      </div>
      {children}
    </div>
  );
}

function Field({
  label, value, onChange, placeholder, multiline, rows,
}: {
  label: string; value: string; onChange: (v: string) => void; placeholder?: string; multiline?: boolean; rows?: number;
}) {
  const cls = "w-full bg-white/10 border border-white/20 focus:border-yellow-400/60 text-white placeholder:text-white/30 rounded-lg px-3 py-2 outline-none text-sm";
  return (
    <div>
      <label className="block text-xs font-medium text-white/60 mb-1.5">{label}</label>
      {multiline ? (
        <textarea value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} rows={rows || 3} className={`${cls} resize-none`} />
      ) : (
        <input type="text" value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} className={cls} />
      )}
    </div>
  );
}

// ── Settings Tab ──────────────────────────────────────────────────────────────
type ConnStatus = "idle" | "testing" | "ok" | "error";

function SettingsTab() {
  const [url, setUrl] = useState(getGasUrl());
  const [secret, setSecret] = useState(getGasSecret());
  const [commentsApiUrl, setCommentsApiUrlState] = useState(getCommentsApiUrl());
  const [saved, setSaved] = useState(false);
  const [apiSaved, setApiSaved] = useState(false);
  const [connStatus, setConnStatus] = useState<ConnStatus>("idle");
  const [connMsg, setConnMsg] = useState("");
  const [cacheCleared, setCacheCleared] = useState(false);

  const handleSave = () => {
    setGasUrl(url); setGasSecret(secret); setSaved(true); setConnStatus("idle");
    setTimeout(() => setSaved(false), 2000);
  };

  const handleApiUrlSave = () => {
    setCommentsApiUrl(commentsApiUrl.replace(/\/$/, ""));
    setApiSaved(true);
    setTimeout(() => setApiSaved(false), 2000);
  };

  const handleClearCache = () => {
    invalidateCache();
    // Also clear any stale movie meta
    Object.keys(localStorage).filter(k => k.startsWith("moovied_")).forEach(k => {
      if (k !== "moovied_gas_url" && k !== "moovied_gas_secret" && k !== "moovied_comments_api_url") {
        localStorage.removeItem(k);
      }
    });
    setCacheCleared(true);
    setTimeout(() => { setCacheCleared(false); window.location.reload(); }, 800);
  };

  const testConnection = async () => {
    if (!url) { setConnStatus("error"); setConnMsg("No URL entered."); return; }
    setConnStatus("testing"); setConnMsg("");
    try {
      const qs = new URLSearchParams({ action: "getAllData" }).toString();
      const res = await fetch(`${url}?${qs}`);
      if (!res.ok) throw new Error(`HTTP ${res.status} — check that your GAS deployment is set to "Access: Anyone"`);
      const data = await res.json();
      if (data.success) {
        const movies = data.movies ?? [];
        const movieCount = movies.filter((m: { type?: string }) => m.type !== "series").length;
        const seriesCount = movies.filter((m: { type?: string }) => m.type === "series").length;
        setConnStatus("ok");
        setConnMsg(`Connected! Found ${movieCount} movie(s) and ${seriesCount} TV series in your Google Sheet.`);
      } else {
        setConnStatus("error");
        setConnMsg(`GAS error: ${data.error || "Unknown error. Check the SPREADSHEET_ID in code.gs."}`);
      }
    } catch (e) {
      setConnStatus("error");
      const msg = e instanceof Error ? e.message : "Connection failed.";
      setConnMsg(`${msg} — Make sure GAS is deployed as: Execute as Me | Access: Anyone`);
    }
  };

  const currentSheetId = "14Flm-LOjocdd6vBLm5Z3c5GeIW5_W_7mVNikUSubIiI";

  return (
    <div className="max-w-lg space-y-6">

      {/* Cache clear — most common fix */}
      <div className="bg-red-500/5 border border-red-500/20 rounded-xl p-5 flex items-start gap-4">
        <div className="flex-1">
          <h3 className="font-bold text-red-400 mb-1">Movies not showing? Clear Cache first</h3>
          <p className="text-sm text-white/50">Clears all locally cached data and forces a fresh reload from Google Sheets.</p>
        </div>
        <button
          onClick={handleClearCache}
          className={`flex-shrink-0 font-bold py-2 px-4 rounded-lg text-sm transition-all ${cacheCleared ? "bg-green-500 text-white" : "bg-red-500 hover:bg-red-400 text-white"}`}
        >
          {cacheCleared ? "Cleared!" : "Clear Cache & Reload"}
        </button>
      </div>

      <div>
        <h2 className="font-bold text-lg mb-1">Google Sheets Connection</h2>
        <p className="text-sm text-white/50 mb-4">All movie and TV series data is saved to your Google Sheet automatically.</p>

        {/* Current sheet info */}
        <div className="mb-4 p-3 bg-yellow-400/5 border border-yellow-400/20 rounded-lg text-xs text-yellow-300/80 break-all">
          <span className="font-bold text-yellow-400">Active Sheet ID: </span>{currentSheetId}
          <br />
          <a
            href={`https://docs.google.com/spreadsheets/d/${currentSheetId}`}
            target="_blank"
            rel="noopener noreferrer"
            className="underline opacity-70 hover:opacity-100 mt-1 inline-block"
          >
            Open Google Sheet
          </a>
        </div>

        {connStatus !== "idle" && (
          <div className={`mb-4 rounded-xl px-4 py-3 text-sm flex items-start gap-3 border ${
            connStatus === "ok" ? "bg-green-500/10 border-green-500/30 text-green-400" :
            connStatus === "error" ? "bg-red-500/10 border-red-500/30 text-red-400" :
            "bg-yellow-400/10 border-yellow-400/30 text-yellow-300"
          }`}>
            {connStatus === "testing" && <Loader2 className="w-4 h-4 animate-spin flex-shrink-0 mt-0.5" />}
            {connStatus === "ok" && <CheckIcon className="w-4 h-4 flex-shrink-0 mt-0.5" />}
            {connStatus === "error" && <X className="w-4 h-4 flex-shrink-0 mt-0.5" />}
            <span>{connStatus === "testing" ? "Testing connection..." : connMsg}</span>
          </div>
        )}
        <div className="bg-white/5 border border-white/10 rounded-xl p-6 space-y-4">
          <div>
            <label className="block text-sm font-medium text-white/70 mb-2">Google Apps Script Web App URL</label>
            <input type="url" value={url} onChange={(e) => { setUrl(e.target.value); setConnStatus("idle"); }} placeholder="https://script.google.com/macros/s/..." className="w-full bg-white/10 border border-white/20 focus:border-yellow-400/60 text-white placeholder:text-white/30 rounded-lg px-4 py-3 outline-none text-sm" />
          </div>
          <div>
            <label className="block text-sm font-medium text-white/70 mb-2">Admin Secret Key <span className="text-white/30">(optional)</span></label>
            <input type="password" value={secret} onChange={(e) => setSecret(e.target.value)} placeholder="Leave blank if not set in code.gs" className="w-full bg-white/10 border border-white/20 focus:border-yellow-400/60 text-white placeholder:text-white/30 rounded-lg px-4 py-3 outline-none text-sm" />
          </div>
          <div className="flex gap-3">
            <button onClick={testConnection} disabled={connStatus === "testing"} className="flex-1 bg-white/10 hover:bg-white/20 disabled:opacity-50 text-white font-medium py-2.5 rounded-lg transition-all text-sm flex items-center justify-center gap-2">
              {connStatus === "testing" ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
              Test Connection
            </button>
            <button onClick={handleSave} className={`flex-1 font-bold py-2.5 rounded-lg transition-all text-sm ${saved ? "bg-green-500 text-white" : "bg-yellow-400 hover:bg-yellow-300 text-black"}`}>
              {saved ? "Saved!" : "Save Settings"}
            </button>
          </div>
        </div>
      </div>
      <div>
        <h2 className="font-bold text-lg mb-2">Comment Backend</h2>
        <p className="text-sm text-white/50 mb-4">Comments are stored in a real PostgreSQL database (Replit). Update this URL if your Replit domain changes.</p>
        <div className="bg-white/5 border border-white/10 rounded-xl p-6 space-y-4">
          <div>
            <label className="block text-sm font-medium text-white/70 mb-2">Comments API Base URL</label>
            <input type="url" value={commentsApiUrl} onChange={(e) => setCommentsApiUrlState(e.target.value)} placeholder="https://....replit.dev/api" className="w-full bg-white/10 border border-white/20 focus:border-yellow-400/60 text-white placeholder:text-white/30 rounded-lg px-4 py-3 outline-none text-sm" />
          </div>
          <button onClick={handleApiUrlSave} className={`w-full font-bold py-2.5 rounded-lg transition-all text-sm ${apiSaved ? "bg-green-500 text-white" : "bg-yellow-400 hover:bg-yellow-300 text-black"}`}>
            {apiSaved ? "Saved!" : "Save API URL"}
          </button>
        </div>
      </div>

      <div className="bg-white/5 border border-white/10 rounded-xl p-6">
        <h3 className="font-bold mb-3 flex items-center gap-2"><Upload className="w-4 h-4 text-yellow-400" /> Setup Steps</h3>
        <ol className="space-y-2.5 text-sm text-white/60">
          {[
            "Open Google Sheet → Extensions → Apps Script",
            "Replace ALL code in the editor with the code.gs file",
            "The SPREADSHEET_ID in code.gs is already set to your sheet",
            "Run setupSheets() once (Run menu → Run function → setupSheets)",
            "Deploy → New Deployment → Web App → Execute as: Me → Access: Anyone",
            "Paste the Web App URL above → Save Settings → Test Connection",
            "If you update code later: Deploy → Manage Deployments → Edit (pencil) → New Version → Deploy",
          ].map((step, i) => (
            <li key={i} className="flex gap-2">
              <span className="text-yellow-400 font-bold flex-shrink-0">{i + 1}.</span>{step}
            </li>
          ))}
        </ol>
        <div className="mt-4 p-3 bg-yellow-400/5 border border-yellow-400/20 rounded-lg text-xs text-yellow-300/80">
          If data still does not load after setup, use "Clear Cache &amp; Reload" at the top of this page.
        </div>
      </div>
    </div>
  );
}
