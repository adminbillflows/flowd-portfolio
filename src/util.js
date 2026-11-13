export const esc = (s = '') => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const pad = (n) => String(n).padStart(2, '0');
export const paragraphs = (text = '') => text.split(/\n\s*\n/).map((p) => `<p>${esc(p.trim()).replace(/\n/g, '<br>')}</p>`).join('');
/** Wraps each word in spans so GSAP can slide them up line by line. */
export const splitWords = (text = '') => esc(text).split(/\s+/).map((w) => `<span class="w"><span>${w}</span></span>`).join(' ');
