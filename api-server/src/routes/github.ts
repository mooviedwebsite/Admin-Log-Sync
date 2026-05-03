import { Router } from "express";

const router = Router();

const GITHUB_REPO   = "mooviedwebsite/Admin-Log-Sync";
const GITHUB_BRANCH = "main";

// In-memory token store (also reads from env)
let _tokenInMemory = "";
function getToken(bodyToken?: string): string {
  return bodyToken || process.env.GITHUB_TOKEN || _tokenInMemory;
}

// Auto-sync config (in-memory)
let autoSyncConfig = {
  enabled: false,
  intervalHours: 12,
  gasUrl: "",
  lastSyncAt: null as string | null,
  lastSyncStatus: "idle" as "idle" | "ok" | "error",
};

// Get current SHA of a file in GitHub (required for updates)
async function getFileSha(file: string, token: string): Promise<string | null> {
  const url = `https://api.github.com/repos/${GITHUB_REPO}/contents/${file}?ref=${GITHUB_BRANCH}`;
  const res = await fetch(url, {
    headers: {
      Authorization: `token ${token}`,
      Accept: "application/vnd.github+json",
      "User-Agent": "moovied-admin",
    },
  });
  if (res.status === 404) return null;
  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText);
    throw new Error(`GitHub getFileSha failed (${res.status}): ${text}`);
  }
  const data = (await res.json()) as { sha?: string };
  return data.sha ?? null;
}

// ── PUT /api/github/push ──────────────────────────────────────────────────────
// Body: { file, content, message, token?, raw? }
// - content: JSON-serialisable value OR base64 string (when raw=true)
// - raw: if true, content is already base64-encoded (image uploads)
router.put("/github/push", async (req, res) => {
  try {
    const {
      file,
      content,
      message = "Update via MOOVIED admin",
      token: bodyToken,
      raw = false,
    } = req.body as {
      file: string;
      content: unknown;
      message?: string;
      token?: string;
      raw?: boolean;
    };

    if (!file) {
      return res.status(400).json({ success: false, error: "file is required" });
    }

    const token = getToken(bodyToken);
    if (!token) {
      return res.status(403).json({
        success: false,
        error:
          "No GitHub token. Paste your token in Admin → Ads Manager → GitHub Token field and click Save Token, then retry.",
      });
    }

    // Encode content to base64
    let encoded: string;
    if (raw && typeof content === "string") {
      // Already base64 (image upload)
      encoded = content;
    } else {
      const raw_str = typeof content === "string" ? content : JSON.stringify(content, null, 2);
      encoded = Buffer.from(raw_str, "utf-8").toString("base64");
    }

    // Get current SHA
    const sha = await getFileSha(file, token);

    // Push to GitHub
    const apiUrl = `https://api.github.com/repos/${GITHUB_REPO}/contents/${file}`;
    const body: Record<string, unknown> = { message, content: encoded, branch: GITHUB_BRANCH };
    if (sha) body.sha = sha;

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
      if (ghRes.status === 401) {
        return res.status(401).json({
          success: false,
          error: "GitHub token is invalid or expired. Generate a new Fine-grained token with Contents: Read & Write.",
        });
      }
      if (ghRes.status === 403) {
        return res.status(403).json({
          success: false,
          error: "GitHub token lacks write permission. Enable Contents: Read & Write on the repository.",
        });
      }
      return res.status(ghRes.status).json({
        success: false,
        error: `GitHub API error (${ghRes.status}): ${errText}`,
      });
    }

    const result = (await ghRes.json()) as { content?: { name: string } };
    return res.json({ success: true, file: result.content?.name ?? file });
  } catch (err) {
    return res.status(500).json({ success: false, error: err instanceof Error ? err.message : String(err) });
  }
});

// ── GET /api/autosync/config ──────────────────────────────────────────────────
router.get("/autosync/config", (_req, res) => {
  return res.json({
    success: true,
    config: { ...autoSyncConfig, hasToken: !!(process.env.GITHUB_TOKEN || _tokenInMemory) },
  });
});

// ── POST /api/autosync/config ─────────────────────────────────────────────────
router.post("/autosync/config", (req, res) => {
  const { enabled, intervalHours, gasUrl, gasSecret, githubToken } = req.body as {
    enabled?: boolean;
    intervalHours?: number;
    gasUrl?: string;
    gasSecret?: string;
    githubToken?: string;
  };
  if (enabled !== undefined)        autoSyncConfig.enabled = enabled;
  if (intervalHours !== undefined)  autoSyncConfig.intervalHours = intervalHours;
  if (gasUrl !== undefined)         autoSyncConfig.gasUrl = gasUrl;
  if (githubToken)                  _tokenInMemory = githubToken;
  return res.json({
    success: true,
    config: { ...autoSyncConfig, hasToken: !!(process.env.GITHUB_TOKEN || _tokenInMemory) },
  });
});

// ── POST /api/autosync/trigger ────────────────────────────────────────────────
router.post("/autosync/trigger", (_req, res) => {
  autoSyncConfig.lastSyncAt = new Date().toISOString();
  return res.json({ success: true, triggeredAt: autoSyncConfig.lastSyncAt });
});

export default router;
