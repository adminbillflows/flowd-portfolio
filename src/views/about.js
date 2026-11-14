import gsap from 'gsap';
import { esc, pad, paragraphs, splitWords } from '../util.js';
import { isPhone, panelsHTML, mountPanels } from '../phone.js';

export const about = {
  mode: 'about',
  title: () => 'About',
  render(ctx) {
    const s = ctx.settings;
    if (isPhone()) return panelsHTML({ view: 'about', kicker: '04 — Studio', panels: [
      { cls: 'ph-about ph-about--lead', html: `<h1 class="about__statement">${splitWords(s.tagline)}</h1><p class="ph__swipe">ปัดซ้ายเพื่ออ่านต่อ →</p>` },
      { cls: 'ph-about ph-about--text', html: `<p class="page__kicker">About</p><div class="about__text">${paragraphs(s.about)}</div>` },
      { cls: 'ph-about', html: `<p class="page__kicker">Services</p><ol class="ph-services">${(s.services || []).map((x, i) => `<li><span>${pad(i + 1)}</span>${esc(x)}</li>`).join('')}</ol>` },
      { cls: 'ph-about ph-about--cta', html: `<a class="project__next" href="/contact" data-link><span class="page__kicker">Next</span><span class="project__next-title">Let's talk <span class="arrow">→</span></span></a>` },
    ] });
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
    const off = el.querySelector('[data-ph]') ? mountPanels(el) : null;
    gsap.from(el.querySelectorAll('.about__statement .w > span'), { yPercent: 110, duration: 1.3, stagger: 0.05, ease: 'expo.out', delay: 0.15 });
    return off;
  },
};
