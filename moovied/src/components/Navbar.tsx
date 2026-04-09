import { useState, useEffect, useRef } from "react";
import { Link, useLocation } from "wouter";
import {
  Search, X, Menu, User, LogOut, Settings,
  Bookmark, Home, Film, Flame, Star, Clock,
  ChevronDown, ChevronRight, Shield,
} from "lucide-react";
import { getCurrentUser, logout } from "@/lib/auth";

interface NavbarProps {
  onSearch?: (query: string) => void;
  searchQuery?: string;
}

const GENRES = ["Action", "Comedy", "Drama", "Horror", "Sci-Fi", "Thriller", "Adventure", "Romance", "Animation"];

const NAV_LINKS = [
  { href: "/", label: "Home", icon: <Home className="w-4 h-4" /> },
  { href: "/movies", label: "Movies", icon: <Film className="w-4 h-4" /> },
  { href: "/movies?sort=views", label: "Trending", icon: <Flame className="w-4 h-4" /> },
  { href: "/movies?sort=rating", label: "Top Rated", icon: <Star className="w-4 h-4" /> },
  { href: "/movies?sort=year", label: "New Releases", icon: <Clock className="w-4 h-4" /> },
];

function Logo() {
  return (
    <Link href="/" className="flex-shrink-0">
      <span className="text-2xl font-black tracking-widest text-white select-none">
        MOOV<span className="text-yellow-400">IED</span>
      </span>
    </Link>
  );
}

