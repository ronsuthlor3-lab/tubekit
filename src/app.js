import { detectLanguage, getLanguage, setLanguage } from './i18n.js';
import { initAnalytics, render as renderAnalytics } from './ui/analytics-ui.js';
import { initComments, render as renderComments } from './ui/comments-ui.js';
import { initShorts, renderShorts } from './ui/shorts-ui.js';
import { initSubs, renderSubs } from './ui/subs-ui.js';
import { initThumbs, render as renderThumbs } from './ui/thumbs-ui.js';

const TABS = ['analytics', 'thumb', 'shorts', 'subs', 'comments'];

function showTab(name) {
  if (!TABS.includes(name)) name = 'analytics';
  for (const b of document.querySelectorAll('[data-tab]')) b.setAttribute('aria-selected', String(b.dataset.tab === name));
  for (const p of document.querySelectorAll('.panel')) p.hidden = p.id !== `tab-${name}`;
  if (location.hash !== `#${name}`) history.replaceState(null, '', `#${name}`);
}

function applyLanguage(lang) {
  setLanguage(lang);
  for (const b of document.querySelectorAll('[data-lang]')) b.setAttribute('aria-pressed', String(b.dataset.lang === getLanguage()));
  renderAnalytics();
  renderThumbs();
  renderShorts();
  renderSubs();
  renderComments();
}

for (const b of document.querySelectorAll('[data-tab]')) b.addEventListener('click', () => showTab(b.dataset.tab));
for (const b of document.querySelectorAll('[data-lang]')) b.addEventListener('click', () => applyLanguage(b.dataset.lang));
window.addEventListener('hashchange', () => showTab(location.hash.slice(1)));

initAnalytics();
initThumbs();
initShorts();
initSubs();
applyLanguage(detectLanguage());
initComments();
showTab(location.hash.slice(1));
