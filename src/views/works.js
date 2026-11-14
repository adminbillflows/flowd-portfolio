import gsap from 'gsap';
import { esc, pad } from '../util.js';
import { coverHTML } from '../media.js';
import { blip } from '../audio.js';
import { isPhone, panelsHTML, mountPanels } from '../phone.js';

const PER_PAGE = 4;
function phoneHTML(ctx) {
  const pages = [];
  for (let i = 0; i < ctx.works.length; i += PER_PAGE) pages.push(ctx.works.slice(i, i + PER_PAGE).map((w, k) => [w, i + k]));
  return panelsHTML({ view: 'works', kicker: `02 — Works · ${pad(ctx.works.length)}`, panels: pages.map((list) => ({ cls: 'ph-works', html: list.map(([w, i]) => `
    <a class="ph-work" href="/work/${encodeURIComponent(w.slug)}?play" data-link>
      <span class="ph-work__thumb">${coverHTML(w, i)}</span>
      <span class="ph-work__num">${pad(i + 1)}</span>
      <span class="ph-work__title">${esc(w.title)}</span>
      <span class="ph-work__cat">${esc(w.category)}${w.year ? ` · ${esc(w.year)}` : ''}</span>
    </a>`).join('') })) });
}


export const works = {
  mode: 'works',
  title: () => 'Works',
  render(ctx) {
    if (isPhone()) return phoneHTML(ctx);
    const cats = [...new Set(ctx.works.map((w) => w.category))];
    const active = import.meta.env.VITE_STATIC === '1' ? 'all' : new URLSearchParams(location.search).get('c') || 'all';
    const count = (c) => ctx.works.filter((w) => c === 'all' || w.category === c).length;
    return `<section class="page works">
      <header class="page__head">
        <p class="page__kicker">02 — Index</p>
        <h1 class="page__title">Works <sup>${pad(ctx.works.length)}</sup></h1>
      </header>
      <div class="filters" role="tablist">
        ${['all', ...cats].map((c) => `<button class="filter ${c === active ? 'is-active' : ''}" data-cat="${esc(c)}" role="tab" aria-selected="${c === active}">
          ${c === 'all' ? 'All' : esc(c)}<sup>${pad(count(c))}</sup></button>`).join('')}
      </div>
      <ol class="work-list">
        ${ctx.works.map((w, i) => `<li class="work-row" data-cat="${esc(w.category)}" data-i="${i}">
          <a href="/work/${encodeURIComponent(w.slug)}" data-link>
            <span class="work-row__num">${pad(i + 1)}</span>
            <span class="work-row__thumb">${coverHTML(w, i)}</span>
            <span class="work-row__title">${esc(w.title)}</span>
            <span class="work-row__cat">${esc(w.category)}</span>
            <span class="work-row__year">${esc(w.year)}</span>
          </a></li>`).join('')}
      </ol>
      ${ctx.works.length ? '' : '<p class="empty">ยังไม่มีผลงาน เพิ่มได้จากหลังบ้านที่ /admin</p>'}
    </section>`;
  },
  mount(el, ctx) {
    if (el.querySelector('[data-ph]')) return mountPanels(el);
    const rows = [...el.querySelectorAll('.work-row')];
    const apply = (cat, animate = true) => {
      el.querySelectorAll('.filter').forEach((b) => { const on = b.dataset.cat === cat; b.classList.toggle('is-active', on); b.setAttribute('aria-selected', on); });
      const show = rows.filter((r) => cat === 'all' || r.dataset.cat === cat);
      rows.forEach((r) => (r.hidden = !show.includes(r)));
      if (animate) gsap.fromTo(show, { opacity: 0, y: 30 }, { opacity: 1, y: 0, duration: 0.9, stagger: 0.04, ease: 'expo.out' });
      if (import.meta.env.VITE_STATIC === '1') return;
      const url = new URL(location.href);
      cat === 'all' ? url.searchParams.delete('c') : url.searchParams.set('c', cat);
      history.replaceState(history.state, '', url);
    };
    el.querySelectorAll('.filter').forEach((b) => b.addEventListener('click', () => { blip(660); apply(b.dataset.cat); }));
    apply(import.meta.env.VITE_STATIC === '1' ? 'all' : new URLSearchParams(location.search).get('c') || 'all', false);
    gsap.from(rows.filter((r) => !r.hidden), { opacity: 0, y: 40, duration: 1.1, stagger: 0.05, ease: 'expo.out', delay: 0.2 });

    // floating preview that follows the cursor
    const preview = document.querySelector('.preview');
    const media = preview.querySelector('.preview__media');
    if (matchMedia('(pointer: coarse)').matches || !preview) return;
    const pos = { x: innerWidth / 2, y: innerHeight / 2 };
    const xTo = gsap.quickTo(preview, 'x', { duration: 0.6, ease: 'power3' });
    const yTo = gsap.quickTo(preview, 'y', { duration: 0.6, ease: 'power3' });
    const rTo = gsap.quickTo(preview, 'rotation', { duration: 0.8, ease: 'power3' });
    const move = (e) => { rTo(gsap.utils.clamp(-12, 12, (e.clientX - pos.x) * 0.4)); pos.x = e.clientX; pos.y = e.clientY; xTo(e.clientX); yTo(e.clientY); };
    addEventListener('pointermove', move);
    rows.forEach((r) => {
      r.addEventListener('pointerenter', () => {
        const w = ctx.works[+r.dataset.i];
        media.innerHTML = coverHTML(w, +r.dataset.i);
        gsap.to(preview, { opacity: 1, scale: 1, duration: 0.5, ease: 'expo.out' });
        blip(980, 0.02);
      });
      r.addEventListener('pointerleave', () => gsap.to(preview, { opacity: 0, scale: 0.85, duration: 0.4, ease: 'expo.out' }));
    });
    return () => { removeEventListener('pointermove', move); gsap.to(preview, { opacity: 0, duration: 0.2 }); };
  },
};
