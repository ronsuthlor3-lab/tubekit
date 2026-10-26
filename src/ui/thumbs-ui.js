import { t } from '../i18n.js';
import { $, el } from './common.js';

const items = []; // {url, name, w, h, size, competitor, busy, contrast}

/** Rough "busyness" (edge density) and contrast (luma spread) at YouTube's small size. */
async function measure(file) {
  // createImageBitmap decodes off-screen; <img>.decode() can stall while the page is not being painted.
  const img = await createImageBitmap(file);
  const c = document.createElement('canvas');
  c.width = 168;
  c.height = 94;
  const g = c.getContext('2d', { willReadFrequently: true });
  g.drawImage(img, 0, 0, c.width, c.height);
  const d = g.getImageData(0, 0, c.width, c.height).data;
  const L = new Float32Array(c.width * c.height);
  for (let i = 0, p = 0; p < L.length; p++, i += 4) L[p] = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
  let edges = 0;
  for (let y = 1; y < c.height - 1; y++) {
    for (let x = 1; x < c.width - 1; x++) {
      const p = y * c.width + x;
      if (Math.abs(L[p + 1] - L[p - 1]) + Math.abs(L[p + c.width] - L[p - c.width]) > 60) edges++;
    }
  }
  const sorted = Array.from(L).sort((a, b) => a - b);
  // 2nd–98th percentile: text or a face can cover only a few percent of the frame and still matter.
  const spread = sorted[Math.floor(sorted.length * 0.98)] - sorted[Math.floor(sorted.length * 0.02)];
  const size = { w: img.width, h: img.height };
  img.close();
  return { ...size, busy: edges / ((c.width - 2) * (c.height - 2)), contrast: spread };
}

async function add(files, competitor) {
  for (const f of files) {
    if (!f.type.startsWith('image/')) continue;
    let m;
    try { m = await measure(f); } catch { continue; }
    const url = URL.createObjectURL(f);
    items.push({ url, name: f.name, size: f.size, competitor, ...m });
  }
  render();
}

function avatar(name) {
  return el('span', { class: 'yt-avatar' }, (name || '?').trim().slice(0, 1).toUpperCase());
}

function card(item, variant, title, channel, views) {
  return el('div', { class: `yt-card ${variant}` },
    el('div', { class: 'yt-thumb' }, el('img', { src: item.url, alt: '' }), el('span', { class: 'yt-time' }, '12:34')),
    el('div', { class: 'yt-meta' },
      variant === 'sidebar' ? '' : avatar(channel),
      el('div', {},
        el('div', { class: 'yt-title' }, title || '—'),
        el('div', { class: 'yt-sub' }, channel || '—'),
        el('div', { class: 'yt-sub' }, t('justNow', { views })))));
}

function checks(item, title) {
  const ok = (good, text) => el('li', { class: good ? 'ok-text' : 'warn-text' }, `${good ? '✓' : '⚠'} ${text}`);
  const ratio = item.w / item.h;
  const list = [
    ok(item.w >= 1280 && item.h >= 720, `${t('ckSize', { w: item.w, h: item.h })} — ${t(item.w >= 1280 && item.h >= 720 ? 'ckSizeOk' : 'ckSizeLow')}`),
    ok(Math.abs(ratio - 16 / 9) < 0.02, Math.abs(ratio - 16 / 9) < 0.02 ? t('ckRatio') : t('ckRatioBad')),
    ok(item.size <= 2 * 1024 * 1024, `${t('ckFile', { kb: Math.round(item.size / 1024) })}${item.size > 2 * 1024 * 1024 ? ` — ${t('ckFileBig')}` : ''}`),
    ok(item.busy < 0.22, `${t('ckBusy')}: ${t(item.busy < 0.22 ? 'ckBusyOk' : 'ckBusyHigh')}`),
    ok(item.contrast > 110, `${t('ckContrast')}: ${t(item.contrast > 110 ? 'ckContrastOk' : 'ckContrastLow')}`),
  ];
  if (!item.competitor && title) {
    const n = [...title].length;
    list.push(ok(n <= 60, `${t('ckTitleLen', { n })}${n > 100 ? ` — ${t('ckTitleMax')}` : n > 60 ? ` — ${t('ckTitleLong')}` : ''}`));
  }
  return el('ul', { class: 'checks' }, list);
}

export function render() {
  const out = $('th-out');
  if (!items.length) return out.replaceChildren();
  const title = $('th-title').value.trim();
  const channel = $('th-channel').value.trim();
  const views = $('th-views').value.trim() || '12K';
  const theme = document.querySelector('input[name="th-theme"]:checked').value;
  const titleFor = (it) => (it.competitor ? it.name.replace(/\.[^.]+$/, '') : title);

  out.replaceChildren(
    el('div', { class: `yt yt-${theme}` },
      el('h3', {}, t('thHome')),
      el('div', { class: 'yt-grid' }, items.map((it) => card(it, 'home', titleFor(it), it.competitor ? t('thCompetitor') : channel, views))),
      el('div', { class: 'yt-split' },
        el('div', {}, el('h3', {}, t('thMobile')), el('div', { class: 'yt-phone' }, items.map((it) => card(it, 'mobile', titleFor(it), it.competitor ? t('thCompetitor') : channel, views)))),
        el('div', {}, el('h3', {}, t('thSidebar')), el('div', { class: 'yt-side' }, items.map((it) => card(it, 'sidebar', titleFor(it), it.competitor ? t('thCompetitor') : channel, views)))))),
    el('h3', {}, t('thChecks')),
    el('div', { class: 'grid3' }, items.map((it, i) =>
      el('div', { class: 'card' },
        el('img', { src: it.url, alt: '', class: 'check-thumb' }),
        el('p', { class: 'small strong' }, `${it.name} · ${t(it.competitor ? 'thCompetitor' : 'thMine')}`),
        checks(it, title),
        el('button', { type: 'button', class: 'link', onclick: () => { URL.revokeObjectURL(it.url); items.splice(i, 1); render(); } }, t('thRemove'))))),
  );
}

export function initThumbs() {
  // Copy the FileList first: clearing the input empties the live list while `add` is still reading it.
  $('th-file').addEventListener('change', (e) => { add([...e.target.files], false); e.target.value = ''; });
  $('th-comp').addEventListener('change', (e) => { add([...e.target.files], true); e.target.value = ''; });
  for (const id of ['th-title', 'th-channel', 'th-views']) $(id).addEventListener('input', render);
  for (const r of document.querySelectorAll('input[name="th-theme"]')) r.addEventListener('change', render);
}
