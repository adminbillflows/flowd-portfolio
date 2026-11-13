import gsap from 'gsap';
import { esc, pad, splitWords } from '../util.js';
import { coverHTML } from '../media.js';
import { placeholderURL } from '../placeholder.js';

// Phones get a film reel instead of the 3D corridor: one work per full-screen frame, swiped sideways.
const reelMQ = matchMedia('(max-width: 767px)');
const useReel = () => reelMQ.matches;

/** Pictures for one frame: the cover first, then a few gallery stills to cross-fade through. */
function framePics(w, i) {
  const pics = [];
  if (w.cover?.type === 'image') pics.push(w.cover.url);
  (w.stills || []).forEach((s) => pics.length < 5 && !pics.includes(s.url) && pics.push(s.url));
  if (!pics.length) pics.push(placeholderURL(w, i));
  return pics;
}

function reelHTML(ctx, list) {
  return `<section class="reel" data-reel>
    <header class="reel__head">
      <p class="reel__kicker">Portfolio — ${new Date().getFullYear()}</p>
      <p class="reel__count"><b data-reel-idx>01</b> / ${pad(list.length)}</p>
    </header>
    <div class="reel__track" data-reel-track>
      ${list.map((w, i) => `
      <a class="reel__frame" href="/work/${encodeURIComponent(w.slug)}" data-link data-i="${i}">
        <span class="reel__edge reel__edge--top"><i>FLOW:D ${pad(i + 1)}A</i><i>▸ ${esc(w.year || '')}</i></span>
        <span class="reel__pic">${framePics(w, i).map((src, k) => `<img src="${esc(src)}" alt="${k ? '' : esc(w.title)}" ${i > 1 ? 'loading="lazy"' : ''} decoding="async"${k ? ' class="is-next"' : ' class="is-on"'}>`).join('')}</span>
        <span class="reel__shade"></span>
        <span class="reel__meta">
          <span class="reel__num">${pad(i + 1)}</span>
          <span class="reel__cat">${esc(w.category)}${w.client ? ` · ${esc(w.client)}` : ''}</span>
          <strong class="reel__title">${esc(w.title)}</strong>
          <span class="reel__play">▶ ดูวิดีโอ</span>
        </span>
        <span class="reel__edge reel__edge--bottom"><i>${pad(i + 1)}</i><i>KEEP THE FLOW ▸</i></span>
      </a>`).join('')}
    </div>
    <nav class="reel__strip" aria-label="เลือกงาน">${list.map((w, i) => `<button type="button" data-go="${i}" aria-label="${esc(w.title)}"><img src="${esc(framePics(w, i)[0])}" alt="" loading="lazy"></button>`).join('')}</nav>
    <a class="reel__all" href="/work" data-link>All works <sup>${pad(ctx.works.length)}</sup></a>
  </section>`;
}

function mountReel(el) {
  const track = el.querySelector('[data-reel-track]');
  const frames = [...track.children];
  const thumbs = [...el.querySelectorAll('[data-go]')];
  const idx = el.querySelector('[data-reel-idx]');
  let active = -1, timer = 0, raf = 0;

  gsap.from(frames.slice(0, 2), { xPercent: 30, opacity: 0, duration: 1.2, stagger: 0.08, ease: 'expo.out', delay: 0.2 });
  gsap.from(el.querySelectorAll('.reel__head, .reel__strip, .reel__all'), { opacity: 0, y: 12, duration: 1, stagger: 0.06, delay: 0.4, ease: 'expo.out' });

  // cross-fade through the active frame's stills
  const cycle = () => {
    clearInterval(timer);
    const imgs = [...frames[active].querySelectorAll('.reel__pic img')];
    if (imgs.length < 2) return;
    let k = imgs.findIndex((im) => im.classList.contains('is-on'));
    timer = setInterval(() => {
      imgs[k].classList.remove('is-on');
      k = (k + 1) % imgs.length;
      imgs[k].classList.add('is-on');
    }, 3200);
  };
  const setActive = (i) => {
    if (i === active) return;
    active = i;
    idx.textContent = pad(i + 1);
    frames.forEach((f, j) => f.classList.toggle('is-active', j === i));
    thumbs.forEach((t, j) => t.classList.toggle('is-active', j === i));
    thumbs[i]?.scrollIntoView({ inline: 'center', block: 'nearest', behavior: 'smooth' });
    cycle();
  };

  // parallax: the picture drifts against the swipe, the frame tilts like film going round a sprocket
  const update = () => {
    raf = 0;
    const w = track.clientWidth;
    const x = track.scrollLeft / w;
    frames.forEach((f, j) => {
      const d = j - x;
      if (Math.abs(d) > 1.5) return;
      f.style.setProperty('--d', d.toFixed(3));
    });
    setActive(Math.max(0, Math.min(frames.length - 1, Math.round(x))));
  };
  const onScroll = () => { if (!raf) raf = requestAnimationFrame(update); };
  track.addEventListener('scroll', onScroll, { passive: true });
  addEventListener('resize', onScroll);
  thumbs.forEach((t) => t.addEventListener('click', () => track.scrollTo({ left: +t.dataset.go * track.clientWidth, behavior: 'smooth' })));
  update();
  return () => { clearInterval(timer); cancelAnimationFrame(raf); removeEventListener('resize', onScroll); };
}

