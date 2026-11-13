// Generates a branded placeholder cover for works that have no image yet.
// Used both as a WebGL texture and as a DOM <img> source.
const cache = new Map();

export function placeholderCanvas(work, index = 0) {
  const key = `${work.id}:${work.title}:${work.color}`;
  if (cache.has(key)) return cache.get(key);
  const c = document.createElement('canvas');
  c.width = 1200; c.height = 750;
  const g = c.getContext('2d');
  const base = work.color || '#ff5a1f';

  const grd = g.createLinearGradient(0, 0, c.width, c.height);
  grd.addColorStop(0, shade(base, 0.25));
  grd.addColorStop(0.55, base);
  grd.addColorStop(1, shade(base, -0.65));
  g.fillStyle = grd; g.fillRect(0, 0, c.width, c.height);

  // soft blobs
  const rnd = mulberry(hash(work.id || work.title));
  for (let i = 0; i < 5; i++) {
    const x = rnd() * c.width, y = rnd() * c.height, r = 180 + rnd() * 420;
    const rg = g.createRadialGradient(x, y, 0, x, y, r);
    rg.addColorStop(0, `rgba(255,255,255,${0.10 + rnd() * 0.12})`);
    rg.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = rg; g.fillRect(0, 0, c.width, c.height);
  }
  // flowing lines
  g.strokeStyle = 'rgba(255,255,255,0.10)'; g.lineWidth = 1.2;
  const phase = rnd() * 6;
  for (let l = 0; l < 26; l++) {
    g.beginPath();
    for (let x = -20; x <= c.width + 20; x += 20) {
      const y = 120 + l * 22 + Math.sin(x * 0.006 + phase + l * 0.22) * 60 + Math.sin(x * 0.013 + l) * 14;
      x < 0 ? g.moveTo(x, y) : g.lineTo(x, y);
    }
    g.stroke();
  }

  // film-strip perforations, a nod to the FlowD symbol
  g.fillStyle = 'rgba(0,0,0,0.35)';
  for (let x = 30; x < c.width; x += 64) { g.fillRect(x, 18, 30, 20); g.fillRect(x, c.height - 38, 30, 20); }
  g.fillStyle = 'rgba(255,255,255,0.92)';
  g.font = '600 24px Montserrat, Kanit, sans-serif';
  g.fillText(String(index + 1).padStart(2, '0') + '  ' + (work.category || '').toUpperCase() + (work.year ? '  ·  ' + work.year : ''), 56, 92);
  g.textAlign = 'right';
  g.fillText((work.role || '').toUpperCase(), c.width - 56, 92);
  g.textAlign = 'left';
  g.font = '400 112px Anton, Kanit, Impact, sans-serif';
  wrapText(g, (work.title || 'Untitled').toUpperCase(), 56, c.height - 86, c.width - 112, 116);

  cache.set(key, c);
  return c;
}

export function placeholderURL(work, index) {
  const c = placeholderCanvas(work, index);
  if (!c._url) c._url = c.toDataURL('image/jpeg', 0.82);
  return c._url;
}

function wrapText(g, text, x, bottom, maxW, lh) {
  const words = text.split(' ');
  const lines = [];
  let line = '';
  for (const w of words) {
    const t = line ? line + ' ' + w : w;
    if (g.measureText(t).width > maxW && line) { lines.push(line); line = w; } else line = t;
  }
  lines.push(line);
  lines.slice(-3).reverse().forEach((l, i) => g.fillText(l, x, bottom - i * lh));
}
function shade(hex, amt) {
  const n = parseInt(hex.slice(1), 16);
  const f = (v) => Math.max(0, Math.min(255, Math.round(amt > 0 ? v + (255 - v) * amt : v * (1 + amt))));
  return `rgb(${f(n >> 16)},${f((n >> 8) & 255)},${f(n & 255)})`;
}
function hash(s) { let h = 2166136261; for (const ch of String(s)) h = Math.imul(h ^ ch.charCodeAt(0), 16777619); return h >>> 0; }
function mulberry(a) { return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
