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
    const list = STATIC ? [] : videos.filter((u) => embedURL(u));
    if (list.length) return stageHTML(w, i, list, meta, next);
    return `<article class="page project">
      <header class="project__head">
        <a class="back" href="/work" data-back><span class="arrow">←</span> กลับ</a>
        <p class="page__kicker"><a href="/work" data-link>Event</a> / ${pad(i + 1)} — ${esc(w.category)}</p>
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
    const stage = el.querySelector('[data-stage]');
    if (stage) return mountStage(el, stage);
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

// ---------- full-screen video stage ----------
// Turns YouTube / Vimeo / Instagram / Facebook links into embeddable player URLs.
function embedURL(u) {
  let m = u.match(/(?:youtu\.be\/|[?&]v=|youtube\.com\/(?:shorts|embed)\/)([\w-]{11})/);
  if (m) return `https://www.youtube-nocookie.com/embed/${m[1]}?autoplay=1&rel=0&modestbranding=1&playsinline=1&enablejsapi=1&origin=${encodeURIComponent(location.origin)}`;
  m = u.match(/vimeo\.com\/(?:video\/)?(\d+)/);
  if (m) return `https://player.vimeo.com/video/${m[1]}?autoplay=1&title=0&byline=0&portrait=0&color=ff5a1f`;
  m = u.match(/instagram\.com\/(?:reel|p)\/([\w-]+)/);
  if (m) return `https://www.instagram.com/reel/${m[1]}/embed/`;
  if (/facebook\.com|fb\.watch/.test(u)) return `https://www.facebook.com/plugins/video.php?href=${encodeURIComponent(u)}&show_text=false&autoplay=true`;
  return null;
}
const isVertical = (u) => /instagram\.com|facebook\.com\/reel/.test(u);
const kind = (u) => (/youtu/.test(u) ? 'yt' : /vimeo/.test(u) ? 'vimeo' : 'other');

function stageHTML(w, i, list, meta, next) {
  return `<article class="project project--stage">
    <section class="stage ui-on" data-stage data-videos='${esc(JSON.stringify(list))}'>
      <div class="stage__screen ${isVertical(list[0]) ? 'is-vertical' : ''}">
        <div class="stage__poster">${coverHTML(w, i)}<span class="stage__countdown"></span></div>
      </div>
      <div class="stage__shield" aria-hidden="true"></div>
      <a class="stage__close" href="/work" data-back aria-label="ปิด">✕</a>
      <div class="stage__ui">
        <a class="back" href="/work" data-back><span class="arrow">←</span> กลับ</a>
        <div class="stage__info">
          <p class="page__kicker">${pad(i + 1)} — ${esc(w.category)}${w.year ? ' · ' + esc(w.year) : ''}${w.role ? ' · ' + esc(w.role) : ''}</p>
          <h1 class="stage__title">${splitWords(w.title)}</h1>
          ${w.client ? `<p class="stage__client">${esc(w.client)}</p>` : ''}
        </div>
        <div class="stage__side">
          ${list.length > 1 ? `<div class="player__list">${list.map((u, vi) => `<button class="player__item ${vi ? '' : 'is-active'}" data-i="${vi}">${pad(vi + 1)}</button>`).join('')}</div>` : ''}
          <a class="player__ext" href="${esc(list[0])}" target="_blank" rel="noopener">เปิดใน ${platform(list[0])} ↗</a>
          <button class="stage__fs" data-fullscreen>เต็มจอ ⤢</button>
          <button class="stage__more" data-more>รายละเอียด ↓</button>
        </div>
      </div>
    </section>
    <div class="page project__after">
      <div class="project__body">
        <dl class="project__meta">${meta.map(([k, v]) => `<div data-reveal><dt>${k}</dt><dd>${esc(v)}</dd></div>`).join('')}</dl>
        <div class="project__text" data-reveal>${paragraphs(w.description) || `<p>${esc(w.title)}</p>`}</div>
      </div>
      ${w.gallery?.length ? `<div class="project__gallery">${w.gallery.map((m, gi) => `<figure class="g g--${gi % 3}" data-reveal>${mediaHTML(m, w.title)}</figure>`).join('')}</div>` : ''}
      ${next && next !== w ? `<a class="project__next" href="/work/${encodeURIComponent(next.slug)}" data-link>
        <span class="page__kicker">Next project</span>
        <span class="project__next-title">${esc(next.title)} <span class="arrow">→</span></span>
      </a>` : ''}
    </div>
  </article>`;
}

