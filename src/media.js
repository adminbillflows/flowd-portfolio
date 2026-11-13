import { esc } from './util.js';
import { placeholderURL } from './placeholder.js';

/** HTML for a work's cover, or a generated placeholder if it has none. */
export function coverHTML(work, index = 0, { autoplay = true } = {}) {
  if (work.cover?.type === 'video') {
    return `<video src="${esc(work.cover.url)}" muted loop playsinline ${autoplay ? 'autoplay' : ''} preload="metadata"></video>`;
  }
  const src = work.cover?.url || placeholderURL(work, index);
  return `<img src="${esc(src)}" alt="${esc(work.title)}" loading="lazy" decoding="async">`;
}

export function mediaHTML(m, alt = '') {
  return m.type === 'video'
    ? `<video src="${esc(m.url)}" muted loop playsinline autoplay preload="metadata"></video>`
    : `<img src="${esc(m.url)}" alt="${esc(alt)}" loading="lazy" decoding="async">`;
}
