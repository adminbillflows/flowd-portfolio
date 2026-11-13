import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { esc, pad, paragraphs, splitWords } from '../util.js';
import { coverHTML, mediaHTML } from '../media.js';

export const project = {
  mode: 'project',
  title: (ctx, params) => ctx.works.find((w) => w.slug === params.slug)?.title || 'Not found',
  render(ctx, params) {
    const i = ctx.works.findIndex((w) => w.slug === params.slug);
    const w = ctx.works[i];
    if (!w) return `<section class="page"><h1 class="page__title">Not found</h1><p><a href="/work" data-link>← All works</a></p></section>`;
    const next = ctx.works[(i + 1) % ctx.works.length];
    const meta = [['Client', w.client], ['Role', w.role], ['Team', w.credits], ['Year', w.year], ['Category', w.category]].filter(([, v]) => v);
    const videos = w.videos || [];
    return `<article class="page project">
      <header class="project__head">
        <p class="page__kicker"><a href="/work" data-link>Works</a> / ${pad(i + 1)} — ${esc(w.category)}</p>
        <h1 class="project__title">${splitWords(w.title)}</h1>
      </header>
      <div class="project__cover" data-parallax>${coverHTML(w, i)}</div>
      <div class="project__body">
        <dl class="project__meta">${meta.map(([k, v]) => `<div data-reveal><dt>${k}</dt><dd>${esc(v)}</dd></div>`).join('')}</dl>
        <div class="project__text" data-reveal>${paragraphs(w.description)}
          ${videos.length ? `<div class="project__watch">${videos.map((u, vi) => `<a class="watch" href="${esc(u)}" target="_blank" rel="noopener"><b>▶</b> ${platform(u)}${videos.length > 1 ? ' ' + pad(vi + 1) : ''} ↗</a>`).join('')}</div>` : ''}
        </div>
      </div>
      ${w.gallery?.length ? `<div class="project__gallery">${w.gallery.map((m, gi) => `<figure class="g g--${gi % 3}" data-reveal>${mediaHTML(m, w.title)}</figure>`).join('')}</div>` : ''}
      ${next && next !== w ? `<a class="project__next" href="/work/${encodeURIComponent(next.slug)}" data-link>
        <span class="page__kicker">Next project</span>
        <span class="project__next-title">${esc(next.title)} <span class="arrow">→</span></span>
      </a>` : ''}
    </article>`;
  },
  mount(el) {
    gsap.from(el.querySelectorAll('.project__title .w > span'), { yPercent: 110, duration: 1.3, stagger: 0.07, ease: 'expo.out', delay: 0.15 });
    const cover = el.querySelector('[data-parallax]');
    if (cover) {
      gsap.fromTo(cover, { clipPath: 'inset(18% 12% 0% 12%)' }, { clipPath: 'inset(0% 0% 0% 0%)', ease: 'none',
        scrollTrigger: { trigger: cover, start: 'top 85%', end: 'top 15%', scrub: true } });
      const media = cover.querySelector('img,video');
      if (media) gsap.fromTo(media, { yPercent: -8, scale: 1.15 }, { yPercent: 8, scale: 1.15, ease: 'none',
        scrollTrigger: { trigger: cover, start: 'top bottom', end: 'bottom top', scrub: true } });
    }
    ScrollTrigger.refresh();
  },
};

function platform(u) {
  return /youtu/.test(u) ? 'YouTube' : /vimeo/.test(u) ? 'Vimeo' : /instagram/.test(u) ? 'Instagram' : /facebook|fb\.watch/.test(u) ? 'Facebook' : 'Watch';
}
