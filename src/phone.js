import gsap from 'gsap';
import { pad } from './util.js';

// Phones get fixed, full-screen pages: swipe sideways inside a page, up/down to change page.
export const phoneMQ = matchMedia('(max-width: 767px)');
export const isPhone = () => phoneMQ.matches;

/** A fixed full-screen page whose content is a row of panels swiped sideways. */
export function panelsHTML({ kicker, view, panels }) {
  return `<section class="ph" data-ph="${view}">
    <header class="ph__head">
      <p class="ph__kicker">${kicker}</p>
      <p class="ph__count"><b data-ph-idx>01</b> / ${pad(panels.length)}</p>
    </header>
    <div class="ph__track" data-ph-track>
      ${panels.map((p, i) => `<div class="ph__panel ${p.cls || ''}" data-i="${i}">${p.html}</div>`).join('')}
    </div>
    <div class="ph__dots" aria-hidden="true">${panels.map(() => '<i></i>').join('')}</div>
  </section>`;
}

export function mountPanels(el) {
  const track = el.querySelector('[data-ph-track]');
  if (!track) return () => {};
  const panels = [...track.children];
  const dots = [...el.querySelectorAll('.ph__dots i')];
  const idx = el.querySelector('[data-ph-idx]');
  let active = -1, raf = 0;
  gsap.from(track, { xPercent: 12, opacity: 0, duration: 1.1, ease: 'expo.out', delay: 0.15, clearProps: 'transform,opacity' });
  const update = () => {
    raf = 0;
    const x = track.scrollLeft / Math.max(1, track.clientWidth);
    panels.forEach((p, j) => { const d = j - x; if (Math.abs(d) < 1.5) p.style.setProperty('--d', d.toFixed(3)); });
    const i = Math.max(0, Math.min(panels.length - 1, Math.round(x)));
    if (i === active) return;
    active = i;
    idx.textContent = pad(i + 1);
    dots.forEach((d, j) => d.classList.toggle('is-on', j === i));
  };
  const onScroll = () => { if (!raf) raf = requestAnimationFrame(update); };
  track.addEventListener('scroll', onScroll, { passive: true });
  addEventListener('resize', onScroll);
  update();
  return () => { cancelAnimationFrame(raf); removeEventListener('resize', onScroll); };
}
