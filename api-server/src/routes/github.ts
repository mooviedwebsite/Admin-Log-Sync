import { Router } from "express";

const router = Router();

const GITHUB_REPO  = "mooviedwebsite/Admin-Log-Sync";
const GITHUB_BRANCH = "main";

// ── Token helpers (env-first, then in-memory fallback) ──────────────────────
let _tokenInMemory = "";
function getToken(): string {
  return process.env.GITHUB_TOKEN || _tokenInMemory;
}

// ── Auto-sync config (in-memory; swap for DB if you need persistence) ────────
let autoSyncConfig: {
  enabled: boolean;
  intervalMinutes: number;
  lastRun: string | null;
  githubToken: string;
} = {
  enabled: false,
  intervalMinutes: 60,
  lastRun: null,
  githubToken: "",
};

// ── GET current file SHA from GitHub (required before every update) ──────────
async function getFileSha(
  file: string,
  token: string
): Promise<string | null> {
  const url = `https://api.github.com/repos/${GITHUB_REPO}/contents/${file}?ref=${GITHUB_BRANCH}`;
  const res = await fetch(url, {
    headers: {
      Authorization: `token ${token}`,
      Accept: "application/vnd.github+json",
      "User-Agent": "moovied-admin",
    },
  });
  if (res.status === 404) return null; // file doesn't exist yet
  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText);
    throw new Error(`GitHub getFileSha failed (${res.status}): ${text}`);
  }
  const data = (await res.json()) as { sha?: string };
  return data.sha ?? null;
}

// ── PUT /api/github/push ─────────────────────────────────────────────────────
// Body: { file: string, content: string|object, message: string, token?: string }
// "content" can be a raw JSON-serialisable value OR a base64 string already.
// We always re-encode to base64 here so the frontend doesn't need to.
router.put("/github/push", async (req, res) => {
  try {
    const {
      file,
      content,
      message = "Update via MOOVIED admin",
      token: bodyToken,
    } = req.body as {
      file: string;
      content: unknown;
      message?: string;
      token?: string;
    };

    if (!file) {
      return res.status(400).json({ success: false, error: "file is required" });
    }

    const token = bodyToken || getToken();
    if (!token) {
      return res.status(403).json({
        success: false,
        error:
          "No GitHub token configured. Set GITHUB_TOKEN env var on your Replit server, or paste your token in Admin → Settings → GitHub Token.",
      });
    }

    // Serialise content → UTF-8 string → base64
    const raw =
      typeof content === "string" ? content : JSON.stringify(content, null, 2);
    const encoded = Buffer.from(raw, "utf-8").toString("base64");

    // Get current SHA (needed to update an existing file)
    const sha = await getFileSha(file, token);

    // Push to GitHub Contents API
    const apiUrl = `https://api.github.com/repos/${GITHUB_REPO}/contents/${file}`;
    const body: Record<string, unknown> = {
      message,
      content: encoded,
      branch: GITHUB_BRANCH,
    };
    if (sha) body.sha = sha; // omit for new files

    const ghRes = await fetch(apiUrl, {
      method: "PUT",
      headers: {
        Authorization: `token ${token}`,
        Accept: "application/vnd.github+json",
        "Content-Type": "application/json",
        "User-Agent": "moovied-admin",
      },
      body: JSON.stringify(body),
    });

    if (!ghRes.ok) {
      const errText = await ghRes.text().catch(() => ghRes.statusText);
      // Surface a friendly message for common problems
      if (ghRes.status === 401) {
        return res.status(401).json({
          success: false,
          error: "GitHub token is invalid or expired. Please generate a new Fine-grained token with Contents: Read & Write.",
        });
      }
      if (ghRes.status === 403) {
        return res.status(403).json({
          success: false,
          error: "GitHub token does not have write permission for this repository. Enable Contents: Read & Write.",
        });
      }
      return res.status(ghRes.status).json({
        success: false,
        error: `GitHub API error (${ghRes.status}): ${errText}`,
      });
    }

    const result = (await ghRes.json()) as { content?: { name: string } };
    return res.json({
      success: true,
      file: result.content?.name ?? file,
      message: "Pushed to GitHub successfully",
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return res.status(500).json({ success: false, error: msg });
  }
});

// ── GET /api/autosync/config ─────────────────────────────────────────────────
router.get("/autosync/config", (_req, res) => {
  // Don't expose the token value over the wire
  const { githubToken: _, ...safe } = autoSyncConfig;
  return res.json({
    success: true,
    config: {
      ...safe,
      hasToken: !!autoSyncConfig.githubToken || !!getToken(),
    },
  });
});

// ── POST /api/autosync/config ────────────────────────────────────────────────
router.post("/autosync/config", (req, res) => {
  const { enabled, intervalMinutes, githubToken } = req.body as {
    enabled?: boolean;
    intervalMinutes?: number;
    githubToken?: string;
  };
  if (enabled !== undefined)        autoSyncConfig.enabled = enabled;
  if (intervalMinutes !== undefined) autoSyncConfig.intervalMinutes = intervalMinutes;
  if (githubToken !== undefined) {
    autoSyncConfig.githubToken = githubToken;
    _tokenInMemory = githubToken; // also use for direct pushes
  }
  const { githubToken: _, ...safe } = autoSyncConfig;
  return res.json({ success: true, config: { ...safe, hasToken: !!getToken() } });
});

// ── POST /api/autosync/trigger ───────────────────────────────────────────────
// Manual trigger — returns immediately; the actual sync is done client-side
// (the admin page fetches GAS data and calls /github/push itself)
router.post("/autosync/trigger", (_req, res) => {
  autoSyncConfig.lastRun = new Date().toISOString();
  return res.json({ success: true, triggeredAt: autoSyncConfig.lastRun });
});

export default router;
