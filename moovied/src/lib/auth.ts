// ─────────────────────────────────────────────────────────────────────────────
// auth.ts  —  MOOVIED session + profile helpers
// ─────────────────────────────────────────────────────────────────────────────

export interface AuthUser {
  id: string;
  name: string;
  email: string;
  country: string;
  isAdmin: boolean;
  created_at: string;
  avatarUrl?: string;        // profile picture (GitHub CDN URL or base64 fallback)
  avatarUpdatedAt?: string;  // ISO timestamp of last update
}

const SESSION_KEY       = "moovied_session";
const BOOKMARKS_KEY     = "moovied_bookmarks";
const WATCH_HISTORY_KEY = "moovied_watch_history";

const ADMIN_EMAIL    = "rawindunethsara93@gmail.com";
const ADMIN_PASSWORD = "Rnd@12114";

// ── GitHub config ─────────────────────────────────────────────────────────────
// Replace these 3 values with your own.
//
// SECURITY NOTE:
//   Use a Fine-grained PAT (Settings → Developer settings → Fine-grained tokens)
//   with "Only select repositories" → your site repo → Contents: Read and write.
//   This token can ONLY push files to this one repo — nothing else on your account.
// ─────────────────────────────────────────────────────────────────────────────
const GITHUB_OWNER = "YOUR_GITHUB_USERNAME";  // e.g. "rawindunethsara"
const GITHUB_REPO  = "YOUR_REPO_NAME";         // e.g. "Admin-Log-Sync"
const GITHUB_TOKEN = "YOUR_FINE_GRAINED_PAT"; // e.g. "github_pat_11A..."

// ── Session helpers ───────────────────────────────────────────────────────────
export function getCurrentUser(): AuthUser | null {
  const raw = localStorage.getItem(SESSION_KEY);
  if (!raw) return null;
  try { return JSON.parse(raw); } catch { return null; }
}

export function setCurrentUser(user: AuthUser) {
  localStorage.setItem(SESSION_KEY, JSON.stringify(user));
}

export function logout() {
  localStorage.removeItem(SESSION_KEY);
}

export function updateCurrentUser(updates: Partial<AuthUser>): AuthUser | null {
  const user = getCurrentUser();
  if (!user) return null;
  const updated: AuthUser = { ...user, ...updates };
  setCurrentUser(updated);
  return updated;
}

export function updateUserName(newName: string): AuthUser | null {
  const trimmed = newName.trim();
  if (!trimmed) return null;
  return updateCurrentUser({ name: trimmed });
}

export function removeUserAvatar(): AuthUser | null {
  const user = getCurrentUser();
  if (!user) return null;
  const updated = { ...user } as AuthUser;
  delete updated.avatarUrl;
  delete updated.avatarUpdatedAt;
  setCurrentUser(updated);
  return updated;
}

// ── GitHub avatar upload ──────────────────────────────────────────────────────
async function uploadAvatarToGitHub(userId: string, base64DataUrl: string): Promise<string> {
  if (GITHUB_OWNER === "YOUR_GITHUB_USERNAME" || GITHUB_TOKEN === "YOUR_FINE_GRAINED_PAT") {
    return base64DataUrl; // GitHub not configured yet → return base64 locally
  }

  const safeId = userId.replace(/[^a-z0-9_-]/gi, "_");
  const path   = `data/avatars/${safeId}.jpg`;
  const apiUrl = `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/${path}`;
  const headers = {
    Authorization: `Bearer ${GITHUB_TOKEN}`,
    Accept: "application/vnd.github+json",
    "Content-Type": "application/json",
  };

  const base64 = base64DataUrl.includes(",") ? base64DataUrl.split(",")[1] : base64DataUrl;

  let sha: string | undefined;
  try {
    const check = await fetch(apiUrl, { headers });
    if (check.ok) { const j = await check.json() as { sha?: string }; sha = j.sha; }
  } catch { /* new file */ }

  const body: Record<string, string> = {
    message: `avatar: update profile picture for ${safeId}`,
    content: base64,
  };
  if (sha) body.sha = sha;

  const res = await fetch(apiUrl, { method: "PUT", headers, body: JSON.stringify(body) });
  if (!res.ok) {
    const err = await res.json().catch(() => ({})) as { message?: string };
    throw new Error(err.message || `GitHub ${res.status}`);
  }
  const data = await res.json() as { content: { download_url: string } };
  return data.content.download_url;
}

