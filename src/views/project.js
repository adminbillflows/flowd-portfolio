import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { esc, pad, paragraphs, splitWords } from '../util.js';
import { coverHTML, mediaHTML } from '../media.js';
import { audio, setSound } from '../audio.js';

const STATIC = import.meta.env.VITE_STATIC === '1';

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
        <a class="back" href="/work" data-back><span class="arrow">←</span> กลับ</a>
        <p class="page__kicker"><a href="/work" data-link>Works</a> / ${pad(i + 1)} — ${esc(w.category)}</p>
        <h1 class="project__title">${splitWords(w.title)}</h1>
      </header>
      ${videos.some(embedURL) && !STATIC ? playerHTML(w, i, videos) : `<div class="project__cover" data-parallax>${coverHTML(w, i)}</div>`}
      <div class="project__body">
        <dl class="project__meta">${meta.map(([k, v]) => `<div data-reveal><dt>${k}</dt><dd>${esc(v)}</dd></div>`).join('')}</dl>
        <div class="project__text" data-reveal>${paragraphs(w.description)}
          ${videos.length && (STATIC || !videos.some(embedURL)) ? `<div class="project__watch">${videos.map((u, vi) => `<a class="watch" href="${esc(u)}" target="_blank" rel="noopener"><b>▶</b> ${platform(u)}${videos.length > 1 ? ' ' + pad(vi + 1) : ''} ↗</a>`).join('')}</div>` : ''}
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
    const player = el.querySelector('[data-player]');
    if (player) mountPlayer(player);
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

// ---------- video player ----------
// Turns YouTube / Vimeo / Instagram / Facebook links into embeddable player URLs.
function embedURL(u, autoplay = false) {
  const ap = autoplay ? 1 : 0;
  let m = u.match(/(?:youtu\.be\/|[?&]v=|youtube\.com\/(?:shorts|embed)\/)([\w-]{11})/);
  if (m) return `https://www.youtube-nocookie.com/embed/${m[1]}?autoplay=${ap}&rel=0&modestbranding=1&playsinline=1`;
  m = u.match(/vimeo\.com\/(?:video\/)?(\d+)/);
  if (m) return `https://player.vimeo.com/video/${m[1]}?autoplay=${ap}&title=0&byline=0&portrait=0&color=ff5a1f`;
  m = u.match(/instagram\.com\/(?:reel|p)\/([\w-]+)/);
  if (m) return `https://www.instagram.com/reel/${m[1]}/embed/`;
  if (/facebook\.com|fb\.watch/.test(u)) return `https://www.facebook.com/plugins/video.php?href=${encodeURIComponent(u)}&show_text=false&autoplay=${autoplay}`;
  return null;
}
const isVertical = (u) => /instagram\.com|facebook\.com\/reel/.test(u);

function playerHTML(w, i, videos) {
  const list = videos.filter((u) => embedURL(u));
  return `<section class="player ${isVertical(list[0]) ? 'is-vertical' : ''}" data-player data-videos='${esc(JSON.stringify(list))}'>
    <div class="player__screen">
      <div class="player__poster">${coverHTML(w, i)}</div>
      <button class="player__play" aria-label="เล่นวิดีโอ"><span class="player__icon"></span><span class="player__label">Play</span></button>
    </div>
    <div class="player__bar">
      ${list.length > 1 ? `<div class="player__list">${list.map((u, vi) => `<button class="player__item ${vi ? '' : 'is-active'}" data-i="${vi}">${pad(vi + 1)}</button>`).join('')}</div>` : '<span></span>'}
      <a class="player__ext" href="${esc(list[0])}" target="_blank" rel="noopener">เปิดใน ${platform(list[0])} ↗</a>
    </div>
  </section>`;
}

function mountPlayer(root) {
  const list = JSON.parse(root.dataset.videos);
  const screen = root.querySelector('.player__screen');
  const ext = root.querySelector('.player__ext');
  let current = 0;
  const play = (n) => {
    current = n;
    const u = list[n];
    root.classList.toggle('is-vertical', isVertical(u));
    // pause the ambient sound while a video plays
    if (audio.enabled) { setSound(false); root.dataset.resumeSound = '1'; document.body.classList.remove('sound-on'); }
    screen.innerHTML = `<iframe src="${esc(embedURL(u, true))}" title="video ${n + 1}" allow="autoplay; fullscreen; picture-in-picture; encrypted-media" allowfullscreen></iframe>`;
    ext.href = u; ext.textContent = `เปิดใน ${platform(u)} ↗`;
    root.querySelectorAll('.player__item').forEach((b) => b.classList.toggle('is-active', +b.dataset.i === n));
    root.classList.add('is-playing');
  };
  root.querySelector('.player__play').addEventListener('click', () => play(0));
  root.querySelectorAll('.player__item').forEach((b) => b.addEventListener('click', () => play(+b.dataset.i)));
  gsap.from(root, { opacity: 0, y: 60, duration: 1.2, ease: 'expo.out', delay: 0.3 });
}
