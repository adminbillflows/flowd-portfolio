// Captures still frames from each work's videos for the Gallery page.
// - Vimeo: reads the player config for the HLS stream, downloads the best (≤1080p) rendition
//   with Node (the static ffmpeg build crashes on network input), finds every shot change with
//   ffmpeg's scene detector, and grabs one sharp frame from the middle of each shot.
//   More distinct shots → more stills.
// Each frame is scored like a stills editor would: colourful, detailed, well exposed frames win
// (food, flowers, smoke, cars, landscapes, props); dull close-ups dominated by skin lose, but a
// face shot still makes it when its colours are strong.
// - YouTube: only the frames YouTube publishes are reachable (3 auto frames + the thumbnail).
// Every candidate is checked: near-black/white or flat frames (fades, logo slates) are dropped,
// and near-duplicates (perceptual hash) are skipped, so each work gets distinct scenes only.
// Results are cached per video in still-<kind>-<id>.json next to the jpgs.
import { execFile } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

let ffmpeg = null;
try { ffmpeg = (await import('ffmpeg-static')).default; } catch { /* optional */ }

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36';
const PER_WORK = 12;     // max stills for one work
const PER_VIDEO = 10;    // max stills from one video
const SCENE = 0.32;      // scene-change threshold (0..1)
const DUP = 12;          // hamming distance (of 64 bits) below which two frames count as the same shot

function ff(args, { timeout = 120000, raw = false } = {}) {
  return new Promise((resolve, reject) => {
    if (!ffmpeg) return reject(new Error('ffmpeg-static missing'));
    execFile(ffmpeg, args, { timeout, maxBuffer: 32 * 1024 * 1024, encoding: raw ? 'buffer' : 'utf8' },
      (err, stdout, stderr) => (err ? reject(Object.assign(err, { stderr: String(stderr).slice(-400) })) : resolve({ stdout, stderr })));
  });
}

/** 64-bit difference hash, brightness stats and a "nice still" score for an image file. */
async function signature(file) {
  const { stdout: g } = await ff(['-v', 'error', '-i', file, '-vf', 'scale=9:8:flags=area,format=gray', '-f', 'rawvideo', '-'], { raw: true, timeout: 20000 });
  const px = [...g];
  if (px.length < 72) return null;
  const bits = [];
  for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) bits.push(px[y * 9 + x] < px[y * 9 + x + 1] ? 1 : 0);
  const mean = px.reduce((a, b) => a + b, 0) / px.length;
  const sd = Math.sqrt(px.reduce((a, b) => a + (b - mean) ** 2, 0) / px.length);
  const { stdout: rgb } = await ff(['-v', 'error', '-i', file, '-vf', `scale=${W}:${H}:flags=area,format=rgb24`, '-f', 'rawvideo', '-'], { raw: true, timeout: 20000 });
  return { bits, mean, sd, ...rate(rgb) };
}

const W = 96, H = 54;
/**
 * Scores a small RGB frame (0..~1):
 *  - colour: Hasler–Süsstrunk colourfulness
 *  - detail: mean gradient (texture of food, petals, smoke, metal, foliage)
 *  - skin: share of skin-tone pixels in the centre (a big face filling the frame)
 * Skin only costs points when the frame is not colourful, so a vivid portrait still passes.
 */
export function rate(buf) {
  const n = W * H;
  if (buf.length < n * 3) return { score: 0, colour: 0, detail: 0, skin: 0 };
  let srg = 0, syb = 0, srg2 = 0, syb2 = 0, skin = 0, centre = 0, grad = 0;
  const lum = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const r = buf[i * 3], g = buf[i * 3 + 1], b = buf[i * 3 + 2];
    const rg = r - g, yb = 0.5 * (r + g) - b;
    srg += rg; syb += yb; srg2 += rg * rg; syb2 += yb * yb;
    lum[i] = 0.299 * r + 0.587 * g + 0.114 * b;
    const x = i % W, y = (i / W) | 0;
    if (x > W * 0.2 && x < W * 0.8 && y < H * 0.85) {
      centre++;
      const cb = 128 - 0.169 * r - 0.331 * g + 0.5 * b, cr = 128 + 0.5 * r - 0.419 * g - 0.081 * b;
      if (cb > 80 && cb < 125 && cr > 136 && cr < 170 && r > g && lum[i] > 50) skin++;
    }
  }
  for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) {
    const i = y * W + x;
    grad += Math.abs(lum[i + 1] - lum[i - 1]) + Math.abs(lum[i + W] - lum[i - W]);
  }
  const mrg = srg / n, myb = syb / n;
  const colour = Math.sqrt(srg2 / n - mrg * mrg + (syb2 / n - myb * myb)) + 0.3 * Math.sqrt(mrg * mrg + myb * myb);
  const detail = grad / ((W - 2) * (H - 2));
  const skinShare = skin / centre;
  const c = Math.min(colour / 80, 1.2);   // ~80 = "very colourful"
  const d = Math.min(detail / 28, 1.2);
  const facePenalty = skinShare > 0.22 ? (skinShare - 0.22) * (c > 0.75 ? 0.4 : 1.6) : 0;
  return { score: 0.55 * c + 0.45 * d - facePenalty, colour, detail, skin: skinShare };
}
const distance = (a, b) => a.bits.reduce((n, bit, i) => n + (bit !== b.bits[i]), 0);
const usable = (s) => s && s.mean > 22 && s.mean < 238 && s.sd > 14;

