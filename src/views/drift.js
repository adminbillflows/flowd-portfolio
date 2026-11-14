import gsap from 'gsap';
import { esc, pad } from '../util.js';
import { placeholderURL } from '../placeholder.js';
import { blip } from '../audio.js';

const STATIC = import.meta.env.VITE_STATIC === '1';
const rng = (seed) => () => { seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };

export const driftHTML = () => `<section class="gallery-page drift-page">
  <header class="gallery-page__head">
    <p class="page__kicker">03 — Works</p>
    <h1 class="gallery-page__title">Works</h1>
  </header>
  <div class="drift" data-drift><div class="drift__field"></div></div>
  <aside class="gal-info" aria-live="polite">
    <p class="gal-info__kicker"></p><h2 class="gal-info__title"></h2><p class="gal-info__meta"></p>
    <span class="gal-info__cta">▶ คลิกเพื่อดูงาน</span>
  </aside>
  <p class="gal-hint">ลากได้ทุกทิศ ภาพและวิดีโอลอยอยู่เอง</p>
</section>`;

/** Every work as a floating album: video tiles that keep moving, plus stills, drifting at different depths. */
export async function mountDrift(el, ctx) {
  let works = ctx.works;
  if (!STATIC) works = await fetch('/api/works').then((r) => r.json()).catch(() => ctx.works);
  if (!el.isConnected) return () => {};
  const phone = matchMedia('(max-width: 767px)').matches;
  const touch = matchMedia('(pointer: coarse)').matches;
  const rand = rng(7);

  // ---- items: one live "video" tile per work, plus a couple of its stills ----
  const items = [];
  works.forEach((w, wi) => {
    const pics = [];
    if (w.cover?.type === 'image') pics.push(w.cover.url);
    (w.stills || []).forEach((s) => pics.length < 5 && !pics.includes(s.url) && pics.push(s.url));
    if (!pics.length && w.cover?.type !== 'video') pics.push(placeholderURL(w, wi));
    items.push({ kind: 'video', w, wi, v: 0, pics, vid: w.cover?.type === 'video' ? w.cover.url : null });
    (w.stills || []).filter((s) => !pics.slice(0, 1).includes(s.url)).slice(0, 2).forEach((s) => items.push({ kind: 'still', w, wi, v: s.video || 0, pics: [s.url] }));
  });
  for (let i = items.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [items[i], items[j]] = [items[j], items[i]]; }

  const field = el.querySelector('.drift__field');
  const cell = phone ? 190 : 330;
  const n = items.length;
  const cols = Math.ceil(Math.sqrt(n * 1.7)), rows = Math.ceil(n / cols);
  const FW = cols * cell, FH = rows * cell, M = cell * 1.2;
  items.forEach((it, k) => {
    const z = 0.65 + rand() * 0.75;                       // depth: small and slow at the back, big and quick up front
    it.p = 0.55 + z * 0.45; it.z = z;
    const base = it.kind === 'video' ? cell * 1.0 : cell * 0.74;
    it.w_ = Math.round(base * z * (it.kind === 'still' && rand() < 0.28 ? 0.72 : 1));
    it.h_ = Math.round(it.w_ * (it.kind === 'still' && it.w_ < base * z ? 1 : 9 / 16));
    it.x = ((k % cols) + 0.15 + rand() * 0.7) * cell;
    it.y = (Math.floor(k / cols) + 0.15 + rand() * 0.7) * cell;
    it.rot = (rand() - 0.5) * 9; it.ph = rand() * 6.28; it.sp = 0.5 + rand() * 0.7;
  });
  field.innerHTML = items.map((it) => {
    const href = `/work/${encodeURIComponent(it.w.slug)}?play${it.v ? `&v=${it.v}` : ''}`;
    const media = it.vid
      ? `<video src="${esc(it.vid)}" muted loop playsinline autoplay preload="metadata"></video>`
      : it.pics.map((s, i) => `<img src="${esc(s)}" alt="${i ? '' : esc(it.w.title)}" loading="lazy" decoding="async" draggable="false"${i === 0 ? ' class="is-on"' : ''}>`).join('');
    return `<a class="fl-item fl-item--${it.kind}" href="${href}" data-link draggable="false" style="width:${it.w_}px;height:${it.h_}px;z-index:${Math.round(it.z * 100)}">
      ${media}${it.kind === 'video' ? `<span class="fl-badge">▶<em>${esc(it.w.title)}</em></span>` : ''}</a>`;
  }).join('');
  const els = [...field.children];
  gsap.from(field, { opacity: 0, scale: 1.06, duration: 1.4, ease: 'expo.out', delay: 0.1 });
  gsap.from(el.querySelector('.gallery-page__title'), { yPercent: 60, opacity: 0, duration: 1.2, ease: 'expo.out' });

  // video tiles keep moving: they cross-fade through their pictures
  const timers = els.map((a, i) => {
    const imgs = [...a.querySelectorAll('img')];
    if (imgs.length < 2) return 0;
    let k = 0;
    return setInterval(() => { imgs[k].classList.remove('is-on'); k = (k + 1) % imgs.length; imgs[k].classList.add('is-on'); }, 2200 + (i % 7) * 380);
  });

  // ---- info card (desktop hover) ----
  const info = el.querySelector('.gal-info');
  let dwell, hot = null;
  els.forEach((a, i) => {
    a.addEventListener('pointerenter', () => {
      if (touch) return;
      hot?.classList.remove('is-hot'); hot = a; a.classList.add('is-hot');
      ctx.setCursorLabel?.('Open'); blip(900, 0.012);
      clearTimeout(dwell);
      dwell = setTimeout(() => {
        const w = items[i].w;
        info.querySelector('.gal-info__kicker').textContent = [pad(items[i].wi + 1), w.category, w.year].filter(Boolean).join(' · ');
        info.querySelector('.gal-info__title').textContent = w.title;
        info.querySelector('.gal-info__meta').textContent = [w.client, w.role].filter(Boolean).join('  ·  ');
        info.classList.add('is-on');
      }, 350);
    });
    a.addEventListener('pointerleave', () => { a.classList.remove('is-hot'); if (hot === a) hot = null; ctx.setCursorLabel?.(''); clearTimeout(dwell); info.classList.remove('is-on'); });
  });

  // ---- motion: the whole album drifts diagonally; depth gives parallax; drag moves it any way ----
  const box = el.querySelector('[data-drift]');
  const s = { cx: 0, cy: 0, vx: 0, vy: 0, mx: 0.5, my: 0.5, ox: 0, oy: 0, drag: null, allow: null, lastUp: 0 };
  const onMove = (e) => {
    if (e.pointerType === 'mouse') { s.mx = e.clientX / innerWidth; s.my = e.clientY / innerHeight; }
    const d = s.drag;
    if (!d || e.pointerId !== d.id) return;
    if (!d.axis) {
      const nx = e.clientX - d.x0, ny = e.clientY - d.y0;
      if (Math.hypot(nx, ny) < (e.pointerType === 'mouse' ? 6 : 12)) return;
      d.axis = phone ? (Math.abs(nx) >= Math.abs(ny) ? 'x' : 'y') : 'xy';   // phones keep up/down swipes for changing page
      d.x = e.clientX; d.y = e.clientY;
    }
    if (d.axis === 'y') return;
    const dx = e.clientX - d.x, dy = d.axis === 'xy' ? e.clientY - d.y : 0;
    d.x = e.clientX; d.y = e.clientY;
    s.cx -= dx; s.cy -= dy; s.vx = -dx; s.vy = -dy;
  };
  const itemAt = (x, y) => document.elementFromPoint(x, y)?.closest('.fl-item');
  const onDown = (e) => {
    if (e.button > 0) return;
    s.drag = { id: e.pointerId, x0: e.clientX, y0: e.clientY, x: e.clientX, y: e.clientY, t: performance.now(), axis: null, item: itemAt(e.clientX, e.clientY) };
    s.vx = s.vy = 0;
  };
  const onUp = (e) => {
    const d = s.drag;
    if (!d || (e.pointerId !== undefined && e.pointerId !== d.id)) return;
    s.drag = null; s.lastUp = performance.now();
    if (e.type === 'pointerup' && !d.axis && d.item && performance.now() - d.t < 900) { s.allow = d.item; d.item.click(); }
  };
  const onWheel = (e) => { s.vx += e.deltaX * 0.08; s.vy += e.deltaY * 0.08; };
  field.addEventListener('click', (e) => {
    const item = e.target.closest('.fl-item');
    if (item && item === s.allow) { s.allow = null; return; }
    if (e.detail === 0 && performance.now() - s.lastUp > 600) return;
    e.preventDefault(); e.stopPropagation();
  }, true);
  box.addEventListener('pointerdown', onDown);
  addEventListener('pointermove', onMove, { passive: true });
  addEventListener('pointerup', onUp);
  addEventListener('pointercancel', onUp);
  addEventListener('wheel', onWheel, { passive: true });

  const t0 = performance.now();
  const tick = (time, dt) => {
    const k = dt / 16.7;
    const tt = (performance.now() - t0) / 1000;
    if (!s.drag) { s.cx += (s.vx + 0.32) * k; s.cy += (s.vy + (phone ? 0.08 : 0.17)) * k; s.vx *= Math.pow(0.95, k); s.vy *= Math.pow(0.95, k); }
    if (!touch) { s.ox += ((s.mx - 0.5) * -90 - s.ox) * 0.05; s.oy += ((s.my - 0.5) * -60 - s.oy) * 0.05; }
    items.forEach((it, i) => {
      let x = (it.x - s.cx * it.p) % FW; if (x < 0) x += FW;
      let y = (it.y - s.cy * it.p) % FH; if (y < 0) y += FH;
      x = x - M + s.ox * it.p; y = y - M * 0.6 + s.oy * it.p;
      const bobY = Math.sin(tt * it.sp + it.ph) * 7, bobR = Math.sin(tt * it.sp * 0.6 + it.ph) * 1.6;
      els[i].style.transform = `translate3d(${x.toFixed(1)}px,${(y + bobY).toFixed(1)}px,0) rotate(${(it.rot + bobR).toFixed(2)}deg)`;
    });
  };
  gsap.ticker.add(tick);
  return () => {
    gsap.ticker.remove(tick);
    timers.forEach((t) => clearInterval(t));
    removeEventListener('pointermove', onMove);
    removeEventListener('pointerup', onUp);
    removeEventListener('pointercancel', onUp);
    removeEventListener('wheel', onWheel);
    clearTimeout(dwell); ctx.setCursorLabel?.('');
  };
}
