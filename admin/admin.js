import logoUrl from '../src/assets/logo.png';
// FlowD back office (vanilla JS). Talks to /api/admin/* on the same server.
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const esc = (s = '') => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const state = { works: [], editing: null, cover: null, removeCover: false, gallery: [], hidden: new Set() };

async function api(path, opts = {}) {
  const res = await fetch(path, { credentials: 'same-origin', ...opts });
  if (res.status === 401) { showLogin(); throw new Error('unauthorized'); }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || res.statusText);
  return data;
}
const json = (method, body) => ({ method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });

function toast(msg, bad = false) {
  const t = $('#toast');
  t.textContent = msg; t.className = 'toast is-on' + (bad ? ' is-bad' : '');
  clearTimeout(toast.t); toast.t = setTimeout(() => (t.className = 'toast'), 2600);
}

// ---------- auth ----------
function showLogin() { $('#login').hidden = false; $('#shell').hidden = true; }
async function showApp() { $('#login').hidden = true; $('#shell').hidden = false; await loadWorks(); loadMessages(); }
$('#login-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const res = await fetch('/api/login', json('POST', { password: e.target.password.value }));
  if (res.ok) { e.target.reset(); $('#login-error').textContent = ''; showApp(); }
  else $('#login-error').textContent = res.status === 429 ? 'ลองผิดหลายครั้ง รอ 1 นาทีแล้วลองใหม่' : 'รหัสผ่านไม่ถูกต้อง';
});
$('#logout').addEventListener('click', async () => { await fetch('/api/logout', { method: 'POST' }); showLogin(); });

// ---------- tabs ----------
$$('.tab').forEach((b) => b.addEventListener('click', () => {
  $$('.tab').forEach((x) => x.classList.toggle('is-active', x === b));
  $$('.panel').forEach((p) => (p.hidden = p.dataset.panel !== b.dataset.tab));
  if (b.dataset.tab === 'settings') loadSettings();
  if (b.dataset.tab === 'messages') loadMessages();
}));

// ---------- works list ----------
const thumb = (m, color) => !m ? `<span class="thumb thumb--empty" style="background:${esc(color)}"></span>`
  : m.type === 'video' ? `<video class="thumb" src="${esc(m.url)}" muted preload="metadata"></video>`
  : `<img class="thumb" src="${esc(m.url)}" alt="">`;

async function loadWorks() {
  state.works = await api('/api/admin/works');
  const table = $('#work-table');
  table.innerHTML = state.works.length ? state.works.map((w, i) => `
    <li class="work" draggable="true" data-id="${w.id}">
      <span class="grip" title="ลากเพื่อเรียง">⋮⋮</span>
      <span class="num">${String(i + 1).padStart(2, '0')}</span>
      ${thumb(w.cover, w.color)}
      <span class="work__title"><strong>${esc(w.title)}</strong><small>${esc(w.category)} · ${esc(w.year || '—')} · ${(w.videos || []).length} ลิงก์ · ${w.gallery.length} รูป</small></span>
      <span class="badges">${w.published ? '' : '<b class="badge">ซ่อน</b>'}${w.featured ? '<b class="badge badge--accent">หน้าแรก</b>' : ''}</span>
      <a class="link" href="/work/${encodeURIComponent(w.slug)}" target="_blank">ดู ↗</a>
      <button class="btn btn--small" data-edit="${w.id}">แก้ไข</button>
    </li>`).join('') : '<li class="empty">ยังไม่มีผลงาน กด “เพิ่มผลงาน” หรือลากไฟล์มาวางด้านบน</li>';
  $$('[data-edit]', table).forEach((b) => b.addEventListener('click', () => openEditor(state.works.find((w) => w.id === b.dataset.edit))));
  $('#cat-list').innerHTML = [...new Set(state.works.map((w) => w.category))].map((c) => `<option value="${esc(c)}">`).join('');
  sortable(table, '.work', async () => {
    await api('/api/admin/works/reorder', json('POST', { ids: $$('.work', table).map((li) => li.dataset.id) }));
    $$('.work .num', table).forEach((n, i) => (n.textContent = String(i + 1).padStart(2, '0')));
    toast('บันทึกลำดับแล้ว');
  });
}