/**
 * Keeps the best-scoring frames that are usable and not near-duplicates of a better one
 * (also across `seen`, the frames already kept for this work). Returned in time order.
 */
async function pickDistinct(files, max, seen) {
  const rated = [];
  for (const f of files) {
    const s = await signature(f).catch(() => null);
    if (usable(s)) rated.push({ f, s }); else fs.rmSync(f, { force: true });
  }
  rated.sort((a, b) => b.s.score - a.s.score);
  const kept = [];
  for (const r of rated) {
    if (kept.length >= max || seen.some((o) => distance(o, r.s) < DUP)) { fs.rmSync(r.f, { force: true }); continue; }
    seen.push(r.s); kept.push(r);
  }
  return kept.sort((a, b) => files.indexOf(a.f) - files.indexOf(b.f)).map((r) => r.f);
}

// Stills captured elsewhere and committed to the repo (Vimeo refuses requests from cloud servers,
// so those frames are captured in a browser once and shipped in server/seed-stills/).
const SEED_DIR = path.join(path.dirname(new URL(import.meta.url).pathname), 'seed-stills');
function fromSeed(dir, kind, id) {
  try {
    const names = JSON.parse(fs.readFileSync(path.join(SEED_DIR, `still-${kind}-${id}.json`), 'utf8'));
    for (const n of names) {
      const to = path.join(dir, n);
      if (!fs.existsSync(to)) fs.copyFileSync(path.join(SEED_DIR, n), to);
    }
    return names;
  } catch { return null; }
}

const cachePath = (dir, kind, id) => path.join(dir, `still-${kind}-${id}.json`);
function readCache(dir, kind, id) {
  try {
    const names = JSON.parse(fs.readFileSync(cachePath(dir, kind, id), 'utf8'));
    if (names.every((n) => fs.existsSync(path.join(dir, n)))) return names;
  } catch { /* none */ }
  return null;
}
const writeCache = (dir, kind, id, names) => fs.writeFileSync(cachePath(dir, kind, id), JSON.stringify(names));

// ---------- YouTube ----------
async function youtubeStills(id, dir, seen) {
  const cached = readCache(dir, 'yt', id);
  if (cached) { for (const n of cached) { const s = await signature(path.join(dir, n)).catch(() => null); if (s) seen.push(s); } return cached; }
  const files = [];
  for (const n of [1, 2, 3, 'default']) {
    const file = path.join(dir, `still-yt-${id}-${n === 'default' ? 0 : n}.jpg`);
    let res = await fetch(`https://i.ytimg.com/vi/${id}/maxres${n}.jpg`).catch(() => null);
    let crop = false;
    if (!res?.ok) { res = await fetch(`https://i.ytimg.com/vi/${id}/hq${n}.jpg`).catch(() => null); crop = true; }
    if (!res?.ok) continue;
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length < 4000) continue; // YouTube's grey "no image" placeholder
    if (crop && ffmpeg) {
      const tmp = file + '.src.jpg';
      fs.writeFileSync(tmp, buf);
      // hq frames are 4:3 with black bars: keep the 16:9 middle
      await ff(['-y', '-v', 'error', '-i', tmp, '-vf', 'crop=iw:iw*9/16,scale=1280:-2', '-q:v', '3', file]).catch(() => fs.copyFileSync(tmp, file));
      fs.rmSync(tmp, { force: true });
    } else fs.writeFileSync(file, buf);
    files.push(file);
  }
  const names = (ffmpeg ? await pickDistinct(files, PER_VIDEO, seen) : files).map((f) => path.basename(f));
  if (names.length) writeCache(dir, 'yt', id, names);
  return names;
}

