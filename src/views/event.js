import gsap from 'gsap';
import { esc, pad, paragraphs, splitWords } from '../util.js';
import { coverHTML } from '../media.js';
import { placeholderURL } from '../placeholder.js';
import { blip, whoosh } from '../audio.js';
import { isPhone, panelsHTML, mountPanels } from '../phone.js';

const events = (ctx) => ctx.works.filter((w) => w.isEvent);
const platform = (u) => (/youtu/.test(u) ? 'YouTube' : /vimeo/.test(u) ? 'Vimeo' : /instagram/.test(u) ? 'Instagram' : /facebook|fb\.watch/.test(u) ? 'Facebook' : 'Video');
const rng = (seed) => () => { seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };

/** Everything inside one event: its videos (poster + play link), short clips and pictures. */
function media(w, wi) {
  const cover = w.cover?.type === 'image' ? w.cover.url : placeholderURL(w, wi);
  const slug = encodeURIComponent(w.slug);
  const videos = (w.videos || []).map((u, v) => {
    const still = (w.stills || []).find((s) => s.video === v);
    return { kind: 'video', src: still?.url || cover, href: `/work/${slug}?play${v ? `&v=${v}` : ''}`, label: `${platform(u)}${(w.videos || []).length > 1 ? ' ' + pad(v + 1) : ''}` };
  });
  const seen = new Set();
  const pics = [...(w.gallery || []).filter((g) => g.type === 'image').map((g) => g.url), ...(w.stills || []).map((s) => s.url)]
    .filter((u) => !seen.has(u) && seen.add(u)).map((src) => ({ kind: 'image', src }));
  // short clips uploaded straight into the gallery (no YouTube/Vimeo link) play inline, muted and looping
  const clips = (w.gallery || []).filter((g) => g.type === 'video').map((g) => ({ kind: 'clip', src: g.url }));
  // interleave clips between pictures so moving tiles are spread through the album
  const mixed = [];
  const n = Math.max(clips.length, pics.length);
  for (let i = 0; i < n; i++) { if (clips[i]) mixed.push(clips[i]); if (pics[i]) mixed.push(pics[i]); }
  return [...videos, ...mixed];
}

const EMPTY = '<p class="empty ev-empty">Event ยังไม่มีข้อมูล เร็วๆ นี้ (เพิ่มได้จากหลังบ้าน ติ๊ก "เป็นงาน Event")</p>';

const card = (w, i, n) => `<a class="ev-card" href="/event/${encodeURIComponent(w.slug)}" data-link>
  <span class="ev-card__pic"><span class="ev-card__layer">${coverHTML(w, i)}</span><span class="ev-card__fx" aria-hidden="true"></span></span>
  <span class="ev-card__num">${pad(n + 1)}</span>
  <strong class="ev-card__title">${esc(w.title)}</strong>
  <span class="ev-card__meta">${esc([w.client, w.year].filter(Boolean).join(' · '))}</span>
</a>`;

/** Cover parallax: the picture sits larger than its frame and slides against the pointer and the scroll. */
function mountParallax(el) {
  const cards = [...el.querySelectorAll('.ev-card')];
  const fine = matchMedia('(pointer: fine)').matches;
  const offs = [];
  cards.forEach((c) => {
    const layer = c.querySelector('.ev-card__layer');
    const fx = c.querySelector('.ev-card__fx');
    const xTo = gsap.quickTo(layer, 'xPercent', { duration: 0.9, ease: 'power3' });
    const yTo = gsap.quickTo(layer, 'yPercent', { duration: 0.9, ease: 'power3' });
    const st = { py: 0 };
    const move = (e) => {
      const r = c.querySelector('.ev-card__pic').getBoundingClientRect();
      const nx = (e.clientX - r.left) / r.width - 0.5, ny = (e.clientY - r.top) / r.height - 0.5;
      xTo(nx * -7); st.py = ny * -6;
      fx.style.setProperty('--mx', `${((nx + 0.5) * 100).toFixed(1)}%`);
      fx.style.setProperty('--my', `${((ny + 0.5) * 100).toFixed(1)}%`);
    };
    const enter = () => { c.classList.add('is-hot'); whoosh({ up: true }); };
    const leave = () => { c.classList.remove('is-hot'); xTo(0); st.py = 0; whoosh({ up: false, vol: 0.035, dur: 0.4, hit: false }); };
    if (fine) { c.addEventListener('pointermove', move); c.addEventListener('pointerenter', enter); c.addEventListener('pointerleave', leave); }
    c.addEventListener('click', () => whoosh({ up: true, vol: 0.09, dur: 0.7 }));
    offs.push({ c, yTo, st });
  });
  // scroll parallax plus a slow idle drift so the cover is never still
  const t0 = performance.now();
  const tick = () => {
    const tt = (performance.now() - t0) / 1000;
    offs.forEach(({ c, yTo, st }, i) => {
      const r = c.getBoundingClientRect();
      const p = (r.top + r.height / 2) / innerHeight - 0.5;       // -0.5 top … 0.5 bottom
      yTo(p * -9 + st.py + Math.sin(tt * 0.6 + i) * 1.2);
    });
  };
  gsap.ticker.add(tick);
  return () => gsap.ticker.remove(tick);
}