export const home = {
  get mode() { return useReel() ? 'reel' : 'home'; },
  title: (ctx) => ctx.settings.siteName,
  render(ctx) {
    const works = ctx.works.filter((w) => w.featured);
    const list = works.length ? works : ctx.works;
    if (useReel()) return reelHTML(ctx, list);
    if (!ctx.world) {
      // reduced-motion / no-WebGL version: a calm grid
      return `<section class="home home--lite">
        <h1 class="home__lite-title">${esc(ctx.settings.siteName)}</h1>
        <p class="home__tagline">${esc(ctx.settings.tagline)}</p>
        <div class="lite-grid">${list.map((w, i) => `
          <a class="lite-card" href="/work/${encodeURIComponent(w.slug)}" data-link>
            <div class="lite-card__media">${coverHTML(w, i)}</div>
            <div class="lite-card__meta"><span>${pad(i + 1)}</span><strong>${esc(w.title)}</strong><em>${esc(w.category)}</em></div>
          </a>`).join('')}</div>
      </section>`;
    }
    return `<section class="home">
      <div class="home__hero">
        <p class="home__kicker">Portfolio — ${new Date().getFullYear()}</p>
        <h1 class="home__title">${splitWords(ctx.settings.tagline)}</h1>
      </div>
      <div class="home__now">
        <div class="home__count"><span class="home__idx">01</span><span class="home__sep">/</span><span>${pad(list.length)}</span></div>
        <a class="home__work" href="#" data-current>
          <span class="home__work-cat"></span>
          <span class="home__work-title"></span>
        </a>
      </div>
      <div class="home__hint"><span class="mouse"><i></i></span>Scroll or drag to explore</div>
      <a class="home__all" href="/work" data-link>All works <sup>${pad(ctx.works.length)}</sup></a>
    </section>`;
  },
  mount(el, ctx) {
    if (el.querySelector('[data-reel]')) return mountReel(el);
    gsap.from(el.querySelectorAll('.home__title .w > span'), { yPercent: 110, duration: 1.4, stagger: 0.06, ease: 'expo.out', delay: 0.3 });
    gsap.from(el.querySelectorAll('.home__kicker, .home__now, .home__hint, .home__all'), { opacity: 0, y: 20, duration: 1.2, stagger: 0.08, delay: 0.6, ease: 'expo.out' });
    if (!ctx.world) return;
    const works = ctx.works.filter((w) => w.featured);
    ctx.world.setWorks(works.length ? works : ctx.works);
    const idx = el.querySelector('.home__idx');
    const link = el.querySelector('[data-current]');
    const cat = el.querySelector('.home__work-cat');
    const title = el.querySelector('.home__work-title');
    let current = null;
    const show = (card) => {
      current = card;
      idx.textContent = pad(card.index + 1);
      link.href = `/work/${encodeURIComponent(card.work.slug)}`;
      gsap.to([cat, title], { opacity: 0, y: -8, duration: 0.2, onComplete: () => {
        cat.textContent = card.work.category; title.textContent = card.work.title;
        gsap.fromTo([cat, title], { opacity: 0, y: 10 }, { opacity: 1, y: 0, duration: 0.5, stagger: 0.04, ease: 'expo.out' });
      } });
    };
    ctx.onActive = show;
    link.addEventListener('click', (e) => {
      e.preventDefault();
      const card = ctx.world.cards.find((c) => c === current) || current;
      if (card) ctx.openCard(card);
    });
    // hide the hint after the first scroll
    const hint = el.querySelector('.home__hint');
    const off = () => { gsap.to(hint, { opacity: 0, duration: 0.6 }); removeEventListener('wheel', off); removeEventListener('pointerdown', off); };
    addEventListener('wheel', off, { passive: true }); addEventListener('pointerdown', off);
    // the big headline fades away once you start travelling through the cards
    const hero = el.querySelector('.home__hero');
    const start = ctx.world.scroll.current;
    const fade = () => {
      const d = Math.abs(ctx.world.scroll.current - start);
      hero.style.opacity = Math.max(0, 1 - d / 4);
      hero.style.transform = `translateY(${-d * 12}px)`;
    };
    gsap.ticker.add(fade);
    return () => { gsap.ticker.remove(fade); ctx.onActive = null; removeEventListener('wheel', off); removeEventListener('pointerdown', off); };
  },
};
