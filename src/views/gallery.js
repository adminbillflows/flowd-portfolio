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
      <p class="gal-hint">เลื่อนเมาส์ไปซ้าย–ขวา หรือหมุนลูกกลิ้ง</p>
    </section>`;
  },
  async mount(el, ctx) {
    let works = ctx.works;
    if (!STATIC) works = await fetch('/api/works').then((r) => r.json()).catch(() => ctx.works);
    if (!el.isConnected) return;
    const items = collect(works);
    const rowsEl = el.querySelector('.gal__rows');
    const ROWS = innerHeight < 640 || innerWidth < 700 ? 2 : 3;
    const rows = Array.from({ length: ROWS }, () => []);
    items.forEach((it, i) => rows[i % ROWS].push(it));
    rowsEl.innerHTML = rows.map((r, ri) => `<div class="gal__row" data-row="${ri}">${r.map((it) => {
      const href = `/work/${encodeURIComponent(it.w.slug)}${it.v ? `?v=${it.v}` : ''}`;
      return `<a class="gal__item" href="${href}" data-link data-wi="${it.wi}" data-v="${it.v}">
        <span class="gal__frame"><img src="${esc(it.src)}" alt="${esc(it.w.title)}" loading="lazy" decoding="async"></span>
        <span class="gal__cap">${esc(it.w.title)}</span></a>`;
    }).join('')}</div>`).join('');

    gsap.from(rowsEl.querySelectorAll('.gal__item'), { opacity: 0, y: 40, duration: 1.1, stagger: { each: 0.025, from: 'start' }, ease: 'expo.out', delay: 0.1 });
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
    if (touch) return () => {}; // phones: native horizontal swipe, captions under each still

    // ---- mouse-driven auto scroll with parallax ----
    const rowEls = [...rowsEl.children];
    const speeds = ROWS === 3 ? [1, 1.25, 0.8] : [1, 1.2];
    let max = 0;
    const measure = () => { max = Math.max(...rowEls.map((r, i) => (r.scrollWidth - innerWidth + 80) / speeds[i])); };
    measure();
    const state = { target: 0, current: 0, mx: innerWidth / 2 };
    const onMove = (e) => { state.mx = e.clientX; };
    const onWheel = (e) => { state.target += (Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY) * 1.1; };
    addEventListener('pointermove', onMove, { passive: true });
    addEventListener('wheel', onWheel, { passive: true });
    addEventListener('resize', measure);
    const imgs = [...rowsEl.querySelectorAll('.gal__frame img')];
    const tick = (time, dt) => {
      // edge-scroll: the further the mouse is from the middle, the faster the wall glides that way
      const nx = (state.mx / innerWidth) * 2 - 1;
      const dead = 0.22;
      const push = Math.abs(nx) < dead ? 0 : Math.sign(nx) * Math.pow((Math.abs(nx) - dead) / (1 - dead), 2);
      state.target = gsap.utils.clamp(0, Math.max(0, max), state.target + push * 26 * (dt / 16.7));
      const prev = state.current;
      state.current += (state.target - state.current) * 0.08;
      const vel = state.current - prev;
      rowEls.forEach((r, i) => {
        const x = -Math.min(state.current * speeds[i], Math.max(0, r.scrollWidth - innerWidth + 80));
        r.style.transform = `translate3d(${x}px,0,0) skewX(${gsap.utils.clamp(-6, 6, -vel * 0.25)}deg)`;
      });
      // inner parallax: each frame's picture drifts against its card
      for (const img of imgs) {
        const b = img.parentElement.getBoundingClientRect();
        if (b.right < -50 || b.left > innerWidth + 50) continue;
        const c = (b.left + b.width / 2 - innerWidth / 2) / innerWidth;
        img.style.transform = `translate3d(${c * -14}%,0,0) scale(1.22)`;
      }
    };
    gsap.ticker.add(tick);
    return () => {
      gsap.ticker.remove(tick);
      removeEventListener('pointermove', onMove);
      removeEventListener('wheel', onWheel);
      removeEventListener('resize', measure);
      clearTimeout(dwell);
      ctx.setCursorLabel?.('');
    };
  },
};
