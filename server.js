const http   = require('http');
const https  = require('https');
const fs     = require('fs');
const path   = require('path');
const url    = require('url');
const crypto = require('crypto');

const PORT      = 5000;
const BASE_PATH = '/Admin-Log-Sync';
const ROOT_DIR  = __dirname;

// ── GAS & GitHub config ───────────────────────────────────────────────────────
const GAS_URL = 'https://script.google.com/macros/s/AKfycbwMcrOMCPmRMgbWunm0eQnweODbktt_6yvv8oKR8p61_n4ULAsuCD2wBtokaNPN4VyT/exec';
const GITHUB_TOKEN  = process.env.GITHUB_TOKEN || '';
const GITHUB_OWNER  = 'mooviedwebsite';
const GITHUB_REPO   = 'Admin-Log-Sync';
const GITHUB_BRANCH = 'main';

// ── Local data files (primary data store — instant reads/writes) ──────────────
const DATA_DIR          = path.join(ROOT_DIR, 'data');
const COMMENTS_FILE     = path.join(DATA_DIR, 'comments.json');
const AUTOSYNC_CFG_FILE = path.join(ROOT_DIR, '.local', 'autosync-config.json');
const POSTS_DIR         = path.join(ROOT_DIR, 'posts');

// ── Pretty URL slug system ────────────────────────────────────────────────────
// Maps human-readable slugs (e.g. "oppenheimer-2023") to internal movie IDs
// (e.g. "mov_oppenheimer_2023" or a UUID). Built at startup from posts/*.json
// and refreshed in the background from GAS getMovies.

let SLUG_BY_ID = {};   // id   → slug      ("mov_x" → "x-2023")
let ID_BY_SLUG = {};   // slug → id        ("x-2023" → "mov_x")

function slugify(title, year) {
  if (!title) return '';
  const base = String(title)
    .toLowerCase()
    .normalize('NFKD').replace(/[\u0300-\u036f]/g, '')   // strip accents
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  if (!base) return '';
  return year ? `${base}-${String(year).trim()}` : base;
}

function registerMovie(id, title, year) {
  if (!id || !title) return;
  let slug = slugify(title, year);
  if (!slug) return;
  // Avoid clobbering an existing slug owned by a different id
  if (ID_BY_SLUG[slug] && ID_BY_SLUG[slug] !== id) {
    let n = 2;
    while (ID_BY_SLUG[`${slug}-${n}`] && ID_BY_SLUG[`${slug}-${n}`] !== id) n++;
    slug = `${slug}-${n}`;
  }
  SLUG_BY_ID[id]   = slug;
  ID_BY_SLUG[slug] = id;
}

function buildSlugMapsFromPosts() {
  for (const sub of ['movies', 'tv-series']) {
    const dir = path.join(POSTS_DIR, sub);
    if (!fs.existsSync(dir)) continue;
    for (const f of fs.readdirSync(dir)) {
      if (!f.endsWith('.json')) continue;
      try {
        const obj = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
        // Prefer the embedded slug field; fall back to computing it
        if (obj.id && obj.slug) {
          SLUG_BY_ID[obj.id]    = obj.slug;
          ID_BY_SLUG[obj.slug]  = obj.id;
        } else {
          registerMovie(obj.id, obj.title, obj.year);
        }
      } catch {}
    }
  }
}

async function refreshSlugMapsFromGAS() {
  try {
    const r = await gasGet('getMovies');
    if (r && r.success && Array.isArray(r.movies)) {
      // Wipe and rebuild so deleted movies disappear from the map
      SLUG_BY_ID = {}; ID_BY_SLUG = {};
      buildSlugMapsFromPosts();   // local first (covers offline GAS)
      r.movies.forEach(m => registerMovie(m.id, m.title, m.year));
      console.log(`[slugs] rebuilt: ${Object.keys(ID_BY_SLUG).length} pretty URLs`);
    }
  } catch (e) {
    console.log('[slugs] GAS refresh failed:', e.message);
  }
}

function ensureDir(dir) {
  try { fs.mkdirSync(dir, { recursive: true }); } catch {}
}