function mountStage(el, stage) {
  const list = JSON.parse(stage.dataset.videos);
  const screen = stage.querySelector('.stage__screen');
  const shield = stage.querySelector('.stage__shield');
  const ext = stage.querySelector('.player__ext');
  const touch = matchMedia('(pointer: coarse)').matches;
  let frame = null, current = 0, paused = false, startTimer;
  const poster = stage.querySelector('.stage__poster');

  // talk to the YouTube / Vimeo player so a click on the video can pause / resume it
  const command = (play) => {
    if (!frame) return;
    const k = kind(list[current]);
    if (k === 'yt') frame.contentWindow.postMessage(JSON.stringify({ event: 'command', func: play ? 'playVideo' : 'pauseVideo', args: [] }), '*');
    if (k === 'vimeo') frame.contentWindow.postMessage(JSON.stringify({ method: play ? 'play' : 'pause' }), '*');
  };
  const load = (n) => {
    current = n; paused = false;
    const u = list[n];
    screen.classList.toggle('is-vertical', isVertical(u));
    // our shield only makes sense where we can control the player
    shield.hidden = touch || kind(u) === 'other';
    clearTimeout(startTimer);
    screen.innerHTML = `<iframe src="${esc(embedURL(u))}" title="video ${n + 1}" allow="autoplay; fullscreen; picture-in-picture; encrypted-media" allowfullscreen></iframe>`;
    frame = screen.querySelector('iframe');
    ext.href = u; ext.textContent = `เปิดใน ${platform(u)} ↗`;
    stage.querySelectorAll('.player__item').forEach((b) => b.classList.toggle('is-active', +b.dataset.i === n));
    if (audio.enabled) { setSound(false); document.body.classList.remove('sound-on'); }
  };
  stage.querySelectorAll('.player__item').forEach((b) => b.addEventListener('click', () => load(+b.dataset.i)));
  let clickTimer;
  shield.addEventListener('click', (e) => {
    if (e.detail > 1) { clearTimeout(clickTimer); return; }
    clickTimer = setTimeout(() => { paused = !paused; command(!paused); if (paused) show(); }, 220);
  });
  stage.querySelector('[data-more]').addEventListener('click', () => el.querySelector('.project__after').scrollIntoView({ behavior: 'smooth' }));

  // title and controls fade away when the mouse rests. Once hidden, moving over the video does NOT bring them back:
  // only moving to the top edge, scrolling, a key press or a tap does.
  let timer;
  const isHidden = () => !stage.classList.contains('ui-on');
  const hide = () => { if (!paused && scrollY < innerHeight * 0.4) { stage.classList.remove('ui-on'); document.body.classList.add('ui-idle'); } };
  const show = () => {
    stage.classList.add('ui-on'); document.body.classList.remove('ui-idle');
    clearTimeout(timer); timer = setTimeout(hide, touch ? 3500 : 2200);
  };
  const wake = (e) => {
    if (e?.type === 'pointermove' && isHidden() && e.clientY > 110) return;
    if (e?.type === 'pointerdown' && !touch) return;
    show();
  };
  const events = ['pointermove', 'pointerdown', 'keydown', 'scroll', 'wheel', 'touchstart'];
  events.forEach((ev) => addEventListener(ev, wake, { passive: true }));

  // full screen: button, double-click on the video, or the F key
  const fsBtn = stage.querySelector('[data-fullscreen]');
  const toggleFs = () => {
    if (document.fullscreenElement) document.exitFullscreen?.();
    else (stage.requestFullscreen || stage.webkitRequestFullscreen)?.call(stage);
  };
  const onFsChange = () => { fsBtn.textContent = document.fullscreenElement ? 'ออกจากเต็มจอ ⤡' : 'เต็มจอ ⤢'; };
  const onKey = (e) => { if ((e.key === 'f' || e.key === 'F') && !e.target.closest?.('input,textarea')) toggleFs(); };
  fsBtn.addEventListener('click', toggleFs);
  shield.addEventListener('dblclick', toggleFs);
  document.addEventListener('fullscreenchange', onFsChange);
  addEventListener('keydown', onKey);
  if (!(stage.requestFullscreen || stage.webkitRequestFullscreen)) fsBtn.hidden = true;
  show();
  // browsers only allow sound after a click, so if the Enter screen is still up, start when it is dismissed
  // show the cover for 2.5 s (with a progress line), then start the video; clicking the cover starts it right away
  // coming from a Gallery still (?play): no cover wait, start the clip right away
  const DELAY = new URLSearchParams(location.search).has('play') ? 0 : 2500;
  const start = () => {
    shield.hidden = true;
    if (!DELAY) { load(startAt()); return; }
    gsap.fromTo(poster.querySelector('.stage__countdown'), { scaleX: 0 }, { scaleX: 1, duration: DELAY / 1000, ease: 'none' });
    startTimer = setTimeout(() => load(startAt()), DELAY);
  };
  poster.addEventListener('click', () => load(startAt()));
  const gate = document.getElementById('gate');
  if (gate) gate.addEventListener('click', (e) => { if (e.target.closest('[data-enter]')) start(); });
  else start();
  // a link from the Gallery can ask for a specific episode (?v=2)
  function startAt() { return Math.min(list.length - 1, Math.max(0, +(new URLSearchParams(location.search).get('v') || 0))); }
  gsap.from(stage.querySelectorAll('.stage__title .w > span'), { yPercent: 110, duration: 1.2, stagger: 0.06, ease: 'expo.out', delay: 0.4 });

  return () => {
    clearTimeout(timer); clearTimeout(startTimer);
    document.removeEventListener('fullscreenchange', onFsChange);
    removeEventListener('keydown', onKey);
    if (document.fullscreenElement) document.exitFullscreen?.();
    events.forEach((ev) => removeEventListener(ev, wake));
    document.body.classList.remove('ui-idle');
  };
}
