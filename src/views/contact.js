import gsap from 'gsap';
import { esc } from '../util.js';

export const contact = {
  mode: 'contact',
  title: () => 'Contact',
  render(ctx) {
    const s = ctx.settings;
    return `<section class="page contact">
      <header class="page__head">
        <p class="page__kicker">04 — Contact</p>
        <h1 class="contact__big"><span class="w"><span>Let's make</span></span> <span class="w"><span><em>something move.</em></span></span></h1>
      </header>
      <div class="contact__grid">
        <div class="contact__info" data-reveal>
          <a class="contact__mail" href="mailto:${esc(s.email)}">${esc(s.email)}</a>
          ${s.phone ? `<p><a href="tel:${esc(s.phone.replace(/\s/g, ''))}">${esc(s.phone)}</a></p>` : ''}
          ${s.address ? `<p>${esc(s.address)}</p>` : ''}
          <ul class="contact__socials">${(s.socials || []).map((x) => `<li><a href="${esc(x.url)}" target="_blank" rel="noopener">${esc(x.label)} ↗</a></li>`).join('')}</ul>
        </div>
        <form class="contact__form" data-reveal novalidate>
          <label><span>ชื่อ / Name</span><input name="name" autocomplete="name"></label>
          <label><span>อีเมล / Email</span><input name="email" type="email" required autocomplete="email"></label>
          <label><span>รายละเอียดงาน / Project</span><textarea name="message" rows="5" required></textarea></label>
          <button type="submit" class="btn">ส่งข้อความ <span class="arrow">→</span></button>
          <p class="form__status" role="status"></p>
        </form>
      </div>
    </section>`;
  },
  mount(el) {
    gsap.from(el.querySelectorAll('.contact__big .w > span'), { yPercent: 110, duration: 1.3, stagger: 0.1, ease: 'expo.out', delay: 0.15 });
    const form = el.querySelector('form');
    const status = form.querySelector('.form__status');
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const data = Object.fromEntries(new FormData(form));
      if (import.meta.env.VITE_STATIC === '1') { status.textContent = 'นี่คือเวอร์ชันสาธิต ฟอร์มยังไม่ได้ส่งข้อความจริง (ใช้ได้เมื่อรันพร้อมเซิร์ฟเวอร์)'; return; }
      status.textContent = 'กำลังส่ง…';
      const res = await fetch('/api/contact', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) }).catch(() => null);
      if (res?.ok) { form.reset(); status.textContent = 'ส่งแล้ว ขอบคุณครับ เราจะติดต่อกลับเร็วๆ นี้'; }
      else status.textContent = 'ส่งไม่สำเร็จ กรุณาใส่อีเมลและรายละเอียดให้ครบ';
    });
  },
};
