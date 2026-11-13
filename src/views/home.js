import gsap from 'gsap';
import { esc, pad, splitWords } from '../util.js';
import { coverHTML } from '../media.js';

export const home = {
  mode: 'home',
  title: (ctx) => ctx.settings.siteName,
  render(ctx) {
    const works = ctx.works.filter((w) => w.featured);
    const list = works.length ? works : ctx.works;
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
