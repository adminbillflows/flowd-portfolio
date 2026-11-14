import gsap from 'gsap';
import { esc, pad } from '../util.js';
import { placeholderURL } from '../placeholder.js';
import { blip } from '../audio.js';

const STATIC = import.meta.env.VITE_STATIC === '1';

/** Every still of every work, interleaved so neighbouring frames come from different works. */
function collect(works) {
  const per = works.map((w, wi) => {
    const items = [];
    (w.stills || []).forEach((s) => items.push({ src: s.url, v: s.video, w, wi }));
    (w.gallery || []).filter((g) => g.type === 'image').forEach((g) => items.push({ src: g.url, v: 0, w, wi }));
    if (!items.length) items.push({ src: w.cover?.type === 'image' ? w.cover.url : placeholderURL(w, wi), v: 0, w, wi });
    return items;
  });
  const out = [];
  for (let round = 0; per.some((l) => l.length); round++) per.forEach((l) => l.length && out.push(l.shift()));
  return out;
}

export const gallery = {
  mode: 'gallery',
  title: () => 'Gallery',
  render() {
    return `<section class="gallery-page">
      <header class="gallery-page__head">
        <p class="page__kicker">03 — Stills</p>
        <h1 class="gallery-page__title">Gallery</h1>
      </header>
      <div class="gal" data-gal><div class="gal__rows"></div></div>
      <aside class="gal-info" aria-live="polite">
        <p class="gal-info__kicker"></p>
        <h2 class="gal-info__title"></h2>
        <p class="gal-info__meta"></p>
        <span class="gal-info__cta">▶ คลิกเพื่อดูวิดีโอ</span>
      </aside>
      <p class="gal-hint">ลาก เลื่อนเมาส์ไปขอบ หรือหมุนลูกกลิ้ง</p>
    </section>`;
  },
  async mount(el, ctx) {
    let works = ctx.works;
    if (!STATIC) works = await fetch('/api/works').then((r) => r.json()).catch(() => ctx.works);
    if (!el.isConnected) return;
    const items = collect(works);
    const rowsEl = el.querySelector('.gal__rows');
    const ROWS = 4;
    const rows = Array.from({ length: ROWS }, () => []);
    items.forEach((it, i) => rows[i % ROWS].push(it));
    // short rows are repeated so every row can loop endlessly round the globe
    const minPerRow = 14;
    rows.forEach((r) => { const base = r.slice(); while (base.length && r.length < minPerRow) r.push(...base); });
    rowsEl.innerHTML = rows.map((r, ri) => `<div class="gal__row" data-row="${ri}">${r.map((it, k) => {
      const href = `/work/${encodeURIComponent(it.w.slug)}${it.v ? `?v=${it.v}` : ''}`;
      const wide = (ri + k) % 5 === 2 ? ' gal__item--sq' : '';
      return `<a class="gal__item${wide}" href="${href}" data-link data-wi="${it.wi}" data-v="${it.v}" draggable="false">
        <span class="gal__frame"><img src="${esc(it.src)}" alt="${esc(it.w.title)}" loading="lazy" decoding="async" draggable="false"></span>
        <span class="gal__cap">${esc(it.w.title)}</span></a>`;
    }).join('')}</div>`).join('');

    gsap.from(rowsEl, { opacity: 0, scale: 0.9, duration: 1.6, ease: 'expo.out', delay: 0.1 });
    gsap.from(el.querySelector('.gallery-page__title'), { yPercent: 60, opacity: 0, duration: 1.2, ease: 'expo.out' });

    const touch = matchMedia('(pointer: coarse)').matches;
    const info = el.querySelector('.gal-info');
    const galEl = el.querySelector('[data-gal]');

    // ---- select effect + work info after resting on a still ----
    let dwell, active = null;
    const showInfo = (a) => {
      const w = works[+a.dataset.wi];
      const v = +a.dataset.v;
      info.querySelector('.gal-info__kicker').textContent = [pad(+a.dataset.wi + 1), w.category, w.year].filter(Boolean).join(' · ');
      info.querySelector('.gal-info__title').textContent = w.title + ((w.videos || []).length > 1 ? `  (${pad(v + 1)})` : '');
      info.querySelector('.gal-info__meta').textContent = [w.client, w.role, w.credits].filter(Boolean).join('  ·  ');
      info.classList.add('is-on');
    };
    rowsEl.querySelectorAll('.gal__item').forEach((a) => {
      a.addEventListener('pointerenter', () => {
        if (touch) return;
        active?.classList.remove('is-active');
        active = a; a.classList.add('is-active'); galEl.classList.add('has-active');
        ctx.setCursorLabel?.('Play');
        blip(1100, 0.012);
        clearTimeout(dwell); dwell = setTimeout(() => showInfo(a), 380);
      });
      a.addEventListener('pointerleave', () => {
        a.classList.remove('is-active'); galEl.classList.remove('has-active');
        ctx.setCursorLabel?.(''); clearTimeout(dwell); info.classList.remove('is-on');
        if (active === a) active = null;
      });
    });
    // ---- the globe: four rows drifting left at their own pace, wrapped round a big sphere ----
    const rowEls = [...rowsEl.children];
    const speeds = [0.32, 0.5, 0.26, 0.42];          // px per frame, each row its own pace
    const rowData = rowEls.map((r) => ({ el: r, items: [...r.children], w: [], L: 0, x: 0 }));
    let H = 0, R = 0, RV = 0, gap = 0, itemH = 0;
    const measure = () => {
      const box = rowsEl.getBoundingClientRect();
      H = box.height;
      gap = Math.max(10, innerWidth * 0.012);
      itemH = Math.min(((H - gap * (ROWS - 1)) / ROWS) * 0.82, innerWidth < 700 ? 74 : 150);
      R = innerWidth < 700 ? innerWidth * 0.58 : Math.max(innerWidth * 0.6, 600);           // horizontal radius of the globe
      RV = Math.max(H * 0.8, 300);                   // vertical radius (rows curve over the top and bottom)
      rowData.forEach((rd) => {
        let L = 0;
        rd.w = rd.items.map((a) => { const w = itemH * (a.classList.contains('gal__item--sq') ? 1.0 : 16 / 9); a.style.width = `${w}px`; a.style.height = `${itemH}px`; return w; });
        rd.pos = rd.w.map((w) => { const p = L + w / 2; L += w + gap; return p; });
        rd.L = L;
      });
    };
    measure();
    const state = { push: 0, mx: innerWidth / 2, off: 0, vel: 0, drag: null, moved: 0 };
    const onMove = (e) => {
      if (e.pointerType === 'mouse') state.mx = e.clientX;
      if (state.drag) {
        const dx = e.clientX - state.drag.x;
        state.drag.x = e.clientX; state.moved += Math.abs(dx);
        state.off += dx; state.vel = dx;
      }
    };
    const onDown = (e) => { state.drag = { x: e.clientX }; state.moved = 0; state.vel = 0; };
    const onUp = () => { state.drag = null; };
    const onWheel = (e) => { state.vel -= (Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY) * 0.06; };
    // a drag is not a click
    rowsEl.addEventListener('click', (e) => { if (state.moved > 6) { e.preventDefault(); e.stopPropagation(); } }, true);
    galEl.addEventListener('pointerdown', onDown);
    addEventListener('pointermove', onMove, { passive: true });
    addEventListener('pointerup', onUp);
    addEventListener('pointercancel', onUp);
    addEventListener('wheel', onWheel, { passive: true });
    addEventListener('resize', measure);
    const t0 = performance.now();
    const tick = (time, dt) => {
      const k = dt / 16.7;
      // mouse near an edge speeds the globe that way (desktop only)
      if (!touch && !state.drag) {
        const nx = (state.mx / innerWidth) * 2 - 1, dead = 0.3;
        const push = Math.abs(nx) < dead ? 0 : -Math.sign(nx) * Math.pow((Math.abs(nx) - dead) / (1 - dead), 2) * 9;
        state.push += (push - state.push) * 0.06;
      } else state.push *= 0.9;
      if (!state.drag) { state.off += (state.vel + state.push) * k; state.vel *= Math.pow(0.94, k); }
      const tt = (performance.now() - t0) / 1000;
      rowData.forEach((rd, ri) => {
        rd.x -= speeds[ri] * k;
        const shift = rd.x + state.off * (0.85 + ri * 0.1);
        // latitude of this row on the sphere
        const yLin = (ri - (ROWS - 1) / 2) * (itemH + gap);
        const phi = yLin / RV;
        const cosP = Math.cos(phi), sinP = Math.sin(phi);
        rd.items.forEach((a, j) => {
          let x = (rd.pos[j] + shift) % rd.L;
          if (x < 0) x += rd.L;
          x -= rd.L / 2;                                // centre the loop on the screen
          const th = x / R;
          if (Math.abs(th) > 1.75) { a.style.visibility = 'hidden'; return; }
          a.style.visibility = '';
          const bob = Math.sin(tt * 0.8 + j * 1.7 + ri) * 4;   // gentle float
          const X = R * Math.sin(th) * cosP;
          const Y = RV * sinP + bob;
          const Z = R * (Math.cos(th) * cosP - 1);
          a.style.transform = `translate(-50%,-50%) translate3d(${X.toFixed(1)}px,${Y.toFixed(1)}px,${Z.toFixed(1)}px) rotateY(${th.toFixed(4)}rad) rotateX(${(-phi).toFixed(4)}rad)`;
          a.style.opacity = Math.max(0, Math.min(1, (Math.cos(th) - 0.05) * 1.6)).toFixed(3);
          a.style.zIndex = Math.round(1000 + Z);
        });
      });
    };
    gsap.ticker.add(tick);
    return () => {
      gsap.ticker.remove(tick);
      removeEventListener('pointermove', onMove);
      removeEventListener('pointerup', onUp);
      removeEventListener('pointercancel', onUp);
      removeEventListener('wheel', onWheel);
      removeEventListener('resize', measure);
      clearTimeout(dwell);
      ctx.setCursorLabel?.('');
    };
  },
};
