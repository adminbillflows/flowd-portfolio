import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { CustomEase } from 'gsap/CustomEase';
import { World, supportsWebGL } from './gl/World.js';
import { setSound, blip, audio } from './audio.js';
import { esc } from './util.js';
import { home } from './views/home.js';
import { works } from './views/works.js';
import { project } from './views/project.js';
import { about } from './views/about.js';
import { contact } from './views/contact.js';
import { gallery } from './views/gallery.js';
import logoUrl from './assets/logo.png';
import { phoneMQ } from './phone.js';

gsap.registerPlugin(ScrollTrigger, CustomEase);
CustomEase.create('flow', '0.76, 0, 0.24, 1');

// Static demo build (no server): data comes from the seed file and routes live in the hash.
const STATIC = import.meta.env.VITE_STATIC === '1';
const toHash = (path) => path === '/' ? '' : path === '/work' ? 'works' : path.startsWith('/work/') ? 'project-' + path.slice(6) : path.slice(1);
const fromHash = (h) => { h = decodeURIComponent(h.replace(/^#/, '')); return !h ? '/' : h === 'works' ? '/work' : h.startsWith('project-') ? '/work/' + h.slice(8) : '/' + h; };
const currentPath = () => (STATIC ? fromHash(location.hash) : location.pathname);

const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches || new URLSearchParams(location.search).has('lite');
const app = document.getElementById('app');
const ctx = { works: [], settings: {}, world: null, onActive: null };

// ---------- routes ----------
const routes = [
  [/^\/$/, home],
  [/^\/work\/?$/, works],
  [/^\/work\/([^/]+)\/?$/, project, (m) => ({ slug: decodeURIComponent(m[1]) })],
  [/^\/gallery\/?$/, gallery],
  [/^\/about\/?$/, about],
  [/^\/contact\/?$/, contact],
];
function match(path) {
  for (const [re, view, params] of routes) {
    const m = path.match(re);
    if (m) return { view, params: params ? params(m) : {} };
  }
  return { view: home, params: {} };
}

function pushPath(next) {
  navDepth++;
  if (STATIC) history.pushState({}, '', next.pathname === '/' ? location.pathname + location.search : '#' + toHash(next.pathname));
  else history.pushState({}, '', next);
}
let cleanup = null;
let renderId = 0;
let busy = false;
function render(path, { first = false } = {}) {
  const { view, params } = match(path);
  cleanup?.(); cleanup = null;
  ScrollTrigger.getAll().forEach((t) => t.kill());
  app.innerHTML = view.render(ctx, params);
  app.dataset.view = view.mode;
  document.body.dataset.view = view.mode;
  document.title = path === '/' ? ctx.settings.siteName : `${view.title(ctx, params)} — ${ctx.settings.siteName}`;
  document.querySelectorAll('.menu a').forEach((a) => a.classList.toggle('is-current', a.getAttribute('href') === '/' ? path === '/' : path.startsWith(a.getAttribute('href'))));
  ctx.world?.setMode(view.mode, { instant: first });
  syncPager(path);
  window.scrollTo(0, 0);
  // some views mount asynchronously (they fetch first) and hand back their cleanup later
  const token = ++renderId;
  const res = view.mount(app, ctx, params);
  if (res && typeof res.then === 'function') res.then((fn) => { if (token === renderId) cleanup = typeof fn === 'function' ? fn : null; else if (typeof fn === 'function') fn(); });
  else cleanup = typeof res === 'function' ? res : null;
  reveals();
}

async function navigate(url, { push = true, dir = 1 } = {}) {
  const next = STATIC ? { pathname: url } : new URL(url, location.href);
  if (busy) return;
  if (next.pathname === currentPath() && push) { closeMenu(); return; }
  busy = true;
  const { view, params } = match(next.pathname);
  const panel = document.querySelector('.transition');
  const label = panel.querySelector('.transition__label');
  label.textContent = view.title(ctx, params);
  blip(440, 0.05);
  if (reduced) {
    await gsap.to(app, { opacity: 0, duration: 0.2 });
    if (push) pushPath(next);
    closeMenu(true); render(next.pathname);
    await gsap.to(app, { opacity: 1, duration: 0.2 });
    busy = false; return;
  }
  const tl = gsap.timeline();
  tl.set(panel, { visibility: 'visible' })
    .fromTo(panel, { clipPath: dir > 0 ? 'inset(100% 0% 0% 0%)' : 'inset(0% 0% 100% 0%)' }, { clipPath: 'inset(0% 0% 0% 0%)', duration: 0.8, ease: 'flow' })
    .fromTo(label, { yPercent: 100 * dir, opacity: 0 }, { yPercent: 0, opacity: 1, duration: 0.6, ease: 'expo.out' }, '-=0.35')
    .to(app, { y: -60 * dir, duration: 0.8, ease: 'flow' }, 0);
  await tl;
  if (push) pushPath(next);
  closeMenu(true);
  render(next.pathname);
  gsap.set(app, { y: 60 * dir });
  const out = gsap.timeline();
  out.to(label, { yPercent: -100 * dir, opacity: 0, duration: 0.4, ease: 'expo.in' })
    .to(panel, { clipPath: dir > 0 ? 'inset(0% 0% 100% 0%)' : 'inset(100% 0% 0% 0%)', duration: 0.9, ease: 'flow' }, '-=0.1')
    .to(app, { y: 0, duration: 1.0, ease: 'expo.out' }, '<')
    .set(panel, { visibility: 'hidden' });
  await out;
  busy = false;
}

let navDepth = 0; // how many in-site pages deep we are, so "back" can return to the previous page
document.addEventListener('click', (e) => {
  const back = e.target.closest('[data-back]');
  if (back) { e.preventDefault(); if (navDepth > 0) history.back(); else navigate('/work'); return; }
  const a = e.target.closest('a[data-link], a[href^="/"]');
  if (!a || a.target === '_blank' || e.metaKey || e.ctrlKey || a.getAttribute('href').startsWith('/admin') || a.getAttribute('href').startsWith('/uploads')) return;
  e.preventDefault();
  const from = pageIndex(currentPath()), to = pageIndex(a.getAttribute('href').split('?')[0]);
  navigate(STATIC ? a.getAttribute('href').split('?')[0] : a.href, { dir: from >= 0 && to >= 0 && to < from ? -1 : 1 });
});
addEventListener('popstate', () => { navDepth = Math.max(0, navDepth - 1); } );
addEventListener('popstate', () => navigate(STATIC ? currentPath() : location.href, { push: false }));

// ---------- phones: fixed pages, swipe up/down to move between them ----------
const ORDER = [['/', 'Home'], ['/work', 'Event'], ['/gallery', 'Gallery'], ['/about', 'About'], ['/contact', 'Contact']];
const pageIndex = (path) => ORDER.findIndex(([p]) => p === (path.replace(/\/+$/, '') || '/'));
const pager = document.createElement('nav');
pager.className = 'pager';
pager.setAttribute('aria-label', 'หน้า');
pager.innerHTML = `<div class="pager__dots">${ORDER.map(([p, t]) => `<a href="${p}" data-link aria-label="${t}"></a>`).join('')}</div>
  <p class="pager__next"><span class="pager__arrow">↑</span><span class="pager__label"></span></p>`;
document.body.appendChild(pager);
function syncPager(path) {
  const i = pageIndex(path);
  document.body.classList.toggle('is-phone', phoneMQ.matches);
  pager.classList.toggle('is-on', i >= 0);
  pager.querySelectorAll('.pager__dots a').forEach((a, j) => a.classList.toggle('is-current', j === i));
  const last = i === ORDER.length - 1;
  pager.querySelector('.pager__arrow').textContent = last ? '↓' : '↑';
  pager.querySelector('.pager__label').textContent = i < 0 ? '' : last ? ORDER[i - 1][1] : ORDER[i + 1][1];
}
phoneMQ.addEventListener?.('change', () => syncPager(currentPath()));
/** Would this swipe scroll something inside the page instead (a long text, the form)? */
function scrollsInside(el, down) {
  for (; el && el !== document.body; el = el.parentElement) {
    const cs = getComputedStyle(el);
    if (!/(auto|scroll)/.test(cs.overflowY) || el.scrollHeight <= el.clientHeight + 2) continue;
    if (down ? el.scrollTop + el.clientHeight < el.scrollHeight - 2 : el.scrollTop > 2) return true;
  }
  return false;
}
let swipe = null;
document.addEventListener('touchstart', (e) => {
  swipe = null;
  if (!phoneMQ.matches || menuOpen || busy || e.touches.length > 1 || document.getElementById('gate')) return;
  if (e.target.closest('input, textarea, select')) return;
  const t = e.touches[0];
  swipe = { x: t.clientX, y: t.clientY, t: performance.now(), target: e.target };
}, { passive: true });
document.addEventListener('touchend', (e) => {
  const s = swipe; swipe = null;
  if (!s) return;
  const t = e.changedTouches[0];
  const dx = t.clientX - s.x, dy = t.clientY - s.y;
  if (Math.abs(dy) < 60 || Math.abs(dy) < Math.abs(dx) * 1.3 || performance.now() - s.t > 1500) return;
  const i = pageIndex(currentPath());
  if (i < 0) return;
  const up = dy < 0; // finger moved up: next page
  if (scrollsInside(s.target, up)) return;
  const j = i + (up ? 1 : -1);
  if (j < 0 || j >= ORDER.length) return;
  navigate(ORDER[j][0], { dir: up ? 1 : -1 });
}, { passive: true });
document.addEventListener('touchcancel', () => { swipe = null; }, { passive: true });

// ---------- reveal on scroll ----------
function reveals() {
  if (reduced) return;
  app.querySelectorAll('[data-reveal]').forEach((el) => {
    gsap.from(el, { opacity: 0, y: 50, duration: 1.2, ease: 'expo.out', scrollTrigger: { trigger: el, start: 'top 90%' } });
  });
}

// ---------- menu ----------
const menu = document.getElementById('menu');
const menuBtn = document.getElementById('menu-toggle');
let menuOpen = false;
function openMenu() {
  menuOpen = true; document.body.classList.add('menu-open');
  menu.setAttribute('aria-hidden', 'false'); menuBtn.setAttribute('aria-expanded', 'true');
  menuBtn.querySelector('.label').textContent = 'Close';
  gsap.set(menu, { visibility: 'visible' });
  gsap.fromTo('.menu__bg', { clipPath: 'circle(0% at 100% 0%)' }, { clipPath: 'circle(150% at 100% 0%)', duration: reduced ? 0 : 1.0, ease: 'flow' });
  gsap.fromTo('.menu__list li', { yPercent: 120, opacity: 0 }, { yPercent: 0, opacity: 1, duration: 1, stagger: 0.06, ease: 'expo.out', delay: 0.25 });
  gsap.fromTo('.menu__foot', { opacity: 0 }, { opacity: 1, duration: 0.8, delay: 0.5 });
  blip(520);
}
function closeMenu(instant = false) {
  if (!menuOpen) return;
  menuOpen = false; document.body.classList.remove('menu-open');
  menu.setAttribute('aria-hidden', 'true'); menuBtn.setAttribute('aria-expanded', 'false');
  menuBtn.querySelector('.label').textContent = 'Menu';
  gsap.to('.menu__bg', { clipPath: 'circle(0% at 100% 0%)', duration: instant || reduced ? 0 : 0.8, ease: 'flow', onComplete: () => gsap.set(menu, { visibility: 'hidden' }) });
  gsap.to('.menu__list li, .menu__foot', { opacity: 0, duration: instant ? 0 : 0.3 });
}
menuBtn.addEventListener('click', () => (menuOpen ? closeMenu() : openMenu()));
addEventListener('keydown', (e) => {
  if (e.key !== 'Escape') return;
  if (menuOpen) closeMenu();
  else if (document.querySelector('[data-back]')) document.querySelector('[data-back]').click();
});

// ---------- sound ----------
const soundBtn = document.getElementById('sound-toggle');
function reflectSound() {
  soundBtn.setAttribute('aria-pressed', audio.enabled);
  soundBtn.querySelector('.label').textContent = audio.enabled ? 'Sound on' : 'Sound off';
  document.body.classList.toggle('sound-on', audio.enabled);
}
soundBtn.addEventListener('click', () => { setSound(!audio.enabled); reflectSound(); });

// ---------- cursor ----------
function initCursor() {
  if (matchMedia('(pointer: coarse)').matches) return;
  const cursor = document.querySelector('.cursor');
  const dot = cursor.querySelector('.cursor__dot');
  const ring = cursor.querySelector('.cursor__ring');
  const label = ring.querySelector('span');
  const dx = gsap.quickTo(dot, 'x', { duration: 0.1 }), dy = gsap.quickTo(dot, 'y', { duration: 0.1 });
  const rx = gsap.quickTo(ring, 'x', { duration: 0.45, ease: 'power3' }), ry = gsap.quickTo(ring, 'y', { duration: 0.45, ease: 'power3' });
  addEventListener('pointermove', (e) => { dx(e.clientX); dy(e.clientY); rx(e.clientX); ry(e.clientY); cursor.classList.add('is-on'); });
  document.addEventListener('pointerover', (e) => {
    const t = e.target.closest('a, button, input, textarea');
    cursor.classList.toggle('is-link', !!t);
  });
  ctx.setCursorLabel = (text) => { label.textContent = text || ''; cursor.classList.toggle('has-label', !!text); };
}

// ---------- site chrome from settings ----------
function applySettings() {
  const s = ctx.settings;
  document.querySelectorAll('[data-logo]').forEach((el) => (el.src = logoUrl));
  document.querySelectorAll('[data-tagline]').forEach((el) => (el.textContent = s.tagline));
  const mail = document.querySelector('[data-email]');
  mail.textContent = s.email; mail.href = `mailto:${s.email}`;
  document.querySelector('[data-socials]').innerHTML = (s.socials || []).map((x) => `<a href="${esc(x.url)}" target="_blank" rel="noopener">${esc(x.label)}</a>`).join('');
}

// ---------- boot ----------
async function boot() {
  const bar = document.getElementById('gate-bar');
  const count = document.getElementById('gate-count');
  const progress = { v: 0 };
  const setP = (v) => gsap.to(progress, { v, duration: 0.8, ease: 'power2.out', onUpdate: () => {
    bar.style.transform = `scaleX(${progress.v / 100})`; count.textContent = Math.round(progress.v);
  } });
  setP(25);
  // make sure the display faces are ready before covers are drawn onto canvases
  await Promise.all(['400 112px Anton', '600 24px Montserrat', '400 112px Kanit'].map((f) => document.fonts?.load(f, 'Aก').catch(() => {})));
  const [w, s] = STATIC
    ? await import('../server/seed.json').then(async (m) => { await document.fonts?.ready; return [m.default.works, m.default.settings]; })
    : await Promise.all([
      fetch('/api/works').then((r) => r.json()).catch(() => []),
      fetch('/api/settings').then((r) => r.json()).catch(() => ({ siteName: 'FlowD', tagline: '' })),
      document.fonts?.ready,
    ]);
  ctx.works = w; ctx.settings = s;
  applySettings();
  setP(60);

  if (!reduced && supportsWebGL()) {
    document.body.classList.add('has-gl');
    ctx.world = new World(document.getElementById('gl'), {
      onActiveChange: (card) => ctx.onActive?.(card),
      onCardHover: (card) => {
        ctx.setCursorLabel?.(card ? 'View' : '');
        document.body.classList.toggle('is-pointer', !!card);
        if (card) blip(1200, 0.015);
      },
      onCardClick: (card) => ctx.openCard(card),
    });
  } else {
    document.body.classList.add('is-reduced');
  }
  ctx.openCard = async (card) => {
    if (busy) return;
    blip(330, 0.06);
    if (ctx.world) await ctx.world.focusCard(card);
    navigate(`/work/${encodeURIComponent(card.work.slug)}`);
  };
  initCursor();
  render(currentPath(), { first: true });
  await setP(100);

  // enter gate: user gesture is needed before audio can start
  const gate = document.getElementById('gate');
  gsap.to('#gate-actions', { opacity: 1, y: 0, duration: 0.8, ease: 'expo.out', pointerEvents: 'auto' });
  gate.querySelectorAll('[data-enter]').forEach((b) => b.addEventListener('click', () => {
    if (b.dataset.enter === 'sound') setSound(true);
    reflectSound();
    ctx.world?.intro();
    gsap.to(gate, { opacity: 0, duration: reduced ? 0.2 : 1.2, ease: 'power2.inOut', onComplete: () => gate.remove() });
    document.body.classList.add('entered');
  }, { once: true }));
}
boot();