export const eventList = {
  mode: 'event',
  title: () => 'Event',
  render(ctx) {
    const list = events(ctx);
    if (isPhone()) return list.length
      ? panelsHTML({ view: 'event', kicker: `02 — Event · ${pad(list.length)}`, panels: list.map((w) => ({ cls: 'ph-event', html: card(w, ctx.works.indexOf(w), list.indexOf(w)) })) })
      : panelsHTML({ view: 'event', kicker: '02 — Event', panels: [{ html: EMPTY }] });
    return `<section class="page event">
      <header class="page__head">
        <p class="page__kicker">02 — Event</p>
        <h1 class="page__title">Event <sup>${pad(list.length)}</sup></h1>
      </header>
      ${list.length ? `<div class="ev-grid">${list.map((w) => card(w, ctx.works.indexOf(w), list.indexOf(w))).join('')}</div>` : EMPTY}
    </section>`;
  },
  mount(el) {
    const off = mountParallax(el);
    if (el.querySelector('[data-ph]')) { const offP = mountPanels(el); return () => { off(); offP?.(); }; }
    gsap.from(el.querySelectorAll('.ev-card'), { opacity: 0, y: 40, duration: 1.1, stagger: 0.07, ease: 'expo.out', delay: 0.15 });
    return off;
  },
};

