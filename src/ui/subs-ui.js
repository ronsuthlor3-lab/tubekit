import { t } from '../i18n.js';
import { chapterTime, chaptersText, mergeShortCues, parseSubtitles, suggestChapters, toSrt, toTranscript, toVtt, validateChapters } from '../subtitles.js';
import { $, bindDrop, copyText, download, el, shared } from './common.js';

let name = 'captions';
let chapters = [];

const parseClock = (s) => {
  const parts = String(s).trim().split(':').map(Number);
  if (parts.some((p) => !Number.isFinite(p))) return NaN;
  return parts.reduce((total, p) => total * 60 + p, 0);
};

function renderCues() {
  const cues = shared.cues;
  const total = cues.length ? cues[cues.length - 1].end : 0;
  $('su-info').textContent = t('suCues', { n: cues.length, t: chapterTime(total) });
  $('su-transcript').value = toTranscript(cues);
  // Editing hundreds of rows is fine; thousands would be slow, so cap the editor.
  $('su-cues').replaceChildren(...cues.slice(0, 1500).map((c, i) =>
    el('div', { class: 'cue' },
      el('code', {}, chapterTime(c.start)),
      el('input', { value: c.text, 'aria-label': chapterTime(c.start), oninput: (e) => { shared.cues[i].text = e.target.value; $('su-transcript').value = toTranscript(shared.cues); } }))));
}

function renderChapters() {
  $('su-chapters').replaceChildren(...chapters.map((c, i) =>
    el('div', { class: 'chapter row' },
      el('input', { class: 'ch-time', value: chapterTime(c.start), 'aria-label': t('suChapterTime'), onchange: (e) => { const s = parseClock(e.target.value); if (Number.isFinite(s)) c.start = s; renderChapters(); } }),
      el('input', { class: 'ch-title', value: c.title, 'aria-label': t('suChapterTitle'), oninput: (e) => { c.title = e.target.value; updateChapterText(); } }),
      el('button', { type: 'button', class: 'link', onclick: () => { chapters.splice(i, 1); renderChapters(); } }, '✕'))));
  updateChapterText();
}

function updateChapterText() {
  $('su-ch-text').value = chaptersText(chapters);
  const problems = validateChapters(chapters);
  const msg = $('su-ch-msg');
  msg.textContent = chapters.length ? (problems.length ? problems.map((p) => t(`ch${p}`)).join(' · ') : t('chOk')) : '';
  msg.className = `msg ${problems.length ? 'error' : 'ok'}`;
}

function load(text, filename) {
  name = filename.replace(/\.[^.]+$/, '');
  shared.cues = parseSubtitles(text);
  chapters = [];
  $('su-work').hidden = false;
  renderCues();
  renderChapters();
}

export function renderSubs() {
  if (!shared.cues.length) return;
  renderCues();
  updateChapterText();
}

export function initSubs() {
  bindDrop($('su-drop'), $('su-file'), async (f) => load(await f.text(), f.name));
  $('su-merge').addEventListener('click', () => { shared.cues = mergeShortCues(shared.cues); renderCues(); });
  $('su-srt').addEventListener('click', () => download(toSrt(shared.cues), `${name}.srt`));
  $('su-vtt').addEventListener('click', () => download(toVtt(shared.cues), `${name}.vtt`, 'text/vtt;charset=utf-8'));
  $('su-suggest').addEventListener('click', () => { chapters = suggestChapters(shared.cues); renderChapters(); });
  $('su-add').addEventListener('click', () => {
    const last = chapters.length ? Math.max(...chapters.map((c) => c.start)) + 60 : 0;
    chapters.push({ start: last, title: '' });
    renderChapters();
  });
  $('su-ch-copy').addEventListener('click', (e) => copyText($('su-ch-text').value, e.target));
  $('su-tr-copy').addEventListener('click', (e) => copyText($('su-transcript').value, e.target));
}