// ── Comments — local file helpers ─────────────────────────────────────────────

function readComments() {
  try { return JSON.parse(fs.readFileSync(COMMENTS_FILE, 'utf8')); }
  catch { return []; }
}

function writeComments(comments) {
  ensureDir(DATA_DIR);
  fs.writeFileSync(COMMENTS_FILE, JSON.stringify(comments, null, 2));
}

// ── Autosync config helpers ───────────────────────────────────────────────────

function loadAutosyncConfig() {
  try { return JSON.parse(fs.readFileSync(AUTOSYNC_CFG_FILE, 'utf8')); }
  catch { return { enabled: false, intervalHours: 6, gasUrl: GAS_URL, lastSync: null }; }
}

function saveAutosyncConfig(cfg) {
  ensureDir(path.dirname(AUTOSYNC_CFG_FILE));
  fs.writeFileSync(AUTOSYNC_CFG_FILE, JSON.stringify(cfg, null, 2));
}

// ── Mime types ────────────────────────────────────────────────────────────────
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js':   'application/javascript',
  '.css':  'text/css',
  '.json': 'application/json',
  '.png':  'image/png',
  '.jpg':  'image/jpeg',
  '.svg':  'image/svg+xml',
  '.ico':  'image/x-icon',
  '.woff': 'font/woff',
  '.woff2':'font/woff2',
  '.ttf':  'font/ttf',
  '.webp': 'image/webp',
};

// ── HTTP helpers ──────────────────────────────────────────────────────────────

function json(res, data, status = 200) {
  const body = JSON.stringify(data);
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET,POST,PUT,PATCH,DELETE,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type,Authorization',
  });
  res.end(body);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', chunk => { data += chunk; });
    req.on('end', () => {
      try { resolve(data ? JSON.parse(data) : {}); }
      catch { resolve({}); }
    });
    req.on('error', reject);
  });
}

// ── HTTP fetch (follow redirects) ─────────────────────────────────────────────

function fetchUrl(targetUrl, opts = {}, redirects = 0) {
  return new Promise((resolve, reject) => {
    if (redirects > 10) return reject(new Error('Too many redirects'));
    const parsed = new URL(targetUrl);
    const lib    = parsed.protocol === 'https:' ? https : http;
    const options = {
      hostname: parsed.hostname,
      port:     parsed.port || (parsed.protocol === 'https:' ? 443 : 80),
      path:     parsed.pathname + parsed.search,
      method:   opts.method || 'GET',
      headers:  { 'User-Agent': 'MOOVIED-Server/1.0', ...(opts.headers || {}) },
    };
    const req = lib.request(options, (res) => {
      if ([301, 302, 303, 307, 308].includes(res.statusCode) && res.headers.location) {
        const loc = res.headers.location.startsWith('http')
          ? res.headers.location
          : new URL(res.headers.location, targetUrl).href;
        const switchGet = [301, 302, 303].includes(res.statusCode);
        res.resume();
        fetchUrl(loc, switchGet ? { method: 'GET', headers: { 'User-Agent': 'MOOVIED-Server/1.0' } } : opts, redirects + 1)
          .then(resolve).catch(reject);
        return;
      }
      let body = '';
      res.on('data', c => body += c);
      res.on('end', () => {
        try { resolve({ status: res.statusCode, body: JSON.parse(body), raw: body }); }
        catch { resolve({ status: res.statusCode, body: null, raw: body }); }
      });
    });
    req.on('error', reject);
    if (opts.body) req.write(typeof opts.body === 'string' ? opts.body : JSON.stringify(opts.body));
    req.end();
  });
}

// Fire-and-forget to GAS (no redirect follow — GAS always returns 302 for POST)
function fetchUrlNoRedirect(targetUrl, opts = {}) {
  return new Promise((resolve, reject) => {
    const parsed = new URL(targetUrl);
    const lib    = parsed.protocol === 'https:' ? https : http;
    const req = lib.request({
      hostname: parsed.hostname,
      port:     parsed.port || 443,
      path:     parsed.pathname + parsed.search,
      method:   opts.method || 'GET',
      headers:  opts.headers || {},
    }, (res) => {
      let body = '';
      res.on('data', c => body += c);
      res.on('end', () => resolve({ status: res.statusCode, raw: body }));
    });
    req.on('error', reject);
    if (opts.body) req.write(typeof opts.body === 'string' ? opts.body : JSON.stringify(opts.body));
    req.end();
  });
}

