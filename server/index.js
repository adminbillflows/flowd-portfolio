// FlowD portfolio server: public API + password-protected back office.
// Storage is plain JSON files in ./data, uploads in ./data/uploads.
import express from 'express';
import multer from 'multer';
import cookieParser from 'cookie-parser';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { stillsFor } from './stills.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
loadEnv(path.join(root, '.env'));

const isProd = process.argv.includes('--prod') || process.env.NODE_ENV === 'production';
const PORT = Number(process.env.PORT) || 3000;
const PASSWORD = process.env.ADMIN_PASSWORD || 'flowd-admin';
const dataDir = process.env.DATA_DIR ? path.resolve(process.env.DATA_DIR) : path.join(root, 'data');
const uploadsDir = path.join(dataDir, 'uploads');
fs.mkdirSync(uploadsDir, { recursive: true });

// ---------- tiny JSON store ----------
const files = {
  works: path.join(dataDir, 'works.json'),
  settings: path.join(dataDir, 'settings.json'),
  messages: path.join(dataDir, 'messages.json'),
};
const seed = JSON.parse(fs.readFileSync(path.join(root, 'server', 'seed.json'), 'utf8'));
if (!fs.existsSync(files.works)) writeJSON(files.works, seed.works);
if (!fs.existsSync(files.settings)) writeJSON(files.settings, seed.settings);
if (!fs.existsSync(files.messages)) writeJSON(files.messages, []);

function readJSON(file) { return JSON.parse(fs.readFileSync(file, 'utf8')); }
function writeJSON(file, value) {
  const tmp = file + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(value, null, 2));
  fs.renameSync(tmp, file);
}
const getWorks = () => readJSON(files.works).sort((a, b) => a.order - b.order);

// ---------- auth ----------
const sessions = new Map(); // token -> expiry
const SESSION_MS = 7 * 24 * 3600 * 1000;
const failures = new Map(); // ip -> { count, until }

function checkPassword(input) {
  const a = crypto.createHash('sha256').update(String(input || '')).digest();
  const b = crypto.createHash('sha256').update(PASSWORD).digest();
  return crypto.timingSafeEqual(a, b);
}
function requireAdmin(req, res, next) {
  const token = req.cookies?.flowd_admin;
  const exp = token && sessions.get(token);
  if (!exp || exp < Date.now()) return res.status(401).json({ error: 'unauthorized' });
  next();
}

