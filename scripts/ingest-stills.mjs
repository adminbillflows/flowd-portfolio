// Turns a folder of browser-captured Vimeo stills (still-vm-<id>-<n>.jpg + manifest.json)
// into server/seed-stills/: per work, keeps the best distinct frames (same scoring as the server),
// at most 12 per work, shared fairly between the work's videos.
// Usage: node scripts/ingest-stills.mjs <unzipped folder>
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import ffmpeg from 'ffmpeg-static';
import { rate } from '../server/stills.js';

const src = process.argv[2];
const out = path.join(path.dirname(new URL(import.meta.url).pathname), '../server/seed-stills');
fs.mkdirSync(out, { recursive: true });
const manifest = JSON.parse(fs.readFileSync(path.join(src, 'manifest.json'), 'utf8'));
const seed = JSON.parse(fs.readFileSync(path.join(out, '../seed.json'), 'utf8'));
const PER_WORK = 12, DUP = 12;

function sig(file) {
  const g = [...execFileSync(ffmpeg, ['-v', 'error', '-i', file, '-vf', 'scale=9:8:flags=area,format=gray', '-f', 'rawvideo', '-'])];
  const bits = [];
  for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) bits.push(g[y * 9 + x] < g[y * 9 + x + 1] ? 1 : 0);
  const rgb = execFileSync(ffmpeg, ['-v', 'error', '-i', file, '-vf', 'scale=96:54:flags=area,format=rgb24', '-f', 'rawvideo', '-']);
  return { bits, ...rate(rgb) };
}
const dist = (a, b) => a.bits.reduce((n, x, i) => n + (x !== b.bits[i]), 0);

for (const work of seed.works) {
  const ids = (work.videos || []).map((u) => u.match(/vimeo\.com\/(?:video\/)?(\d+)/)?.[1]).filter(Boolean);
  if (!ids.length) continue;
  // candidates per video, best first
  const per = ids.map((id) => (manifest[id] || []).map((m) => ({ id, file: m.file, t: m.t, s: sig(path.join(src, m.file)) }))
    .sort((a, b) => b.s.score - a.s.score));
  const kept = [];
  // round-robin over videos so each episode is represented, best frames first
  for (let round = 0; kept.length < PER_WORK && per.some((l) => l.length); round++) {
    for (const l of per) {
      while (l.length) {
        const c = l.shift();
        if (kept.some((k) => dist(k.s, c.s) < DUP)) continue;
        kept.push(c); break;
      }
      if (kept.length >= PER_WORK) break;
    }
  }
  for (const id of ids) {
    const mine = kept.filter((k) => k.id === id).sort((a, b) => a.t - b.t);
    const names = mine.map((k, i) => {
      const name = `still-vm-${id}-${i + 1}.jpg`;
      execFileSync(ffmpeg, ['-y', '-v', 'error', '-i', path.join(src, k.file), '-vf', 'scale=1280:-2', '-q:v', '4', path.join(out, name)]);
      return name;
    });
    fs.writeFileSync(path.join(out, `still-vm-${id}.json`), JSON.stringify(names));
  }
  console.log(`${work.title}: ${kept.length} kept of ${ids.reduce((n, id) => n + (manifest[id] || []).length, 0)}`);
}