// drag-to-reorder for any list
function sortable(list, itemSel, onEnd) {
  let dragging = null;
  list.addEventListener('dragstart', (e) => {
    dragging = e.target.closest(itemSel);
    if (!dragging) return;
    dragging.classList.add('is-dragging');
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', 'reorder');
  });
  list.addEventListener('dragover', (e) => {
    if (!dragging) return;
    e.preventDefault();
    const over = e.target.closest(itemSel);
    if (!over || over === dragging) return;
    const r = over.getBoundingClientRect();
    const after = list.dataset.axis === 'x' ? e.clientX > r.left + r.width / 2 : e.clientY > r.top + r.height / 2;
    over.parentNode.insertBefore(dragging, after ? over.nextSibling : over);
  });
  list.addEventListener('dragend', () => { if (!dragging) return; dragging.classList.remove('is-dragging'); dragging = null; onEnd?.(); });
}

// ---------- editor ----------
const form = $('#work-form');
function openEditor(work = null, files = []) {
  state.editing = work;
  state.cover = null; state.removeCover = false;
  state.gallery = (work?.gallery || []).map((m) => ({ ...m, existing: true }));
  state.hidden = new Set(work?.stillsHidden || []);
  form.reset();
  $('#drawer-title').textContent = work ? 'แก้ไขผลงาน' : 'เพิ่มผลงาน';
  $('#delete-work').hidden = !work;
  if (work) {
    for (const k of ['title', 'category', 'year', 'client', 'role', 'description', 'slug', 'credits']) form[k].value = work[k] || '';
    form.videos.value = (work.videos || []).join('\n');
    form.color.value = work.color || '#4a6b8a';
    form.published.checked = work.published; form.featured.checked = work.featured;
  } else {
    form.color.value = randomColor();
  }
  if (files.length) {
    const media = files.filter((f) => /^(image|video)\//.test(f.type));
    if (media[0]) setCover(media[0]);
    addGallery(media.slice(1));
    if (!form.title.value && media[0]) form.title.value = media[0].name.replace(/\.[^.]+$/, '').replace(/[-_]+/g, ' ');
  }
  renderCover(); renderGallery(); renderStills();
  $('#drawer').hidden = false;
  requestAnimationFrame(() => $('#drawer').classList.add('is-open'));
  setTimeout(() => form.title.focus(), 250);
}
function closeEditor() {
  $('#drawer').classList.remove('is-open');
  setTimeout(() => ($('#drawer').hidden = true), 300);
  state.gallery.forEach((g) => g.file && URL.revokeObjectURL(g.url));
}
$$('[data-close]').forEach((b) => b.addEventListener('click', closeEditor));
addEventListener('keydown', (e) => { if (e.key === 'Escape' && !$('#drawer').hidden) closeEditor(); });
$('#new-work').addEventListener('click', () => openEditor());

function preview(m) {
  return m.type === 'video' ? `<video src="${esc(m.url)}" muted loop autoplay playsinline></video>` : `<img src="${esc(m.url)}" alt="">`;
}
function fileToMedia(file) { return { file, url: URL.createObjectURL(file), type: file.type.startsWith('video') ? 'video' : 'image', name: file.name }; }

function setCover(file) { state.cover = fileToMedia(file); state.removeCover = false; }
function renderCover() {
  const current = state.cover || (!state.removeCover && state.editing?.cover);
  $('#cover-preview').innerHTML = current ? preview(current) : '';
  $('#cover-drop').classList.toggle('has-file', !!current);
  $('#cover-remove').hidden = !current;
}
$('#cover-remove').addEventListener('click', () => { state.cover = null; state.removeCover = true; renderCover(); });

function addGallery(files) { state.gallery.push(...files.filter((f) => /^(image|video)\//.test(f.type)).map(fileToMedia)); }
function renderGallery() {
  const ul = $('#gallery');
  ul.dataset.axis = 'x';
  ul.innerHTML = state.gallery.map((g, i) => `<li class="gitem" draggable="true" data-i="${i}">${preview(g)}
    <button type="button" class="gitem__x" data-remove="${i}" aria-label="ลบ">✕</button>${g.file ? '<b class="gitem__new">ใหม่</b>' : ''}</li>`).join('');
  $$('[data-remove]', ul).forEach((b) => b.addEventListener('click', () => { state.gallery.splice(+b.dataset.remove, 1); renderGallery(); }));
}
sortable($('#gallery'), '.gitem', () => {
  state.gallery = $$('#gallery .gitem').map((li) => state.gallery[+li.dataset.i]);
  renderGallery();
});

// auto-captured stills: click to hide/show in the Gallery
function renderStills() {
  const stills = state.editing?.stills || [];
  $('#stills-field').hidden = !stills.length;
  $('#stills').innerHTML = stills.map((s) => `<li class="gitem still${state.hidden.has(s.url) ? ' is-hidden' : ''}" data-url="${esc(s.url)}" title="คลิกเพื่อซ่อน/แสดง">
    <img src="${esc(s.url)}" alt="" loading="lazy"><b class="still__badge">${state.hidden.has(s.url) ? 'ซ่อนอยู่' : 'ตอน ' + (s.video + 1)}</b></li>`).join('');
}
$('#stills').addEventListener('click', (e) => {
  const li = e.target.closest('.still');
  if (!li) return;
  const u = li.dataset.url;
  state.hidden.has(u) ? state.hidden.delete(u) : state.hidden.add(u);
  renderStills();
});

function dropzone(zone, input, onFiles) {
  zone.addEventListener('click', () => input.click());
  input.addEventListener('change', () => { onFiles([...input.files]); input.value = ''; });
  zone.addEventListener('dragover', (e) => { if (e.dataTransfer.types.includes('Files')) { e.preventDefault(); zone.classList.add('is-over'); } });
  zone.addEventListener('dragleave', () => zone.classList.remove('is-over'));
  zone.addEventListener('drop', (e) => { e.preventDefault(); zone.classList.remove('is-over'); onFiles([...e.dataTransfer.files]); });
}
dropzone($('#cover-drop'), $('#cover-input'), (files) => { if (files[0]) { setCover(files[0]); renderCover(); } });
dropzone($('#gallery-drop'), $('#gallery-input'), (files) => { addGallery(files); renderGallery(); });

// quick drop on the works panel: new work from files
const quick = $('#quick-drop');
quick.addEventListener('dragover', (e) => { if (e.dataTransfer.types.includes('Files')) { e.preventDefault(); quick.classList.add('is-over'); } });
quick.addEventListener('dragleave', () => quick.classList.remove('is-over'));
quick.addEventListener('drop', (e) => { e.preventDefault(); quick.classList.remove('is-over'); openEditor(null, [...e.dataTransfer.files]); });

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  const fd = new FormData();
  for (const k of ['title', 'category', 'year', 'client', 'role', 'description', 'slug', 'color', 'credits', 'videos']) fd.append(k, form[k].value);
  fd.append('published', form.published.checked);
  fd.append('featured', form.featured.checked);
  if (state.cover) fd.append('cover', state.cover.file);
  if (state.removeCover) fd.append('removeCover', '1');
  let n = 0;
  const order = state.gallery.map((g) => { if (g.file) { fd.append('gallery', g.file); return `new:${n++}`; } return g.url; });
  fd.append('galleryOrder', JSON.stringify(order));
  if (state.editing) fd.append('stillsHidden', JSON.stringify([...state.hidden]));
  const url = state.editing ? `/api/admin/works/${state.editing.id}` : '/api/admin/works';
  try {
    await upload(state.editing ? 'PUT' : 'POST', url, fd);
    toast('บันทึกแล้ว ผลงานขึ้นหน้าเว็บทันที');
    closeEditor(); loadWorks();
  } catch (err) { toast('บันทึกไม่สำเร็จ: ' + err.message, true); }
});

// XHR so we can show upload progress for big videos
function upload(method, url, body) {
  const bar = $('#progress');
  bar.hidden = false;
  return new Promise((resolve, reject) => {
    const x = new XMLHttpRequest();
    x.open(method, url);
    x.upload.onprogress = (e) => { if (e.lengthComputable) bar.firstElementChild.style.width = (e.loaded / e.total) * 100 + '%'; };
    x.onload = () => {
      bar.hidden = true; bar.firstElementChild.style.width = '0';
      if (x.status === 401) { showLogin(); return reject(new Error('unauthorized')); }
      x.status < 300 ? resolve(JSON.parse(x.responseText)) : reject(new Error(x.responseText));
    };
    x.onerror = () => { bar.hidden = true; reject(new Error('network')); };
    x.send(body);
  });
}

$('#delete-work').addEventListener('click', async () => {
  if (!state.editing || !confirm(`ลบ “${state.editing.title}” และไฟล์ทั้งหมดของผลงานนี้?`)) return;
  await api(`/api/admin/works/${state.editing.id}`, { method: 'DELETE' });
  toast('ลบแล้ว'); closeEditor(); loadWorks();
});

// ---------- settings ----------
const sform = $('#settings-form');
async function loadSettings() {
  const s = await fetch('/api/settings').then((r) => r.json());
  for (const k of ['siteName', 'tagline', 'about', 'email', 'phone', 'address']) sform[k].value = s[k] || '';
  sform.services.value = (s.services || []).join('\n');
  sform.socials.value = (s.socials || []).map((x) => `${x.label} | ${x.url}`).join('\n');
}
sform.addEventListener('submit', async (e) => {
  e.preventDefault();
  const body = Object.fromEntries(['siteName', 'tagline', 'about', 'email', 'phone', 'address'].map((k) => [k, sform[k].value]));
  body.services = sform.services.value.split('\n').map((s) => s.trim()).filter(Boolean);
  body.socials = sform.socials.value.split('\n').map((l) => l.split('|').map((s) => s.trim())).filter((p) => p[0] && p[1]).map(([label, url]) => ({ label, url }));
  await api('/api/admin/settings', json('PUT', body));
  $('#settings-saved').textContent = 'บันทึกแล้ว';
  setTimeout(() => ($('#settings-saved').textContent = ''), 2000);
});

// ---------- messages ----------
async function loadMessages() {
  const list = await api('/api/admin/messages');
  $('#msg-count').textContent = list.length || '';
  $('#messages').innerHTML = list.length ? list.map((m) => `<li class="msg">
    <header><strong>${esc(m.name || '(ไม่ระบุชื่อ)')}</strong> <a href="mailto:${esc(m.email)}">${esc(m.email)}</a>
    <time>${new Date(m.createdAt).toLocaleString('th-TH')}</time><button class="link" data-del="${m.id}">ลบ</button></header>
    <p>${esc(m.message).replace(/\n/g, '<br>')}</p></li>`).join('') : '<li class="empty">ยังไม่มีข้อความ</li>';
  $$('[data-del]').forEach((b) => b.addEventListener('click', async () => { await api(`/api/admin/messages/${b.dataset.del}`, { method: 'DELETE' }); loadMessages(); }));
}

function randomColor() { return '#' + [0, 0, 0].map(() => Math.floor(40 + Math.random() * 140).toString(16).padStart(2, '0')).join(''); }

// boot
fetch('/api/admin/me').then((r) => (r.ok ? showApp() : showLogin())).catch(showLogin);

document.querySelectorAll('[data-logo]').forEach((el) => (el.src = logoUrl));