/** The event's videos and pictures as a floating album: they drift on their own at different depths, drag to move. */
function mountFloat(el, ctx, w) {
  const box = el.querySelector('[data-evfloat]');
  const field = box.querySelector('.drift__field');
  const base = [...field.children];
  if (!base.length) return () => {};
  const rand = rng(11);
  const fine = matchMedia('(pointer: fine)').matches;
  const cell = innerWidth < 1100 ? 270 : 330;
  // repeat the tiles until they cover the screen, so the album wraps around without gaps
  const need = Math.max(base.length, Math.ceil((box.clientWidth * box.clientHeight) / (cell * cell) * 1.25));
  for (let k = base.length; k < need; k++) {
    const c = base[k % base.length].cloneNode(true);
    c.querySelectorAll('img').forEach((i) => i.setAttribute('alt', ''));
    field.appendChild(c);
  }
  const els = [...field.children];
  els.forEach((a) => a.querySelector('video')?.play?.().catch(() => {}));
  const n = els.length;
  const cols = Math.max(3, Math.ceil(Math.sqrt(n * (box.clientWidth / Math.max(box.clientHeight, 1))))), rows = Math.ceil(n / cols);
  const FW = Math.max(cols * cell, box.clientWidth + cell * 2), FH = Math.max(rows * cell, box.clientHeight + cell * 2), M = cell * 1.1;
  const items = els.map((a, k) => {
    const z = 0.6 + rand() * 0.8;
    const tall = a.dataset.ar === 'tall';
    const wpx = Math.round((tall ? cell * 0.48 : cell * 0.92) * z);
    a.style.width = `${wpx}px`;
    a.style.height = `${Math.round(tall ? wpx * 16 / 9 : wpx * (a.dataset.ar === 'auto' ? 0.75 : 0.5625))}px`;
    const img = a.dataset.ar === 'auto' && a.querySelector('img');
    if (img) {
      const fit = () => { if (img.naturalWidth) a.style.height = `${Math.round(wpx * Math.min(1.45, Math.max(0.5, img.naturalHeight / img.naturalWidth)))}px`; };
      img.complete ? fit() : img.addEventListener('load', fit, { once: true });
    }
    a.style.zIndex = Math.round(z * 100);
    return { z, p: 0.5 + z * 0.5, x: ((k % cols) + 0.1 + rand() * 0.8) * (FW / cols), y: (Math.floor(k / cols) + 0.1 + rand() * 0.8) * (FH / rows), rot: (rand() - 0.5) * 8, ph: rand() * 6.28, sp: 0.45 + rand() * 0.6 };
  });
  gsap.from(field, { opacity: 0, scale: 1.08, duration: 1.6, ease: 'expo.out', delay: 0.1 });
  whoosh({ up: true, vol: 0.06, dur: 0.9 });

  els.forEach((a) => {
    a.addEventListener('pointerenter', () => { if (!fine) return; a.classList.add('is-hot'); blip(900, 0.012); if (a.tagName === 'A') ctx.setCursorLabel?.('Play'); });
    a.addEventListener('pointerleave', () => { a.classList.remove('is-hot'); ctx.setCursorLabel?.(''); });
  });

  const s = { cx: 0, cy: 0, vx: 0, vy: 0, mx: 0.5, my: 0.5, ox: 0, oy: 0, drag: null, allow: null, lastUp: 0 };
  const onMove = (e) => {
    if (e.pointerType === 'mouse') { s.mx = e.clientX / innerWidth; s.my = e.clientY / innerHeight; }
    const d = s.drag;
    if (!d || e.pointerId !== d.id) return;
    if (!d.moved && Math.hypot(e.clientX - d.x0, e.clientY - d.y0) < (e.pointerType === 'mouse' ? 6 : 12)) return;
    d.moved = true;
    const dx = e.clientX - d.x, dy = e.clientY - d.y;
    d.x = e.clientX; d.y = e.clientY;
    s.cx -= dx; s.cy -= dy; s.vx = -dx; s.vy = -dy;
  };
  const onDown = (e) => {
    if (e.button > 0) return;
    s.drag = { id: e.pointerId, x0: e.clientX, y0: e.clientY, x: e.clientX, y: e.clientY, t: performance.now(), moved: false, item: document.elementFromPoint(e.clientX, e.clientY)?.closest('a.fl-item') };
    s.vx = s.vy = 0;
  };
  const onUp = (e) => {
    const d = s.drag;
    if (!d || (e.pointerId !== undefined && e.pointerId !== d.id)) return;
    s.drag = null; s.lastUp = performance.now();
    if (e.type === 'pointerup' && !d.moved && d.item && performance.now() - d.t < 900) { s.allow = d.item; d.item.click(); }
  };
  const onWheel = (e) => { s.vx += e.deltaX * 0.08; s.vy += e.deltaY * 0.08; };
  field.addEventListener('click', (e) => {
    const item = e.target.closest('a.fl-item');
    if (item && item === s.allow) { s.allow = null; return; }
    if (e.detail === 0 && performance.now() - s.lastUp > 600) return;
    e.preventDefault(); e.stopPropagation();
  }, true);
  box.addEventListener('pointerdown', onDown);
  addEventListener('pointermove', onMove, { passive: true });
  addEventListener('pointerup', onUp);
  addEventListener('pointercancel', onUp);
  box.addEventListener('wheel', onWheel, { passive: true });

  const t0 = performance.now();
  const tick = (time, dt) => {
    const k = dt / 16.7;
    const tt = (performance.now() - t0) / 1000;
    if (!s.drag) { s.cx += (s.vx + 0.28) * k; s.cy += (s.vy + 0.14) * k; s.vx *= Math.pow(0.95, k); s.vy *= Math.pow(0.95, k); }
    if (fine) { s.ox += ((s.mx - 0.5) * -90 - s.ox) * 0.05; s.oy += ((s.my - 0.5) * -60 - s.oy) * 0.05; }
    items.forEach((it, i) => {
      let x = (it.x - s.cx * it.p) % FW; if (x < 0) x += FW;
      let y = (it.y - s.cy * it.p) % FH; if (y < 0) y += FH;
      x = x - M + s.ox * it.p; y = y - M * 0.6 + s.oy * it.p;
      const bobY = Math.sin(tt * it.sp + it.ph) * 9, bobR = Math.sin(tt * it.sp * 0.6 + it.ph) * 1.8;
      els[i].style.transform = `translate3d(${x.toFixed(1)}px,${(y + bobY).toFixed(1)}px,0) rotate(${(it.rot + bobR).toFixed(2)}deg)`;
    });
  };
  gsap.ticker.add(tick);
  return () => {
    gsap.ticker.remove(tick);
    removeEventListener('pointermove', onMove);
    removeEventListener('pointerup', onUp);
    removeEventListener('pointercancel', onUp);
    ctx.setCursorLabel?.('');
  };
}

