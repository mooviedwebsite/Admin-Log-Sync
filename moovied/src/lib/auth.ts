export interface AuthUser {
  id: string;
  name: string;
  email: string;
  country: string;
  isAdmin: boolean;
  created_at: string;
}

const SESSION_KEY = "moovied_session";
const BOOKMARKS_KEY = "moovied_bookmarks";
const WATCH_HISTORY_KEY = "moovied_watch_history";

const ADMIN_EMAIL = "rawindunethsara93@gmail.com";
const ADMIN_PASSWORD = "Rnd@12114";

export function getCurrentUser(): AuthUser | null {
  const raw = localStorage.getItem(SESSION_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export function setCurrentUser(user: AuthUser) {
  localStorage.setItem(SESSION_KEY, JSON.stringify(user));
}

export function logout() {
  localStorage.removeItem(SESSION_KEY);
}

export function getBookmarks(): string[] {
  const raw = localStorage.getItem(BOOKMARKS_KEY);
  if (!raw) return [];
  try {
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

export function toggleBookmark(movieId: string): boolean {
  const bookmarks = getBookmarks();
  const idx = bookmarks.indexOf(movieId);
  if (idx >= 0) {
    bookmarks.splice(idx, 1);
  } else {
    bookmarks.push(movieId);
  }
  localStorage.setItem(BOOKMARKS_KEY, JSON.stringify(bookmarks));
  return idx < 0;
}

export function isBookmarked(movieId: string): boolean {
  return getBookmarks().includes(movieId);
}

export interface WatchEntry {
  movieId: string;
  movieTitle: string;
  posterUrl: string;
  watchedAt: string;
}

export function getWatchHistory(): WatchEntry[] {
  const raw = localStorage.getItem(WATCH_HISTORY_KEY);
  if (!raw) return [];
  try {
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

export function addToWatchHistory(entry: Omit<WatchEntry, "watchedAt">) {
  const history = getWatchHistory();
  const existing = history.findIndex((h) => h.movieId === entry.movieId);
  if (existing >= 0) history.splice(existing, 1);
  history.unshift({ ...entry, watchedAt: new Date().toISOString() });
  localStorage.setItem(WATCH_HISTORY_KEY, JSON.stringify(history.slice(0, 50)));
}

export function checkAdminLogin(email: string, password: string): boolean {
  return email === ADMIN_EMAIL && password === ADMIN_PASSWORD;
}

export function isAdminLoggedIn(): boolean {
  const user = getCurrentUser();
  return !!user?.isAdmin;
}
