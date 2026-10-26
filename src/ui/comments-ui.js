import { fillTemplate, prioritise, threadsUrl, unanswered, videoId } from '../comments.js';
import { getLanguage, STRINGS, t } from '../i18n.js';
import { $, copyText, el, store } from './common.js';

const KEY = 'tubekit.apiKey';
const TEMPLATES = 'tubekit.templates';
const DONE = 'tubekit.doneComments';
const MAX_PAGES = 10; // up to 1000 threads per video keeps quota use small (1 unit per page)

let list = [];
const done = new Set(JSON.parse(store.get(DONE) || '[]'));

function templates() {
  return $('co-templates').value.split('\n').map((s) => s.trim()).filter(Boolean);
}

async function fetchVideo(id, key, onProgress) {
  const items = [];
  let pageToken;
  for (let page = 0; page < MAX_PAGES; page++) {
    const res = await fetch(threadsUrl({ videoId: id, key, pageToken }));
    const body = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(body?.error?.message || `HTTP ${res.status}`);
    items.push(...(body.items ?? []));
    onProgress(items.length);
    pageToken = body.nextPageToken;
    if (!pageToken) break;
  }
  return items;
}

async function run() {
  const key = $('co-key').value.trim();
  const msg = $('co-msg');
  if (!key) { msg.textContent = t('coErrKey'); msg.className = 'msg error'; return; }
  if ($('co-remember').checked) store.set(KEY, key); else store.del(KEY);
  const ids = [...new Set($('co-videos').value.split(/\s+/).map(videoId).filter(Boolean))];
  if (!ids.length) return;
  $('co-fetch').disabled = true;
  msg.className = 'msg';
  let total = 0;
  const all = [];
  try {
    for (const id of ids) {
      const items = await fetchVideo(id, key, (n) => { msg.textContent = t('coFetching', { n: total + n }); });
      total += items.length;
      all.push(...unanswered(items));
    }
    list = prioritise(all);
    msg.textContent = t('coFound', { n: list.length, q: list.filter((c) => c.question).length });
  } catch (err) {
    msg.textContent = t('coErrApi', { msg: err.message });
    msg.className = 'msg error';
  }
  $('co-fetch').disabled = false;
  render();
}

export function render() {
  const tpl = templates();
  const visible = list.filter((c) => !done.has(c.id));
  $('co-out').replaceChildren(...visible.map((c) =>
    el('div', { class: 'card comment' },
      el('div', { class: 'row wrap' },
        el('strong', {}, c.author),
        c.question ? el('span', { class: 'pill' }, t('coQuestion')) : '',
        el('span', { class: 'muted small' }, t('coLikes', { n: c.likes })),
        el('span', { class: 'muted small' }, new Date(c.publishedAt).toLocaleDateString(getLanguage() === 'th' ? 'th-TH' : 'en-GB'))),
      el('p', { class: 'comment-text' }, c.text),
      el('div', { class: 'row wrap' },
        el('a', { class: 'button', href: c.url, target: '_blank', rel: 'noopener' }, t('coOpen')),
        tpl.map((x) => el('button', { type: 'button', class: 'secondary small-btn', title: fillTemplate(x, c), onclick: (e) => copyText(fillTemplate(x, c), e.target) }, `${t('coCopyReply')}: ${fillTemplate(x, c).slice(0, 24)}…`)),
        el('button', { type: 'button', class: 'link', onclick: () => { done.add(c.id); store.set(DONE, JSON.stringify([...done].slice(-5000))); render(); } }, `✓ ${t('coDone')}`)))));
}

export function initComments() {
  const saved = store.get(KEY);
  if (saved) { $('co-key').value = saved; $('co-remember').checked = true; }
  // Use the raw template string: t() would replace {name} with an empty value.
  $('co-templates').value = store.get(TEMPLATES) || STRINGS[getLanguage()].coTemplatesDefault;
  $('co-templates').addEventListener('input', () => { store.set(TEMPLATES, $('co-templates').value); render(); });
  $('co-fetch').addEventListener('click', run);
}