const ratio = (m) => (m.kind === 'clip' ? 'tall' : m.kind === 'video' ? 'wide' : 'auto');

export const eventDetail = {
  mode: 'event-detail',
  title: (ctx, p) => ctx.works.find((w) => w.slug === p.slug)?.title || 'Event',
  render(ctx, p) {
    const wi = ctx.works.findIndex((w) => w.slug === p.slug);
    const w = ctx.works[wi];
    if (!w) return `<section class="page"><h1 class="page__title">Not found</h1><p><a href="/event" data-link>← Event</a></p></section>`;
    const items = media(w, wi);
    const tile = (m) => m.kind === 'video'
      ? `<a class="ev-item ev-item--video" href="${m.href}" data-link><img src="${esc(m.src)}" alt="" loading="lazy"><span class="ev-item__play">▶ ${esc(m.label)}</span></a>`
      : m.kind === 'clip'
        ? `<span class="ev-item"><video src="${esc(m.src)}" muted loop playsinline autoplay preload="metadata"></video></span>`
        : `<span class="ev-item"><img src="${esc(m.src)}" alt="${esc(w.title)}" loading="lazy"></span>`;
    if (isPhone()) return panelsHTML({ view: 'event-detail', kicker: `${esc(w.title)}`, panels: [
      { cls: 'ph-evd ph-evd--intro', html: `<a class="back" href="/event" data-back><span class="arrow">←</span> กลับ</a><h1 class="project__title">${splitWords(w.title)}</h1><p class="ph-evd__meta">${esc([w.client, w.year, w.category].filter(Boolean).join(' · '))}</p>${w.description ? `<div class="ph-evd__text">${paragraphs(w.description)}</div>` : ''}<p class="ph__swipe">ปัดซ้ายเพื่อดูภาพและวิดีโอ →</p>` },
      ...items.map((m) => ({ cls: 'ph-evd ph-evd--float', html: tile(m) })),
    ] });
    const flTile = (m) => {
      const ar = ratio(m);
      if (m.kind === 'video') return `<a class="fl-item fl-item--video" data-ar="${ar}" href="${m.href}" data-link draggable="false"><img class="is-on" src="${esc(m.src)}" alt="" draggable="false"><span class="fl-badge">▶<em>${esc(m.label)}</em></span></a>`;
      if (m.kind === 'clip') return `<span class="fl-item fl-item--clip" data-ar="${ar}"><video src="${esc(m.src)}" muted loop playsinline autoplay preload="auto"></video></span>`;
      return `<span class="fl-item" data-ar="${ar}"><img class="is-on" src="${esc(m.src)}" alt="${esc(w.title)}" decoding="async" draggable="false"></span>`;
    };
    return `<section class="gallery-page drift-page ev-float-page">
      <header class="gallery-page__head ev-float__head">
        <a class="back" href="/event" data-back><span class="arrow">←</span> กลับ</a>
        <div>
          <p class="page__kicker"><a href="/event" data-link>Event</a>${w.client || w.year ? ` / ${esc([w.client, w.year].filter(Boolean).join(' · '))}` : ''}</p>
          <h1 class="gallery-page__title ev-float__title">${esc(w.title)}</h1>
          ${w.description ? `<div class="ev-float__text">${paragraphs(w.description)}</div>` : ''}
        </div>
      </header>
      ${items.length ? `<div class="drift ev-float" data-evfloat><div class="drift__field">${items.map(flTile).join('')}</div></div>` : EMPTY}
      <p class="gal-hint">ลากได้ทุกทิศ ภาพและวิดีโอลอยอยู่เอง</p>
    </section>`;
  },
  mount(el, ctx, p) {
    if (el.querySelector('[data-ph]')) {
      el.querySelectorAll('.ph-evd--float .ev-item').forEach((it, i) => it.style.setProperty('--d', `${(i % 5) * -1.3}s`));
      return mountPanels(el);
    }
    gsap.from(el.querySelector('.ev-float__head'), { y: 30, opacity: 0, duration: 1.2, ease: 'expo.out' });
    const w = ctx.works.find((x) => x.slug === p?.slug) || {};
    if (!el.querySelector('[data-evfloat]')) return;
    return mountFloat(el, ctx, w);
  },
};
