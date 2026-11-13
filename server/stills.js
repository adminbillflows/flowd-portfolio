// Captures still frames from each work's videos for the Gallery page.
// - YouTube: uses the three frames YouTube itself extracts (at ~25/50/75% of the clip), cropped to 16:9.
// - Vimeo: reads the public embed page for the stream URL, then grabs frames with ffmpeg
//   using its "thumbnail" filter, which picks the most representative frame around each point.
// Files get stable names (still-<platform>-<id>-<n>.jpg) so they are only made once per disk.
import { execFile } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

let ffmpeg = null;
try { ffmpeg = (await import('ffmpeg-static')).default; } catch { /* optional */ }

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36';
const PER_WORK = 6;

function run(args, timeout = 60000) {
  return new Promise((resolve, reject) => {
    if (!ffmpeg) return reject(new Error('no ffmpeg'));
    execFile(ffmpeg, args, { timeout }, (err) => (err ? reject(err) : resolve()));
  });
}

async function youtubeStills(id, count, dir) {
  const out = [];
  for (let n = 1; n <= count; n++) {
    const name = `still-yt-${id}-${n}.jpg`;
    const file = path.join(dir, name);
    if (!fs.existsSync(file)) {
      let res = await fetch(`https://i.ytimg.com/vi/${id}/maxres${n}.jpg`).catch(() => null);
      let crop = false;
      if (!res?.ok) { res = await fetch(`https://i.ytimg.com/vi/${id}/hq${n}.jpg`).catch(() => null); crop = true; }
      if (!res?.ok) continue;
      const buf = Buffer.from(await res.arrayBuffer());
      if (crop && ffmpeg) {
        const tmp = file + '.src.jpg';
        fs.writeFileSync(tmp, buf);
        // hq frames are 4:3 with black bars: keep the 16:9 middle
        await run(['-y', '-i', tmp, '-vf', 'crop=iw:iw*9/16,scale=1280:-2', '-q:v', '3', file]).catch(() => fs.copyFileSync(tmp, file));
        fs.rmSync(tmp, { force: true });
      } else fs.writeFileSync(file, buf);
    }
    out.push(name);
  }
  return out;
}

async function vimeoStills(id, count, dir) {
  const names = Array.from({ length: count }, (_, i) => `still-vm-${id}-${i + 1}.jpg`);
  if (names.every((n) => fs.existsSync(path.join(dir, n)))) return names;
  if (!ffmpeg) return [];
  const html = await fetch(`https://player.vimeo.com/video/${id}`, { headers: { 'User-Agent': UA, Referer: 'https://vimeo.com/' } }).then((r) => (r.ok ? r.text() : '')).catch(() => '');
  const m = html.match(/window\.playerConfig\s*=\s*(\{.*?\});?\s*<\/script>/s);
  if (!m) return [];
  let cfg;
  try { cfg = JSON.parse(m[1]); } catch { return []; }
  const hls = Object.values(cfg.request?.files?.hls?.cdns || {})[0]?.url;
  const dur = cfg.video?.duration || 30;
  if (!hls) return [];
  const points = count === 1 ? [0.5] : count === 2 ? [0.3, 0.7] : [0.2, 0.5, 0.8];
  const out = [];
  for (let i = 0; i < count; i++) {
    const file = path.join(dir, names[i]);
    if (!fs.existsSync(file)) {
      const at = Math.max(0, dur * points[i] - 1).toFixed(2);
      const ok = await run(['-y', '-loglevel', 'error', '-user_agent', UA, '-ss', at, '-i', hls,
        '-vf', 'thumbnail=24,scale=1280:-2', '-frames:v', '1', '-q:v', '3', file]).then(() => true).catch(() => false);
      if (!ok || !fs.existsSync(file)) continue;
    }
    out.push(names[i]);
  }
  return out;
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
  if (!vids.length) return [];
  const per = Math.max(1, Math.min(3, Math.floor(PER_WORK / vids.length)));
  const result = [];
  for (const v of vids.slice(0, PER_WORK)) {
    const names = v.kind === 'yt' ? await youtubeStills(v.id, per, uploadsDir) : await vimeoStills(v.id, per, uploadsDir);
    names.forEach((n) => result.push({ url: `/uploads/${n}`, video: v.video }));
  }
  return result;
}