// ── GAS helpers ───────────────────────────────────────────────────────────────

async function gasGet(action, extra = {}) {
  const params = new URLSearchParams({ action, ...extra });
  try {
    const r = await fetchUrl(`${GAS_URL}?${params}`);
    return r.body || { success: false, error: 'No response from GAS' };
  } catch (e) {
    return { success: false, error: e.message };
  }
}

// Fire-and-forget POST to GAS — never blocks the response
function gasPost(body) {
  const jsonBody = JSON.stringify(body);
  fetchUrlNoRedirect(GAS_URL, {
    method: 'POST',
    headers: {
      'Content-Type':  'application/json',
      'Content-Length': Buffer.byteLength(jsonBody).toString(),
      'User-Agent':    'MOOVIED-Server/1.0',
    },
    body: jsonBody,
  }).then(r => {
    console.log(`[GAS POST] ${body.action} → HTTP ${r.status}`);
  }).catch(e => {
    console.log(`[GAS POST] ${body.action} error: ${e.message}`);
  });
}

// Fire-and-forget GET to GAS — uses doGet directly (no redirect issues)
// This is the RELIABLE path for syncing comment mutations to the sheet
function gasSync(action, params = {}) {
  gasGet(action, params)
    .then(r => console.log(`[GAS GET] ${action} → success:${r.success}${r.error ? ' err:' + r.error : ''}`))
    .catch(e => console.log(`[GAS GET] ${action} error: ${e.message}`));
}

// ── GitHub push helper ────────────────────────────────────────────────────────