export default function Navbar({ onSearch, searchQuery }: NavbarProps) {
  const [scrolled, setScrolled] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [localQuery, setLocalQuery] = useState(searchQuery || "");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [genreOpen, setGenreOpen] = useState(false);
  const [sidebarGenreOpen, setSidebarGenreOpen] = useState(false);
  const [location, navigate] = useLocation();
  const user = getCurrentUser();
  const userMenuRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const handleScroll = () => setScrolled(window.scrollY > 50);
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  useEffect(() => {
    setLocalQuery(searchQuery || "");
  }, [searchQuery]);

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (userMenuRef.current && !userMenuRef.current.contains(e.target as Node)) {
        setUserMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  // Prevent body scroll when sidebar is open
  useEffect(() => {
    document.body.style.overflow = sidebarOpen ? "hidden" : "";
    return () => { document.body.style.overflow = ""; };
  }, [sidebarOpen]);

  useEffect(() => {
    if (searchOpen) setTimeout(() => searchRef.current?.focus(), 50);
  }, [searchOpen]);

  const handleSearch = (q: string) => {
    setLocalQuery(q);
    if (onSearch) onSearch(q);
    else if (q) navigate("/movies?search=" + encodeURIComponent(q));
  };

  const handleLogout = () => {
    logout();
    setSidebarOpen(false);
    setUserMenuOpen(false);
    navigate("/");
    window.location.reload();
  };

  const closeSidebar = () => setSidebarOpen(false);

  const isActive = (href: string) => {
    if (href === "/") return location === "/";
    return location.startsWith(href.split("?")[0]);
  };

  return (
    <>
      {/* ── HEADER ── */}
      <nav
        className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${
          scrolled
            ? "bg-black/98 backdrop-blur-xl shadow-lg shadow-black/60"
            : "bg-gradient-to-b from-black/90 to-transparent"
        }`}
      >
        <div className="max-w-screen-2xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">

            {/* LEFT: Hamburger + Logo + Nav slider */}
            <div className="flex items-center gap-3 lg:gap-6 flex-1 min-w-0">

              {/* Hamburger — visible on ALL devices */}
              <button
                onClick={() => setSidebarOpen(true)}
                className="flex-shrink-0 p-2 -ml-1 text-white/80 hover:text-yellow-400 transition-colors"
                aria-label="Open menu"
              >
                <Menu className="w-6 h-6" />
              </button>

              <div className="flex-shrink-0">
                <Logo />
              </div>

              {/* Nav links — slider on tablet, full row on PC */}
              <div className="hidden md:flex items-center gap-1 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden flex-1 min-w-0">
                {NAV_LINKS.map((link) => (
                  <Link
                    key={link.href}
                    href={link.href}
                    className={`px-3 py-2 rounded-lg text-sm font-medium transition-all whitespace-nowrap ${
                      isActive(link.href)
                        ? "text-yellow-400"
                        : "text-white/70 hover:text-white hover:bg-white/5"
                    }`}
                  >
                    {link.label}
                  </Link>
                ))}

                {/* Genre dropdown */}
                <div className="relative">
                  <button
                    onClick={() => setGenreOpen((v) => !v)}
                    className="flex items-center gap-1 px-3 py-2 rounded-lg text-sm font-medium text-white/70 hover:text-white hover:bg-white/5 transition-all whitespace-nowrap"
                  >
                    Browse Genres <ChevronDown className={`w-3.5 h-3.5 transition-transform ${genreOpen ? "rotate-180" : ""}`} />
                  </button>
                  {genreOpen && (
                    <div className="absolute top-full left-0 mt-1 w-52 bg-gray-950/98 backdrop-blur-md border border-white/10 rounded-xl shadow-2xl overflow-hidden z-50">
                      <div className="p-2 grid grid-cols-2 gap-1">
                        {GENRES.map((g) => (
                          <Link
                            key={g}
                            href={`/movies?genre=${g}`}
                            onClick={() => setGenreOpen(false)}
                            className="px-3 py-2 text-sm text-white/70 hover:text-yellow-400 hover:bg-yellow-400/5 rounded-lg transition-colors"
                          >
                            {g}
                          </Link>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                {user && (
                  <Link
                    href="/profile"
                    className={`px-3 py-2 rounded-lg text-sm font-medium transition-all whitespace-nowrap ${
                      isActive("/profile")
                        ? "text-yellow-400"
                        : "text-white/70 hover:text-white hover:bg-white/5"
                    }`}
                  >
                    My List
                  </Link>
                )}
              </div>
            </div>

            {/* RIGHT: Search + User */}
            <div className="flex items-center gap-2 flex-shrink-0">
              {/* Search */}
              {searchOpen ? (
                <div className="flex items-center gap-2 bg-black/80 border border-yellow-400/40 rounded-full px-4 py-2 w-48 sm:w-64 transition-all">
                  <Search className="w-4 h-4 text-yellow-400 flex-shrink-0" />
                  <input
                    ref={searchRef}
                    type="text"
                    placeholder="Search movies..."
                    value={localQuery}
                    onChange={(e) => handleSearch(e.target.value)}
                    onKeyDown={(e) => e.key === "Escape" && setSearchOpen(false)}
                    className="bg-transparent text-white text-sm w-full outline-none placeholder:text-white/40"
                  />
                  <button onClick={() => { setSearchOpen(false); handleSearch(""); }}>
                    <X className="w-4 h-4 text-white/50 hover:text-white" />
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => setSearchOpen(true)}
                  className="p-2 text-white/70 hover:text-yellow-400 transition-colors"
                  aria-label="Search"
                >
                  <Search className="w-5 h-5" />
                </button>
              )}

              {/* User menu (desktop) */}
              {user ? (
                <div ref={userMenuRef} className="relative">
                  <button
                    onClick={() => setUserMenuOpen((v) => !v)}
                    className="flex items-center gap-2 bg-white/5 hover:bg-yellow-400/10 border border-white/10 hover:border-yellow-400/30 rounded-full pl-1 pr-3 py-1 transition-all"
                  >
                    <div className="w-7 h-7 rounded-full bg-yellow-400 flex items-center justify-center flex-shrink-0">
                      <span className="text-xs font-black text-black">{user.name[0]?.toUpperCase()}</span>
                    </div>
                    <span className="hidden sm:block text-sm text-white/80 max-w-28 truncate">{user.name}</span>
                    <ChevronDown className={`hidden sm:block w-3 h-3 text-white/40 transition-transform ${userMenuOpen ? "rotate-180" : ""}`} />
                  </button>

                  {userMenuOpen && (
                    <div className="absolute right-0 mt-2 w-56 bg-gray-950/98 backdrop-blur-md border border-white/10 rounded-2xl shadow-2xl overflow-hidden z-50">
                      <div className="px-4 py-3 bg-yellow-400/5 border-b border-white/10">
                        <p className="text-sm font-bold text-white truncate">{user.name}</p>
                        <p className="text-xs text-white/50 truncate mt-0.5">{user.email}</p>
                      </div>
                      <div className="py-1">
                        <Link href="/profile" onClick={() => setUserMenuOpen(false)}
                          className="flex items-center gap-3 px-4 py-2.5 text-sm text-white/80 hover:bg-white/5 hover:text-white transition-colors">
                          <User className="w-4 h-4 text-white/50" /> Profile
                        </Link>
                        <Link href="/profile" onClick={() => setUserMenuOpen(false)}
                          className="flex items-center gap-3 px-4 py-2.5 text-sm text-white/80 hover:bg-white/5 hover:text-white transition-colors">
                          <Bookmark className="w-4 h-4 text-white/50" /> My Watchlist
                        </Link>
                        {user.isAdmin && (
                          <Link href="/admin" onClick={() => setUserMenuOpen(false)}
                            className="flex items-center gap-3 px-4 py-2.5 text-sm text-yellow-400 hover:bg-yellow-400/10 transition-colors">
                            <Shield className="w-4 h-4" /> Admin Panel
                          </Link>
                        )}
                      </div>
                      <div className="border-t border-white/10 py-1">
                        <button onClick={handleLogout}
                          className="flex items-center gap-3 w-full px-4 py-2.5 text-sm text-red-400 hover:bg-red-500/10 transition-colors">
                          <LogOut className="w-4 h-4" /> Sign Out
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <Link href="/login"
                    className="hidden sm:block text-sm text-white/70 hover:text-white transition-colors px-3 py-1.5">
                    Sign In
                  </Link>
                  <Link href="/signup"
                    className="bg-yellow-400 hover:bg-yellow-300 text-black text-sm font-bold px-4 py-1.5 rounded-full transition-all">
                    Join Free
                  </Link>
                </div>
              )}
            </div>
          </div>
        </div>
      </nav>

      {/* ── SIDEBAR OVERLAY ── */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/70 backdrop-blur-sm z-[60]"
          onClick={closeSidebar}
        />
      )}

      {/* ── SIDEBAR DRAWER ── */}
      <aside
        className={`fixed top-0 left-0 h-full w-72 sm:w-80 bg-[#0a0a0a] border-r border-white/10 z-[70] flex flex-col transform transition-transform duration-300 ease-out ${
          sidebarOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        {/* Sidebar Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/10 flex-shrink-0">
          <Logo />
          <button
            onClick={closeSidebar}
            className="p-2 text-white/50 hover:text-white hover:bg-white/10 rounded-lg transition-all"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* User info (if logged in) */}
        {user && (
          <div className="px-5 py-4 border-b border-white/10 bg-yellow-400/5 flex-shrink-0">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-yellow-400 flex items-center justify-center flex-shrink-0">
                <span className="text-base font-black text-black">{user.name[0]?.toUpperCase()}</span>
              </div>
              <div className="min-w-0">
                <p className="text-sm font-bold text-white truncate">{user.name}</p>
                <p className="text-xs text-white/50 truncate">{user.email}</p>
              </div>
            </div>
          </div>
        )}

        {/* Scrollable nav content */}
        <div className="flex-1 overflow-y-auto">

          {/* Browse section */}
          <div className="px-3 py-3">
            <p className="px-3 py-1.5 text-xs font-bold text-white/30 uppercase tracking-widest">Browse</p>
            {NAV_LINKS.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                onClick={closeSidebar}
                className={`flex items-center gap-3 px-3 py-3 rounded-xl text-sm font-medium transition-all mb-0.5 ${
                  isActive(link.href)
                    ? "bg-yellow-400/15 text-yellow-400 border border-yellow-400/20"
                    : "text-white/70 hover:bg-white/5 hover:text-white"
                }`}
              >
                <span className={isActive(link.href) ? "text-yellow-400" : "text-white/40"}>
                  {link.icon}
                </span>
                {link.label}
                {isActive(link.href) && <div className="ml-auto w-1.5 h-1.5 rounded-full bg-yellow-400" />}
              </Link>
            ))}
          </div>

          {/* Genre section */}
          <div className="px-3 pb-3">
            <button
              onClick={() => setSidebarGenreOpen((v) => !v)}
              className="flex items-center gap-3 w-full px-3 py-3 rounded-xl text-sm font-medium text-white/70 hover:bg-white/5 hover:text-white transition-all"
            >
              <Film className="w-4 h-4 text-white/40" />
              <span>Browse Genres</span>
              <ChevronRight className={`ml-auto w-4 h-4 text-white/30 transition-transform ${sidebarGenreOpen ? "rotate-90" : ""}`} />
            </button>

            {sidebarGenreOpen && (
              <div className="mt-1 ml-4 pl-3 border-l border-white/10 grid grid-cols-2 gap-1">
                {GENRES.map((g) => (
                  <Link
                    key={g}
                    href={`/movies?genre=${g}`}
                    onClick={closeSidebar}
                    className="px-3 py-2 text-sm text-white/60 hover:text-yellow-400 hover:bg-yellow-400/5 rounded-lg transition-colors"
                  >
                    {g}
                  </Link>
                ))}
              </div>
            )}
          </div>

          {/* Account section */}
          {user && (
            <div className="px-3 pb-3 border-t border-white/10 pt-3">
              <p className="px-3 py-1.5 text-xs font-bold text-white/30 uppercase tracking-widest">Account</p>

              <Link href="/profile" onClick={closeSidebar}
                className="flex items-center gap-3 px-3 py-3 rounded-xl text-sm font-medium text-white/70 hover:bg-white/5 hover:text-white transition-all mb-0.5">
                <User className="w-4 h-4 text-white/40" /> Profile
              </Link>

              <Link href="/profile" onClick={closeSidebar}
                className="flex items-center gap-3 px-3 py-3 rounded-xl text-sm font-medium text-white/70 hover:bg-white/5 hover:text-white transition-all mb-0.5">
                <Bookmark className="w-4 h-4 text-white/40" /> My Watchlist
              </Link>

              {user.isAdmin && (
                <Link href="/admin" onClick={closeSidebar}
                  className="flex items-center gap-3 px-3 py-3 rounded-xl text-sm font-medium text-yellow-400 hover:bg-yellow-400/10 transition-all mb-0.5">
                  <Shield className="w-4 h-4" /> Admin Panel
                </Link>
              )}
            </div>
          )}

          {/* Sign in (not logged in) */}
          {!user && (
            <div className="px-3 pb-3 border-t border-white/10 pt-3 space-y-2">
              <p className="px-3 py-1.5 text-xs font-bold text-white/30 uppercase tracking-widest">Account</p>
              <Link href="/login" onClick={closeSidebar}
                className="flex items-center gap-3 px-3 py-3 rounded-xl text-sm font-medium text-white/70 hover:bg-white/5 hover:text-white transition-all">
                <User className="w-4 h-4 text-white/40" /> Sign In
              </Link>
              <Link href="/signup" onClick={closeSidebar}
                className="flex items-center justify-center gap-2 mx-3 py-2.5 bg-yellow-400 hover:bg-yellow-300 text-black text-sm font-bold rounded-xl transition-all">
                Create Account
              </Link>
            </div>
          )}
        </div>

        {/* Sidebar Footer */}
        <div className="flex-shrink-0 border-t border-white/10 px-3 py-3">
          {user ? (
            <button
              onClick={handleLogout}
              className="flex items-center gap-3 w-full px-3 py-3 rounded-xl text-sm font-medium text-red-400 hover:bg-red-500/10 transition-all"
            >
              <LogOut className="w-4 h-4" /> Sign Out
            </button>
          ) : (
            <p className="px-3 text-xs text-white/20 text-center">MOOVIED — Stream anything</p>
          )}
        </div>
      </aside>
    </>
  );
}