// ---------- Vimeo ----------
async function vimeoConfig(id) {
  // Vimeo answers some servers with 401/403; try the ways a real embed would ask before giving up.
  const site = process.env.RENDER_EXTERNAL_URL || process.env.PUBLIC_URL || '';
  const referers = [site && `${site.replace(/\/$/, '')}/`, 'https://vimeo.com/', null].filter((r) => r !== '');
  const tried = [];
  for (const ref of referers) {
    const headers = { 'User-Agent': UA, Accept: 'text/html,application/json;q=0.9,*/*;q=0.8', 'Accept-Language': 'en-US,en;q=0.9' };
    if (ref) { headers.Referer = ref; headers.Origin = new URL(ref).origin; }
    const direct = await fetch(`https://player.vimeo.com/video/${id}/config`, { headers }).catch(() => null);
    if (direct?.ok) { try { return await direct.json(); } catch { /* fall through */ } }
    const res = await fetch(`https://player.vimeo.com/video/${id}`, { headers }).catch(() => null);
    if (res?.ok) {
      const m = (await res.text()).match(/window\.playerConfig\s*=\s*(\{.*?\});?\s*<\/script>/s);
      if (m) return JSON.parse(m[1]);
    }
    tried.push(`${ref ? new URL(ref).host : 'no-referer'}: config ${direct?.status ?? 'err'} page ${res?.status ?? 'err'}`);
  }
  throw new Error(tried.join('; '));
}

/** Picks the best (≤1080p) video rendition from an HLS master playlist. */
async function bestRendition(master) {
  const text = await getText(master);
  if (!text.includes('#EXT-X-STREAM-INF')) return { url: master, text };
  const lines = text.split('\n');
  const vars = [];
  lines.forEach((l, i) => {
    if (!l.startsWith('#EXT-X-STREAM-INF')) return;
    const h = +(l.match(/RESOLUTION=\d+x(\d+)/) || [])[1] || 0;
    const uri = lines.slice(i + 1).find((x) => x.trim() && !x.startsWith('#'));
    if (uri) vars.push({ h, url: new URL(uri.trim(), master).href });
  });
  vars.sort((a, b) => a.h - b.h);
  const pick = vars.filter((v) => v.h <= 1080).pop() || vars[0];
  return { url: pick.url, text: await getText(pick.url) };
}
async function getText(url) {
  const r = await fetch(url, { headers: { 'User-Agent': UA } });
  if (!r.ok) throw new Error(`playlist ${r.status}`);
  return r.text();
}

/** Downloads a media playlist (TS or fMP4, with byte ranges) into one local file. */
export async function downloadHls(master, file, maxBytes = 200 * 1024 * 1024) {
  const { url, text } = await bestRendition(master);
  const parts = [];
  let range = null, lastEnd = 0;
  for (const raw of text.split('\n')) {
    const l = raw.trim();
    if (!l) continue;
    if (l.startsWith('#EXT-X-KEY') && !/METHOD=NONE/.test(l)) throw new Error('encrypted stream');
    if (l.startsWith('#EXT-X-MAP')) {
      const uri = l.match(/URI="([^"]+)"/)?.[1];
      const br = l.match(/BYTERANGE="(\d+)(?:@(\d+))?"/);
      if (uri) parts.push({ url: new URL(uri, url).href, range: br ? [+(br[2] || 0), +br[1]] : null });
    } else if (l.startsWith('#EXT-X-BYTERANGE')) {
      const m = l.match(/:(\d+)(?:@(\d+))?/);
      range = [m[2] !== undefined ? +m[2] : lastEnd, +m[1]];
    } else if (!l.startsWith('#')) {
      parts.push({ url: new URL(l, url).href, range });
      if (range) lastEnd = range[0] + range[1];
      range = null;
    }
  }
  if (!parts.length) throw new Error('empty playlist');
  const out = fs.createWriteStream(file);
  let total = 0;
  try {
    for (const p of parts) {
      const headers = { 'User-Agent': UA };
      if (p.range) headers.Range = `bytes=${p.range[0]}-${p.range[0] + p.range[1] - 1}`;
      const r = await fetch(p.url, { headers });
      if (!r.ok) throw new Error(`segment ${r.status}`);
      const buf = Buffer.from(await r.arrayBuffer());
      total += buf.length;
      if (total > maxBytes) break;
      if (!out.write(buf)) await new Promise((res) => out.once('drain', res));
    }
  } finally {
    await new Promise((res) => out.end(res));
  }
  return file;
}