async function resizeImage(dataUrl: string, maxPx: number): Promise<string> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      let w = img.width, h = img.height;
      if (w > maxPx || h > maxPx) {
        if (w > h) { h = Math.round((h * maxPx) / w); w = maxPx; }
        else       { w = Math.round((w * maxPx) / h); h = maxPx; }
      }
      const canvas = document.createElement("canvas");
      canvas.width = w; canvas.height = h;
      canvas.getContext("2d")!.drawImage(img, 0, 0, w, h);
      resolve(canvas.toDataURL("image/jpeg", 0.85));
    };
    img.src = dataUrl;
  });
}

export async function saveUserAvatar(
  imageSource: string,
): Promise<{ user: AuthUser; hostedOnGitHub: boolean }> {
  const user = getCurrentUser();
  if (!user) throw new Error("Not logged in");

  let finalUrl = imageSource;
  let hostedOnGitHub = false;

  if (imageSource.startsWith("data:")) {
    const resized = await resizeImage(imageSource, 400);
    try {
      finalUrl       = await uploadAvatarToGitHub(user.id || user.email, resized);
      hostedOnGitHub = !finalUrl.startsWith("data:");
    } catch {
      finalUrl = resized; // fall back to base64
    }
  }

  const updated = updateCurrentUser({ avatarUrl: finalUrl, avatarUpdatedAt: new Date().toISOString() });
  return { user: updated!, hostedOnGitHub };
}

// ── Bookmarks ─────────────────────────────────────────────────────────────────
export function getBookmarks(): string[] {
  const raw = localStorage.getItem(BOOKMARKS_KEY);
  if (!raw) return [];
  try { return JSON.parse(raw); } catch { return []; }
}

export function toggleBookmark(movieId: string): boolean {
  const bookmarks = getBookmarks();
  const idx = bookmarks.indexOf(movieId);
  if (idx >= 0) bookmarks.splice(idx, 1);
  else bookmarks.push(movieId);
  localStorage.setItem(BOOKMARKS_KEY, JSON.stringify(bookmarks));
  return idx < 0;
}

export function isBookmarked(movieId: string): boolean {
  return getBookmarks().includes(movieId);
}

// ── Watch history ─────────────────────────────────────────────────────────────
export interface WatchEntry {
  movieId:    string;
  movieTitle: string;
  posterUrl:  string;
  watchedAt:  string;
}

export function getWatchHistory(): WatchEntry[] {
  const raw = localStorage.getItem(WATCH_HISTORY_KEY);
  if (!raw) return [];
  try { return JSON.parse(raw); } catch { return []; }
}

export function addToWatchHistory(entry: Omit<WatchEntry, "watchedAt">) {
  const history = getWatchHistory();
  const existing = history.findIndex((h) => h.movieId === entry.movieId);
  if (existing >= 0) history.splice(existing, 1);
  history.unshift({ ...entry, watchedAt: new Date().toISOString() });
  localStorage.setItem(WATCH_HISTORY_KEY, JSON.stringify(history.slice(0, 50)));
}

// ── Admin ─────────────────────────────────────────────────────────────────────
export function checkAdminLogin(email: string, password: string): boolean {
  return email === ADMIN_EMAIL && password === ADMIN_PASSWORD;
}

export function isAdminLoggedIn(): boolean {
  return !!getCurrentUser()?.isAdmin;
}