async function githubPush(filePath, content, message) {
  if (!GITHUB_TOKEN) return;
  const apiUrl = `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/${filePath}`;
  try {
    let sha = '';
    const r = await fetchUrl(`${apiUrl}?ref=${GITHUB_BRANCH}`, {
      headers: { Authorization: `token ${GITHUB_TOKEN}`, Accept: 'application/vnd.github.v3+json' },
    });
    if (r.body && r.body.sha) sha = r.body.sha;
    const b64 = Buffer.from(typeof content === 'string' ? content : JSON.stringify(content, null, 2)).toString('base64');
    const payload = { message, content: b64, branch: GITHUB_BRANCH };
    if (sha) payload.sha = sha;
    await fetchUrl(apiUrl, {
      method: 'PUT',
      headers: {
        Authorization: `token ${GITHUB_TOKEN}`,
        Accept: 'application/vnd.github.v3+json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });
    console.log(`[GitHub] pushed ${filePath}`);
  } catch (e) {
    console.log(`[GitHub] push ${filePath} error: ${e.message}`);
  }
}

// Async: push comments.json to GitHub (don't await)
function syncCommentsToGithub(comments) {
  githubPush('data/comments.json', comments, 'sync: comments updated').catch(() => {});
}

// ── On-startup: load comments from GAS if local file is empty ─────────────────

async function initCommentsFromGAS() {
  const local = readComments();
  if (local.length > 0) {
    console.log(`[comments] loaded ${local.length} comments from local file`);
    return;
  }
  console.log('[comments] local file empty — pulling from GAS...');
  try {
    const r = await gasGet('getAllComments');
    if (r.success && Array.isArray(r.comments) && r.comments.length > 0) {
      writeComments(r.comments);
      console.log(`[comments] synced ${r.comments.length} comments from GAS`);
    } else {
      console.log('[comments] GAS has no comments — starting fresh');
    }
  } catch (e) {
    console.log('[comments] GAS pull failed:', e.message);
  }
}

// ── HTML inject ───────────────────────────────────────────────────────────────

const INJECT_SCRIPT = `<script>
(function(){
  var GAS = '${GAS_URL}';
  var API = window.location.origin + '/api';
  localStorage.setItem('moovied_comments_api_url', API);
  localStorage.setItem('moovied_api_server_url',   API);
  localStorage.setItem('moovied_gas_url',           GAS);
  var _g = Storage.prototype.getItem;
  Storage.prototype.getItem = function(k) {
    if (k === 'moovied_comments_api_url') return API;
    if (k === 'moovied_api_server_url')   return API;
    if (k === 'moovied_gas_url')          return GAS;
    return _g.call(this, k);
  };
})();
</script>`;

const INJECT_MARKER = '<!-- moovied-inject -->';

// Pretty URL inject — runs on every page load. Provides a slug↔id map and
// makes the address bar show /movie/oppenheimer-2023 while React's internal
// router state always sees the real UUID.
//
// Strategy:
//  1. BEFORE React boots: if URL is /movie/<slug>, immediately replaceState to
//     /movie/<UUID> so React-router & useParams see the UUID.
//  2. AFTER React mounts: cosmetically swap the URL bar back to /movie/<slug>
//     using a raw replaceState (no popstate fired → React-router doesn't
//     re-render or notice).
//  3. On every browser navigation (pushState, popstate, back/forward), repeat
//     the same translate-then-cosmetic-swap dance so React always handles
//     UUIDs while users always see slugs.
//  4. Fetch hook: defense-in-depth — translate any slug found in a GAS
//     `?id=<x>` query back to the real UUID.
function buildSlugInject() {
  // Escape `</script>` to prevent script-tag breakout via attacker-controlled
  // titles or IDs that may have been registered into the slug maps.
  const data = JSON.stringify({ byId: SLUG_BY_ID, bySlug: ID_BY_SLUG })
    .replace(/</g, '\\u003c');
  return `<script>
(function(){
  try {
    window.__MOOVIED_SLUGS__ = ${data};
    var M = window.__MOOVIED_SLUGS__;

    var _ps = history.pushState.bind(history);
    var _rs = history.replaceState.bind(history);

    function parseMovie(p) {
      var m = /^(\\/movie\\/)([^\\/?#]+)(.*)$/.exec(p || '');
      if (!m) return null;
      try { return { prefix: m[1], seg: decodeURIComponent(m[2]), tail: m[3] }; }
      catch(e) { return { prefix: m[1], seg: m[2], tail: m[3] }; }
    }

    // Convert URL path to its internal (UUID) form for React, and to its
    // pretty (slug) form for the address bar. Returns null if no change.
    function toInternal(p) {
      var x = parseMovie(p); if (!x) return null;
      var id = M.bySlug[x.seg];
      return id ? (x.prefix + id + x.tail) : null;
    }
    function toPretty(p) {
      var x = parseMovie(p); if (!x) return null;
      var slug = M.byId[x.seg];
      return slug ? (x.prefix + slug + x.tail) : null;
    }

    // Cosmetic swap: change address bar to slug version WITHOUT firing
    // popstate, so React-router keeps its UUID-based internal state.
    function cosmeticSwapToSlug() {
      var pretty = toPretty(location.pathname);
      if (pretty && pretty !== location.pathname) {
        _rs(history.state, '', pretty + location.search + location.hash);
      }
    }

    // (1) Synchronous initial load: if URL has slug, replace with UUID NOW
    //     so React's first read of location.pathname returns the UUID.
    (function(){
      var internal = toInternal(location.pathname);
      if (internal) _rs(history.state, '', internal + location.search + location.hash);
    })();

    // (2) After React mounts, swap URL bar back to slug.
    function whenReady(fn) {
      if (document.readyState === 'complete' || document.readyState === 'interactive') {
        setTimeout(fn, 50);
      } else {
        document.addEventListener('DOMContentLoaded', function(){ setTimeout(fn, 50); });
      }
    }
    whenReady(cosmeticSwapToSlug);

    // (3) When React navigates, let it use the UUID URL it wants. After the
    //     navigation completes, schedule a cosmetic swap to slug.
    history.pushState = function(s, t, u) {
      // If React (or anything else) tries to push a slug URL, normalize it to
      // UUID first so React-router's internal state stays UUID-based.
      if (typeof u === 'string') {
        var internal = toInternal(u);
        if (internal) u = internal;
      }
      var ret = _ps(s, t, u);
      setTimeout(cosmeticSwapToSlug, 0);
      return ret;
    };
    history.replaceState = function(s, t, u) {
      if (typeof u === 'string') {
        var internal = toInternal(u);
        if (internal) u = internal;
      }
      var ret = _rs(s, t, u);
      setTimeout(cosmeticSwapToSlug, 0);
      return ret;
    };

    // (4) Browser back/forward: URL may be a slug entry from earlier cosmetic
    //     swap. We MUST translate to UUID BEFORE React-router's popstate
    //     listener reads location.pathname. Since this script ran during
    //     <head> parsing, our listener is registered first — runs first.
    window.addEventListener('popstate', function(){
      var internal = toInternal(location.pathname);
      if (internal) {
        _rs(history.state, '', internal + location.search + location.hash);
        setTimeout(cosmeticSwapToSlug, 0);
      }
    });

    // (5) Fetch defense-in-depth: translate slug → UUID in any GAS id param.
    var _f = window.fetch.bind(window);
    window.fetch = function(input, init) {
      try {
        var url = typeof input === 'string' ? input : (input && input.url) || '';
        if (url.indexOf('script.google.com') !== -1 && url.indexOf('id=') !== -1) {
          var u = new URL(url);
          var rawId = u.searchParams.get('id');
          if (rawId && M.bySlug[rawId]) {
            u.searchParams.set('id', M.bySlug[rawId]);
            input = u.toString();
          }
        }
      } catch(e){}
      return _f(input, init);
    };
  } catch(e) { /* never break the page */ }
})();
</script>`;
}

// Sentinel that marks the actual injected payload (vs the empty slot marker
// already present inside index.html as `<!-- moovied-inject -->`).
const INJECT_DONE_SENTINEL = '<!-- moovied-inject:done -->';

function injectIntoHtml(buf) {
  let html = buf.toString('utf8');
  if (html.includes(INJECT_DONE_SENTINEL)) return buf;
  const payload = INJECT_DONE_SENTINEL + '\n' + INJECT_SCRIPT + '\n' + buildSlugInject();
  if (html.includes(INJECT_MARKER)) {
    // Replace the empty slot marker with our payload (preserves placement in <head>)
    html = html.replace(INJECT_MARKER, payload);
  } else {
    // No slot found — fall back to inserting right after <head>
    html = html.replace('<head>', '<head>\n' + payload);
  }
  return Buffer.from(html, 'utf8');
}

// ── API handler ───────────────────────────────────────────────────────────────

async function handleApi(req, res, apiPath) {
  const method = req.method.toUpperCase();
  const qs     = new URL('http://x' + req.url).searchParams;

  // CORS preflight
  if (method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET,POST,PUT,PATCH,DELETE,OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type,Authorization',
    });
    res.end();
    return;
  }

  // ══════════════════════════════════════════════════════════════════════════
  // COMMENTS — local-file-first: instant reads/writes, GAS synced in background
  // ══════════════════════════════════════════════════════════════════════════

  // GET /api/comments?movieId=xxx
  if (apiPath === '/comments' && method === 'GET') {
    const movieId = qs.get('movieId') || '';
    if (!movieId) return json(res, { success: true, comments: [] });
    const all = readComments();
    const comments = all
      .filter(c => String(c.movie_id) === movieId)
      .sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
    return json(res, { success: true, comments });
  }

  // GET /api/comments/all
  if (apiPath === '/comments/all' && method === 'GET') {
    const all = readComments();
    all.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
    return json(res, { success: true, comments: all });
  }

  // POST /api/comments  — add a comment
  if (apiPath === '/comments' && method === 'POST') {
    const body = await readBody(req);
    const movieId     = body.movie_id  || body.movieId  || '';
    const userId      = body.user_id   || body.userId   || '';
    const userName    = body.user_name || body.userName || 'Anonymous';
    const content     = (body.content  || '').trim();
    const replyTo     = body.reply_to     || body.replyTo     || '';
    const replyToName = body.reply_to_name || body.replyToName || '';

    if (!movieId || !userId || !content) {
      return json(res, { success: false, error: 'movie_id, user_id and content are required' }, 400);
    }

    const comment = {
      id:            crypto.randomUUID(),
      movie_id:      movieId,
      user_id:       userId,
      user_name:     userName,
      content,
      timestamp:     new Date().toISOString(),
      likes:         0,
      edited:        false,
      reply_to:      replyTo,
      reply_to_name: replyToName,
    };

    // Save to local file immediately — this is the fast path
    const all = readComments();
    all.push(comment);
    writeComments(all);

    // Async: POST to GAS (triggers doPost, data saved to sheet)
    // id is passed so GAS uses the same UUID as local (requires code.gs v4.1+)
    gasPost({ action: 'addComment', id: comment.id, movieId, userId, userName, content, reply_to: replyTo, reply_to_name: replyToName });

    // Async: push updated comments.json to GitHub
    syncCommentsToGithub(all);

    return json(res, { success: true, comment });
  }

  // PATCH or PUT /api/comments/:id  — edit a comment
  const editMatch = apiPath.match(/^\/comments\/([^/]+)$/);
  if (editMatch && (method === 'PATCH' || method === 'PUT')) {
    const id   = editMatch[1];
    const body = await readBody(req);
    const content = (body.content || '').trim();

    const all = readComments();
    const idx = all.findIndex(c => c.id === id);
    if (idx === -1) return json(res, { success: false, error: 'Comment not found' });

    all[idx].content = content;
    all[idx].edited  = true;
    writeComments(all);

    gasPost({ action: 'editComment', id, content });
    syncCommentsToGithub(all);

    return json(res, { success: true });
  }

  // DELETE /api/comments/:id
  if (editMatch && method === 'DELETE') {
    const id  = editMatch[1];
    const all = readComments();
    const idx = all.findIndex(c => c.id === id);
    if (idx === -1) return json(res, { success: true }); // idempotent

    all.splice(idx, 1);
    writeComments(all);

    gasPost({ action: 'deleteComment', id });
    syncCommentsToGithub(all);

    return json(res, { success: true });
  }

  // POST /api/comments/:id/like
  const likeMatch = apiPath.match(/^\/comments\/([^/]+)\/like$/);
  if (likeMatch && method === 'POST') {
    const id  = likeMatch[1];
    const all = readComments();
    const idx = all.findIndex(c => c.id === id);
    if (idx === -1) return json(res, { success: false, error: 'Comment not found' });

    all[idx].likes = (Number(all[idx].likes) || 0) + 1;
    writeComments(all);

    gasPost({ action: 'likeComment', id });
    syncCommentsToGithub(all);

    return json(res, { success: true, likes: all[idx].likes });
  }

  // ══════════════════════════════════════════════════════════════════════════
  // AUTH
  // ══════════════════════════════════════════════════════════════════════════

  if (apiPath === '/login' && method === 'POST') {
    const body = await readBody(req);
    const r = await gasGet('loginUser', { email: body.email, password: body.password });
    // loginUser is POST-based in GAS — use gasGet as proxy
    try {
      const pr = await fetchUrl(`${GAS_URL}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'loginUser', email: body.email, password: body.password }),
      });
      return json(res, pr.body || { success: false, error: 'GAS error' });
    } catch (e) {
      return json(res, { success: false, error: e.message });
    }
  }

  // ══════════════════════════════════════════════════════════════════════════
  // GAS PROXY — pass any other action through
  // ══════════════════════════════════════════════════════════════════════════

  if (apiPath === '/gas' && method === 'GET') {
    const action = qs.get('action');
    if (!action) return json(res, { error: 'action required' }, 400);
    const params = {};
    qs.forEach((v, k) => { if (k !== 'action') params[k] = v; });
    const r = await gasGet(action, params);
    return json(res, r);
  }

  if (apiPath === '/gas' && method === 'POST') {
    const body = await readBody(req);
    try {
      const r = await fetchUrl(GAS_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      return json(res, r.body || { success: false, error: 'No response' });
    } catch (e) {
      return json(res, { success: false, error: e.message });
    }
  }

  // ══════════════════════════════════════════════════════════════════════════
  // GITHUB PUSH
  // ══════════════════════════════════════════════════════════════════════════

  if (apiPath === '/github/push' && method === 'PUT') {
    const body = await readBody(req);
    if (!body.file || !body.content) return json(res, { error: 'file and content required' }, 400);
    await githubPush(body.file, body.content, body.message || 'Upload via MOOVIED');
    return json(res, { success: true });
  }

  // ══════════════════════════════════════════════════════════════════════════
  // AUTO-SYNC CONFIG — GET / PUT / POST trigger
  // ══════════════════════════════════════════════════════════════════════════

  if (apiPath === '/autosync/config' && method === 'GET') {
    return json(res, loadAutosyncConfig());
  }

  if (apiPath === '/autosync/config' && (method === 'PUT' || method === 'POST')) {
    const body = await readBody(req);
    const existing = loadAutosyncConfig();
    const merged   = { ...existing, ...body, updatedAt: new Date().toISOString() };
    saveAutosyncConfig(merged);
    return json(res, { success: true, config: merged });
  }

  // ══════════════════════════════════════════════════════════════════════════
  // SLUG MAP — pretty URLs
  // ══════════════════════════════════════════════════════════════════════════

  if (apiPath === '/slugs' && method === 'GET') {
    return json(res, { success: true, byId: SLUG_BY_ID, bySlug: ID_BY_SLUG });
  }

  if (apiPath === '/slugs/refresh' && method === 'POST') {
    await refreshSlugMapsFromGAS();
    return json(res, { success: true, count: Object.keys(ID_BY_SLUG).length });
  }

  if (apiPath === '/autosync/trigger' && method === 'POST') {
    // Pull fresh data from GAS and update local cache
    const cfg = loadAutosyncConfig();
    cfg.lastSync = new Date().toISOString();
    saveAutosyncConfig(cfg);

    // Async sync: pull all comments from GAS, overwrite local file
    gasGet('getAllComments').then(r => {
      if (r.success && Array.isArray(r.comments)) {
        writeComments(r.comments);
        syncCommentsToGithub(r.comments);
        console.log('[autosync] pulled', r.comments.length, 'comments from GAS');
      }
    }).catch(e => console.log('[autosync] error:', e.message));

    return json(res, { success: true, triggeredAt: cfg.lastSync });
  }

  return json(res, { error: 'Not found' }, 404);
}

// ── Main request handler ──────────────────────────────────────────────────────
//
// Clean URL routing:
//   /                       → index.html (SPA root)
//   /movie/:id, /movies,    → index.html (SPA fallback for any non-asset route)
//   /admin, /login, etc.
//   /watch?video=...        → player.html (clean canonical player URL)
//   /assets/*               → static assets
//   /api/*                  → JSON API
//   /Admin-Log-Sync/*       → 301-redirected to the clean equivalent (legacy)
//
// The compiled React bundle still references `/Admin-Log-Sync/...` for assets
// and `/Admin-Log-Sync/player.html` for the play button. We redirect those to
// their clean equivalents so the address bar always shows the professional URL.

const STATIC_FILES = new Set([
  '/favicon.svg', '/opengraph.jpg', '/footer.css', '/footer.js',
  '/ads-config.json', '/404.html', '/.nojekyll',
]);

function isAssetPath(p) {
  if (p.startsWith('/assets/')) return true;
  if (p.startsWith('/data/'))   return true;
  if (p.startsWith('/posts/'))  return true;
  if (STATIC_FILES.has(p))      return true;
  // Any path with a known file extension is a static file request
  const ext = path.extname(p).toLowerCase();
  return !!ext && !!MIME[ext];
}

function serveFile(res, fullPath, ext) {
  // Path-traversal guard: resolved file must stay inside ROOT_DIR
  const resolved = path.resolve(fullPath);
  if (resolved !== ROOT_DIR && !resolved.startsWith(ROOT_DIR + path.sep)) {
    res.writeHead(403, { 'Content-Type': 'text/plain' });
    res.end('Forbidden');
    return;
  }
  const mime = MIME[ext] || 'application/octet-stream';
  fs.readFile(resolved, (err, data) => {
    if (err) {
      if (err.code === 'ENOENT') {
        // SPA fallback: serve index.html for unknown routes (no extension)
        if (!ext) {
          fs.readFile(path.join(ROOT_DIR, 'index.html'), (e2, d2) => {
            if (e2) { res.writeHead(404); res.end('Not Found'); return; }
            const out = injectIntoHtml(d2);
            res.writeHead(200, {
              'Content-Type': 'text/html; charset=utf-8',
              'Cache-Control': 'no-cache, no-store, must-revalidate',
            });
            res.end(out);
          });
          return;
        }
        fs.readFile(path.join(ROOT_DIR, '404.html'), (e2, d2) => {
          res.writeHead(404, { 'Content-Type': 'text/html; charset=utf-8' });
          res.end(d2 || 'Not Found');
        });
        return;
      }
      res.writeHead(500); res.end('Server Error');
      return;
    }
    if (ext === '.html') {
      data = injectIntoHtml(data);
      res.writeHead(200, {
        'Content-Type': mime,
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'Pragma': 'no-cache',
        'Expires': '0',
      });
      res.end(data);
      return;
    }
    res.writeHead(200, { 'Content-Type': mime });
    res.end(data);
  });
}

const server = http.createServer(async (req, res) => {
  const parsedUrl = url.parse(req.url);
  let urlPath     = parsedUrl.pathname || '/';
  const search    = parsedUrl.search || '';

  // ── API routes ──────────────────────────────────────────────────────────
  if (urlPath.startsWith('/api/') || urlPath === '/api') {
    const apiPath = urlPath.slice(4) || '/';
    try { await handleApi(req, res, apiPath); }
    catch (err) {
      console.error('API error:', err);
      json(res, { success: false, error: 'Internal server error' }, 500);
    }
    return;
  }

  // ── Legacy /Admin-Log-Sync/* → clean URL redirect ───────────────────────
  if (urlPath === BASE_PATH || urlPath.startsWith(BASE_PATH + '/')) {
    let stripped = urlPath.slice(BASE_PATH.length) || '/';
    // Collapse leading slashes to avoid protocol-relative open-redirect
    // payloads like /Admin-Log-Sync//evil.com → //evil.com
    stripped = '/' + stripped.replace(/^\/+/, '');
    if (stripped === '/player.html') stripped = '/watch';
    res.writeHead(301, { Location: stripped + search });
    res.end();
    return;
  }

  // ── Clean player URL: /watch?... → player.html ──────────────────────────
  if (urlPath === '/watch' || urlPath === '/watch/') {
    return serveFile(res, path.join(ROOT_DIR, 'player.html'), '.html');
  }

  // ── Static assets ───────────────────────────────────────────────────────
  if (isAssetPath(urlPath)) {
    const fullPath = path.join(ROOT_DIR, urlPath);
    const ext      = path.extname(fullPath).toLowerCase();
    return serveFile(res, fullPath, ext);
  }

  // ── SPA: every other route serves index.html ────────────────────────────
  return serveFile(res, path.join(ROOT_DIR, 'index.html'), '.html');
});

server.listen(PORT, '0.0.0.0', async () => {
  console.log(`MOOVIED server running at http://0.0.0.0:${PORT}/`);
  console.log(`Player:  http://0.0.0.0:${PORT}/watch?video=...`);
  console.log(`API:     http://0.0.0.0:${PORT}/api/*`);
  console.log(`Legacy:  /Admin-Log-Sync/* → 301 redirected to clean URL`);
  ensureDir(DATA_DIR);
  buildSlugMapsFromPosts();
  console.log(`[slugs] loaded ${Object.keys(ID_BY_SLUG).length} pretty URLs from posts/`);
  // Refresh from GAS in background — and once an hour after that
  refreshSlugMapsFromGAS();
  setInterval(refreshSlugMapsFromGAS, 60 * 60 * 1000);
  await initCommentsFromGAS();
});
