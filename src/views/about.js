import gsap from 'gsap';
import { esc, pad, paragraphs, splitWords } from '../util.js';

export const about = {
  mode: 'about',
  title: () => 'About',
  render(ctx) {
    const s = ctx.settings;
    return `<section class="page about">
      <header class="page__head">
        <p class="page__kicker">04 — Studio</p>
        <h1 class="about__statement">${splitWords(s.tagline)}</h1>
      </header>
      <div class="about__grid">
        <div class="about__text" data-reveal>${paragraphs(s.about)}</div>
        <div class="about__services">
          <p class="page__kicker">Services</p>
          <ol>${(s.services || []).map((x, i) => `<li data-reveal><span>${pad(i + 1)}</span>${esc(x)}</li>`).join('')}</ol>
        </div>
      </div>
      <a class="project__next" href="/contact" data-link><span class="page__kicker">Next</span><span class="project__next-title">Let's talk <span class="arrow">→</span></span></a>
    </section>`;
  },
  mount(el) {
    gsap.from(el.querySelectorAll('.about__statement .w > span'), { yPercent: 110, duration: 1.3, stagger: 0.05, ease: 'expo.out', delay: 0.15 });
  },
};