// ---------- uploads ----------
const upload = multer({
  storage: multer.diskStorage({
    destination: uploadsDir,
    filename: (_req, file, cb) => {
      const ext = path.extname(file.originalname).toLowerCase().replace(/[^.a-z0-9]/g, '').slice(0, 6);
      cb(null, `${Date.now().toString(36)}-${crypto.randomBytes(5).toString('hex')}${ext}`);
    },
  }),
  limits: { fileSize: 300 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => cb(null, /^(image|video)\//.test(file.mimetype)),
});
const mediaFields = upload.fields([{ name: 'cover', maxCount: 1 }, { name: 'gallery', maxCount: 60 }]);
const toMedia = (f) => ({ url: `/uploads/${f.filename}`, type: f.mimetype.startsWith('video') ? 'video' : 'image', name: f.originalname });
function removeUpload(media) {
  if (!media?.url?.startsWith('/uploads/')) return;
  const p = path.join(uploadsDir, path.basename(media.url));
  fs.rm(p, { force: true }, () => {});
}

function slugify(text, works, selfId) {
  let base = String(text || '').toLowerCase().normalize('NFC').trim()
    .replace(/[^\p{L}\p{M}\p{N}]+/gu, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'work';
  let slug = base, n = 2;
  while (works.some((w) => w.slug === slug && w.id !== selfId)) slug = `${base}-${n++}`;
  return slug;
}
function applyFields(work, body, works) {
  const str = (k, max = 200) => (body[k] !== undefined ? String(body[k]).slice(0, max).trim() : work[k]);
  work.title = str('title') || work.title || 'Untitled';
  work.category = str('category', 60) || work.category || 'Other';
  work.year = str('year', 10) ?? '';
  work.client = str('client') ?? '';
  work.role = str('role') ?? '';
  work.description = str('description', 20000) ?? '';
  work.credits = str('credits', 1000) ?? '';
  if (body.videos !== undefined) {
    work.videos = String(body.videos).split(/[\s,]+/).map((u) => u.trim()).filter((u) => /^https?:\/\/\S+$/.test(u)).slice(0, 40);
  }
  work.videos ||= [];
  work.color = /^#[0-9a-f]{6}$/i.test(body.color || '') ? body.color : work.color || '#4a6b8a';
  if (body.isEvent !== undefined) work.isEvent = body.isEvent === 'true' || body.isEvent === true;
  if (body.featured !== undefined) work.featured = body.featured === 'true' || body.featured === true;
  if (body.published !== undefined) work.published = body.published === 'true' || body.published === true;
  if (body.stillsHidden !== undefined) {
    let list = [];
    try { list = JSON.parse(body.stillsHidden); } catch { /* ignore */ }
    work.stillsHidden = Array.isArray(list) ? list.filter((u) => typeof u === 'string' && u.startsWith('/uploads/')).slice(0, 500) : [];
  }
  work.slug = slugify(body.slug || work.slug || work.title, works, work.id);
  work.updatedAt = new Date().toISOString();
}

// ---------- automatic covers from video links ----------
// When a work has no cover but has a YouTube or Vimeo link, download the video's thumbnail as its cover.
// (Instagram and Facebook need a login, so those works keep the generated cover until you upload one.)
async function thumbnailFor(url) {
  const yt = url.match(/(?:youtu\.be\/|[?&]v=|youtube\.com\/(?:shorts|embed)\/)([\w-]{11})/);
  if (yt) {
    for (const size of ['maxresdefault', 'sddefault', 'hqdefault']) {
      const r = await fetch(`https://i.ytimg.com/vi/${yt[1]}/${size}.jpg`);
      if (r.ok) return r;
    }
    return null;
  }
  if (/vimeo\.com\/\d+/.test(url)) {
    const meta = await fetch(`https://vimeo.com/api/oembed.json?url=${encodeURIComponent(url)}`).then((r) => (r.ok ? r.json() : null));
    if (!meta?.thumbnail_url) return null;
    const r = await fetch(meta.thumbnail_url.replace(/-d_\d+x\d+/, '-d_1280x720'));
    return r.ok ? r : null;
  }
  return null;
}
const coverQueue = new Set();
async function fillCover(id) {
  if (coverQueue.has(id)) return;
  coverQueue.add(id);
  try {
    const work = getWorks().find((w) => w.id === id);
    if (!work || work.cover || !work.videos?.length) return;
    for (const url of work.videos) {
      const res = await thumbnailFor(url).catch(() => null);
      if (!res) continue;
      const name = `${Date.now().toString(36)}-${crypto.randomBytes(5).toString('hex')}.jpg`;
      fs.writeFileSync(path.join(uploadsDir, name), Buffer.from(await res.arrayBuffer()));
      const works = getWorks();
      const fresh = works.find((w) => w.id === id);
      if (fresh && !fresh.cover) { fresh.cover = { url: `/uploads/${name}`, type: 'image', name: 'thumbnail', auto: true }; writeJSON(files.works, works); }
      else fs.rmSync(path.join(uploadsDir, name), { force: true });
      return;
    }
  } finally { coverQueue.delete(id); }
}
// gallery stills: made in the background, one work at a time
async function fillStills(id) {
  const work = getWorks().find((w) => w.id === id);
  if (!work) return;
  const key = 'v2:' + JSON.stringify(work.videos || []);
  if (work.stillsKey === key && work.stills?.length) return;
  const stills = await stillsFor(work, uploadsDir).catch(() => []);
  const works = getWorks();
  const fresh = works.find((w) => w.id === id);
  if (!fresh) return;
  fresh.stills = stills; fresh.stillsKey = key;
  writeJSON(files.works, works);
  console.log(`stills: ${fresh.title} → ${stills.length}`);
}
setTimeout(async () => {
  for (const w of getWorks()) await fillCover(w.id).catch(() => {});
  for (const w of getWorks()) await fillStills(w.id).catch(() => {});
}, 500);

// ---------- app ----------
const app = express();
app.disable('x-powered-by');
app.set('trust proxy', 1); // behind Render/other proxies: real client IP for login rate limit
app.use(express.json({ limit: '1mb' }));
app.use(cookieParser());
app.use('/uploads', express.static(uploadsDir, { maxAge: '7d' }));

// public API
app.get('/api/works', (_req, res) => res.json(getWorks().filter((w) => w.published).map((w) => {
  const hidden = new Set(w.stillsHidden || []);
  const { stillsHidden, stillsKey, ...pub } = w;
  return { ...pub, stills: (w.stills || []).filter((s) => !hidden.has(s.url)) };
})));
app.get('/api/settings', (_req, res) => res.json(readJSON(files.settings)));
app.post('/api/contact', (req, res) => {
  const { name = '', email = '', message = '' } = req.body || {};
  if (!String(message).trim() || !/^\S+@\S+\.\S+$/.test(email)) return res.status(400).json({ error: 'invalid' });
  const list = readJSON(files.messages);
  list.unshift({ id: crypto.randomUUID(), name: String(name).slice(0, 120), email: String(email).slice(0, 200),
    message: String(message).slice(0, 5000), createdAt: new Date().toISOString(), read: false });
  writeJSON(files.messages, list.slice(0, 1000));
  res.json({ ok: true });
});

// auth
app.post('/api/login', (req, res) => {
  const ip = req.ip;
  const f = failures.get(ip);
  if (f && f.until > Date.now()) return res.status(429).json({ error: 'too_many_attempts' });
  if (!checkPassword(req.body?.password)) {
    const count = (f?.count || 0) + 1;
    failures.set(ip, { count, until: count >= 5 ? Date.now() + 60_000 : 0 });
    return res.status(401).json({ error: 'wrong_password' });
  }
  failures.delete(ip);
  const token = crypto.randomBytes(32).toString('hex');
  sessions.set(token, Date.now() + SESSION_MS);
  res.cookie('flowd_admin', token, { httpOnly: true, sameSite: 'strict', secure: isProd && process.env.HTTPS === '1', maxAge: SESSION_MS });
  res.json({ ok: true });
});
app.post('/api/logout', (req, res) => {
  sessions.delete(req.cookies?.flowd_admin);
  res.clearCookie('flowd_admin');
  res.json({ ok: true });
});
app.get('/api/admin/me', requireAdmin, (_req, res) => res.json({ ok: true }));

// admin: works
app.get('/api/admin/works', requireAdmin, (_req, res) => res.json(getWorks()));

app.post('/api/admin/works', requireAdmin, mediaFields, (req, res) => {
  const works = getWorks();
  const now = new Date().toISOString();
  const work = { id: crypto.randomUUID(), featured: true, published: true, cover: null, gallery: [],
    order: works.length ? Math.min(...works.map((w) => w.order)) - 1 : 0, createdAt: now };
  applyFields(work, req.body, works);
  if (req.files?.cover?.[0]) work.cover = toMedia(req.files.cover[0]);
  work.gallery = (req.files?.gallery || []).map(toMedia);
  works.push(work);
  writeJSON(files.works, works);
  fillCover(work.id).then(() => fillStills(work.id)).catch(() => {});
  res.json(work);
});

app.put('/api/admin/works/:id', requireAdmin, mediaFields, (req, res) => {
  const works = getWorks();
  const work = works.find((w) => w.id === req.params.id);
  if (!work) return res.status(404).json({ error: 'not_found' });
  applyFields(work, req.body, works);
  const newCover = req.files?.cover?.[0];
  if (newCover || req.body.removeCover === '1') { removeUpload(work.cover); work.cover = newCover ? toMedia(newCover) : null; }
  // galleryOrder: JSON list of existing urls and "new:<i>" tokens (index into uploaded gallery files)
  const uploaded = (req.files?.gallery || []).map(toMedia);
  if (req.body.galleryOrder !== undefined) {
    let order = [];
    try { order = JSON.parse(req.body.galleryOrder); } catch {}
    const next = order.map((tok) => (String(tok).startsWith('new:') ? uploaded[+String(tok).slice(4)] : work.gallery.find((g) => g.url === tok))).filter(Boolean);
    work.gallery.filter((g) => !next.includes(g)).forEach(removeUpload);
    uploaded.filter((u) => !next.includes(u)).forEach((u) => next.push(u));
    work.gallery = next;
  } else work.gallery.push(...uploaded);
  writeJSON(files.works, works);
  fillCover(work.id).then(() => fillStills(work.id)).catch(() => {});
  res.json(work);
});

app.delete('/api/admin/works/:id', requireAdmin, (req, res) => {
  const works = getWorks();
  const work = works.find((w) => w.id === req.params.id);
  if (!work) return res.status(404).json({ error: 'not_found' });
  removeUpload(work.cover);
  work.gallery.forEach(removeUpload);
  writeJSON(files.works, works.filter((w) => w !== work));
  res.json({ ok: true });
});

app.post('/api/admin/works/reorder', requireAdmin, (req, res) => {
  const ids = Array.isArray(req.body?.ids) ? req.body.ids : [];
  const works = getWorks();
  works.forEach((w) => { const i = ids.indexOf(w.id); w.order = i === -1 ? ids.length + w.order : i; });
  writeJSON(files.works, works);
  res.json({ ok: true });
});

// admin: settings + messages
app.put('/api/admin/settings', requireAdmin, (req, res) => {
  const current = readJSON(files.settings);
  const next = { ...current };
  for (const k of ['siteName', 'tagline', 'about', 'email', 'phone', 'address']) {
    if (req.body[k] !== undefined) next[k] = String(req.body[k]).slice(0, 5000);
  }
  if (Array.isArray(req.body.services)) next.services = req.body.services.map(String).filter(Boolean).slice(0, 30);
  if (Array.isArray(req.body.socials)) next.socials = req.body.socials
    .filter((s) => s && s.label && s.url).map((s) => ({ label: String(s.label).slice(0, 40), url: String(s.url).slice(0, 300) })).slice(0, 12);
  writeJSON(files.settings, next);
  res.json(next);
});
app.get('/api/admin/messages', requireAdmin, (_req, res) => res.json(readJSON(files.messages)));
app.delete('/api/admin/messages/:id', requireAdmin, (req, res) => {
  writeJSON(files.messages, readJSON(files.messages).filter((m) => m.id !== req.params.id));
  res.json({ ok: true });
});
app.use('/api', (_req, res) => res.status(404).json({ error: 'not_found' }));
app.use((err, _req, res, _next) => { console.error(err); res.status(500).json({ error: err.message || 'server_error' }); });

// ---------- front end ----------
app.get('/admin', (req, res, next) => (req.originalUrl === '/admin' ? res.redirect('/admin/') : next()));
if (isProd) {
  const dist = path.join(root, 'dist');
  if (!fs.existsSync(dist)) { console.error('ยังไม่มีโฟลเดอร์ dist ให้รัน "npm run build" ก่อน'); process.exit(1); }
  app.use(express.static(dist, { index: false }));
  app.get('/admin/{*rest}', (_req, res) => res.sendFile(path.join(dist, 'admin', 'index.html')));
  app.get('/{*rest}', (_req, res) => res.sendFile(path.join(dist, 'index.html')));
} else {
  const { createServer } = await import('vite');
  const vite = await createServer({ root, server: { middlewareMode: true }, appType: 'custom' });
  app.use(vite.middlewares);
  // SPA fallback: serve the right html through Vite so HMR keeps working
  app.get('/{*rest}', async (req, res, next) => {
    try {
      const isAdmin = req.path.startsWith('/admin');
      const file = path.join(root, isAdmin ? 'admin/index.html' : 'index.html');
      const html = await vite.transformIndexHtml(req.originalUrl, fs.readFileSync(file, 'utf8'));
      res.type('html').send(html);
    } catch (e) { vite.ssrFixStacktrace?.(e); next(e); }
  });
}

app.listen(PORT, () => {
  console.log(`\n  FlowD ${isProd ? 'production' : 'dev'} server`);
  console.log(`  หน้าเว็บ:   http://localhost:${PORT}/`);
  console.log(`  หลังบ้าน:  http://localhost:${PORT}/admin/`);
  if (!process.env.ADMIN_PASSWORD) console.log('  (ยังไม่ได้ตั้ง ADMIN_PASSWORD ใน .env ใช้รหัสเริ่มต้น "flowd-admin")');
  console.log('');
});

function loadEnv(file) {
  if (!fs.existsSync(file)) return;
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/i);
    if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
}