/** Shot boundaries (seconds) from ffmpeg's scene score. */
async function shotCuts(file) {
  const { stderr } = await ff(['-hide_banner', '-i', file, '-an',
    '-vf', `scale=320:-2,select='gt(scene,${SCENE})',showinfo`, '-f', 'null', '-'], { timeout: 240000 });
  return [...stderr.matchAll(/pts_time:([\d.]+)/g)].map((m) => +m[1]);
}
async function duration(file) {
  const { stderr } = await ff(['-hide_banner', '-i', file], {}).catch((e) => ({ stderr: e.stderr || String(e.message) }));
  const m = String(stderr).match(/Duration: (\d+):(\d+):([\d.]+)/);
  return m ? +m[1] * 3600 + +m[2] * 60 + +m[3] : 0;
}

/** Grabs frames at the given times from a local video, returns written paths. */
async function grab(src, times, prefix) {
  const out = [];
  for (let i = 0; i < times.length; i++) {
    const file = `${prefix}-${i + 1}.jpg`;
    // thumbnail=8 picks the least blurry of the next ~8 frames
    const ok = await ff(['-y', '-v', 'error', '-ss', times[i].toFixed(2), '-i', src, '-an',
      '-vf', 'thumbnail=8,scale=1280:-2', '-frames:v', '1', '-q:v', '3', file], { timeout: 60000 }).then(() => true, () => false);
    if (ok && fs.existsSync(file)) out.push(file);
  }
  return out;
}

/** Times worth grabbing: the middle of every shot (skipping flash cuts), up to `limit`. */
export function shotMiddles(cuts, dur, limit) {
  const edges = [0, ...cuts.filter((t) => t > 0.4 && t < dur - 0.4), dur];
  let shots = [];
  for (let i = 0; i < edges.length - 1; i++) {
    const len = edges[i + 1] - edges[i];
    if (len >= 0.6) shots.push({ at: edges[i] + len / 2, len });
  }
  if (!shots.length) shots = [0.2, 0.5, 0.8].map((p) => ({ at: dur * p, len: 1 }));
  return shots.sort((a, b) => b.len - a.len).slice(0, limit).map((s) => s.at).sort((a, b) => a - b);
}

/** Every distinct, good-looking shot of a local video file, best `max` kept. */
export async function framesFromFile(src, max, prefix, seen) {
  const dur = await duration(src);
  const cuts = await shotCuts(src).catch((e) => { console.warn('stills: scene scan failed', e.message); return []; });
  const times = shotMiddles(cuts, dur || 30, 40);
  const files = await grab(src, times, prefix);
  return pickDistinct(files, max, seen);
}

async function vimeoStills(id, dir, seen) {
  const cached = fromSeed(dir, 'vm', id) || readCache(dir, 'vm', id);
  if (cached) { for (const n of cached) { const s = await signature(path.join(dir, n)).catch(() => null); if (s) seen.push(s); } return cached; }
  if (!ffmpeg) throw new Error('ffmpeg-static missing');
  const cfg = await vimeoConfig(id);
  const hls = Object.values(cfg.request?.files?.hls?.cdns || {})[0]?.url;
  if (!hls) throw new Error('no HLS stream in config');
  const tmp = path.join(dir, `.vm-${id}.mp4`);
  let files;
  try {
    await downloadHls(hls, tmp);
    files = await framesFromFile(tmp, PER_VIDEO, path.join(dir, `still-vm-${id}`), seen);
  } finally { fs.rmSync(tmp, { force: true }); }
  const names = files.map((f) => path.basename(f));
  if (names.length) writeCache(dir, 'vm', id, names);
  return names;
}

/** Returns [{ url, video }] for one work, making any missing frames. */
export async function stillsFor(work, uploadsDir) {
  const vids = (work.videos || [])
    .map((u, video) => {
      const yt = u.match(/(?:youtu\.be\/|[?&]v=|youtube\.com\/(?:shorts|embed)\/)([\w-]{11})/);
      const vm = u.match(/vimeo\.com\/(?:video\/)?(\d+)/);
      return yt ? { kind: 'yt', id: yt[1], video } : vm ? { kind: 'vm', id: vm[1], video } : null;
    })
    .filter(Boolean);
  const seen = [];
  const perVideo = [];
  for (const v of vids) {
    const names = await (v.kind === 'yt' ? youtubeStills(v.id, uploadsDir, seen) : vimeoStills(v.id, uploadsDir, seen))
      .catch((e) => { console.warn(`stills: ${v.kind} ${v.id} failed: ${e.message}`); return []; });
    perVideo.push(names.map((n) => ({ url: `/uploads/${n}`, video: v.video })));
  }
  // share the work's budget fairly: take one from each video in turn
  const result = [];
  for (let r = 0; result.length < PER_WORK && perVideo.some((l) => l.length); r++) {
    for (const l of perVideo) if (l.length && result.length < PER_WORK) result.push(l.shift());
  }
  return result;
}
