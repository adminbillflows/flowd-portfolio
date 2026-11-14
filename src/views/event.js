import gsap from 'gsap';
import { esc, pad, paragraphs, splitWords } from '../util.js';
import { coverHTML } from '../media.js';
import { placeholderURL } from '../placeholder.js';
import { isPhone, panelsHTML, mountPanels } from '../phone.js';

const events = (ctx) => ctx.works.filter((w) => w.isEvent);
const platform = (u) => (/youtu/.test(u) ? 'YouTube' : /vimeo/.test(u) ? 'Vimeo' : /instagram/.test(u) ? 'Instagram' : /facebook|fb\.watch/.test(u) ? 'Facebook' : 'Video');

/** Everything inside one event: its videos (poster + play link) and its pictures. */
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
  return [...videos, ...pics];
}

const EMPTY = '<p class="empty ev-empty">Event ยังไม่มีข้อมูล เร็วๆ นี้ (เพิ่มได้จากหลังบ้าน ติ๊ก "เป็นงาน Event")</p>';

const card = (w, i, n) => `<a class="ev-card" href="/event/${encodeURIComponent(w.slug)}" data-link>
  <span class="ev-card__pic">${coverHTML(w, i)}</span>
  <span class="ev-card__num">${pad(n + 1)}</span>
  <strong class="ev-card__title">${esc(w.title)}</strong>
  <span class="ev-card__meta">${esc([w.client, w.year].filter(Boolean).join(' · '))}</span>
</a>`;

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
    if (el.querySelector('[data-ph]')) return mountPanels(el);
    gsap.from(el.querySelectorAll('.ev-card'), { opacity: 0, y: 40, duration: 1.1, stagger: 0.07, ease: 'expo.out', delay: 0.15 });
  },
};

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
      : `<span class="ev-item"><img src="${esc(m.src)}" alt="${esc(w.title)}" loading="lazy"></span>`;
    if (isPhone()) return panelsHTML({ view: 'event-detail', kicker: `${esc(w.title)}`, panels: [
      { cls: 'ph-evd ph-evd--intro', html: `<a class="back" href="/event" data-back><span class="arrow">←</span> กลับ</a><h1 class="project__title">${splitWords(w.title)}</h1><p class="ph-evd__meta">${esc([w.client, w.year, w.category].filter(Boolean).join(' · '))}</p>${w.description ? `<div class="ph-evd__text">${paragraphs(w.description)}</div>` : ''}<p class="ph__swipe">ปัดซ้ายเพื่อดูภาพและวิดีโอ →</p>` },
      ...items.map((m) => ({ cls: 'ph-evd', html: tile(m) })),
    ] });
    return `<article class="page event-detail">
      <header class="project__head">
        <a class="back" href="/event" data-back><span class="arrow">←</span> กลับ</a>
        <p class="page__kicker"><a href="/event" data-link>Event</a> / ${esc([w.client, w.year].filter(Boolean).join(' · '))}</p>
        <h1 class="project__title">${splitWords(w.title)}</h1>
      </header>
      ${w.description ? `<div class="project__text">${paragraphs(w.description)}</div>` : ''}
      <div class="ev-media">${items.map(tile).join('') || EMPTY}</div>
    </article>`;
  },
  mount(el) {
    if (el.querySelector('[data-ph]')) return mountPanels(el);
    gsap.from(el.querySelectorAll('.project__title .w > span'), { yPercent: 110, duration: 1.3, stagger: 0.07, ease: 'expo.out', delay: 0.15 });
    gsap.from(el.querySelectorAll('.ev-item'), { opacity: 0, y: 30, duration: 1, stagger: 0.04, ease: 'expo.out', delay: 0.3 });
  },
};
