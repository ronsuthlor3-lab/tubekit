import { detectColumns, insights, parseCsv, toVideos } from '../analytics.js';
import { t } from '../i18n.js';
import { $, bindDrop, el, fmtNum } from './common.js';

const FIELD_LABELS = {
  title: 'fTitle', id: 'fId', published: 'fPublished', duration: 'fDuration', views: 'fViews', watchHours: 'fWatchHours',
  avgDuration: 'fAvgDuration', avgPercent: 'fAvgPercent', impressions: 'fImpressions', ctr: 'fCtr', subscribers: 'fSubscribers',
};

let rows = null;
let map = null;

function load(text) {
  rows = parseCsv(text);
  if (!rows.length) return;
  map = detectColumns(rows[0]);
  render();
}

/** A made-up channel, so people can see what the report looks like. */
function demoCsv() {
  let s = 11;
  const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  const topics = ['สอนวาดหน้าคน', 'วาดมือให้สวย', 'ลงสีน้ำ', 'Speedpaint', 'รีวิวปากกา', 'วาดตามคำขอ', 'Q&A ศิลปิน', 'วาดสัตว์น่ารัก'];
  const lines = ['Content,Video title,Video publish time,Duration,Views,Watch time (hours),Average view duration,Average percentage viewed (%),Impressions,Impressions click-through rate (%)'];
  lines.push('Total,,,,123456,9999,,,,');
  for (let i = 0; i < 36; i++) {
    const topic = topics[i % topics.length];
    const d = new Date(2026, 0, 3 + i * 8, [12, 18, 19, 20][i % 4], 0);
    const dur = 300 + Math.floor(rnd() * 900);
    const imp = Math.floor(2000 + rnd() * 60000);
    const ctr = +(2 + rnd() * 9 + (topic.includes('หน้า') ? 3 : 0)).toFixed(1);
    const views = Math.floor((imp * ctr) / 100 * (0.8 + rnd() * 0.6) * (d.getDay() === 6 ? 1.6 : 1));
    const pct = +(25 + rnd() * 35 + (topic.includes('Speed') ? 12 : 0)).toFixed(1);
    const avg = Math.floor((dur * pct) / 100);
    const id = Math.random().toString(36).slice(2, 13).padEnd(11, 'x');
    lines.push([id, `"${topic} ตอนที่ ${i + 1}"`, `"${d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}"`, dur, views, ((views * avg) / 3600).toFixed(1), `${Math.floor(avg / 60)}:${String(avg % 60).padStart(2, '0')}`, pct, imp, ctr].join(','));
  }
  return lines.join('\n');
}

function videoList(list, metric) {
  if (!list.length) return el('p', { class: 'muted small' }, t('anNone'));
  return el('ol', { class: 'vlist' }, list.map((v) => el('li', {}, el('span', { class: 'vt' }, v.title), el('span', { class: 'vm' }, metric(v)))));
}

function bars(groups, labels) {
  const max = Math.max(...groups.map((g) => (Number.isFinite(g.medianViews) ? g.medianViews : 0)), 1);
  return el('div', { class: 'bars' }, groups.map((g, i) =>
    el('div', { class: `bar-row${g.count < 3 ? ' weak' : ''}` },
      el('span', { class: 'bl' }, labels[i]),
      el('span', { class: 'bt' }, el('span', { class: 'bf', style: `width:${Number.isFinite(g.medianViews) ? (g.medianViews / max) * 100 : 0}%` })),
      el('span', { class: 'bv' }, g.count ? `${fmtNum(g.medianViews)} · ${t('clips', { n: g.count })}` : '—'))));
}

export function render() {
  const out = $('an-out');
  if (!rows) return out.replaceChildren();
  const headers = rows[0];
  const mapper = el('details', { class: 'card' },
    el('summary', {}, t('anMap')),
    el('p', { class: 'muted small' }, t('anMapHelp')),
    el('div', { class: 'grid3' }, Object.keys(FIELD_LABELS).map((f) => {
      const sel = el('select', { onchange: (e) => { map[f] = Number(e.target.value); render(); } },
        el('option', { value: '-1' }, t('fNone')),
        headers.map((h, i) => el('option', { value: String(i), selected: map[f] === i }, h)));
      return el('label', {}, el('span', {}, t(FIELD_LABELS[f])), sel);
    })));

  const videos = toVideos(rows, map);
  const r = insights(videos);
  const pct = (v) => (Number.isFinite(v) ? `${fmtNum(v)}%` : '—');
  const days = t('days');
  out.replaceChildren(
    mapper,
    el('p', { class: 'strong' }, t('anVideos', { n: r.count }), ' · ', t('anMedian', { views: fmtNum(r.medians.views), pct: fmtNum(r.medians.avgPercent), ctr: fmtNum(r.medians.ctr) })),
    el('div', { class: 'grid2' },
      el('div', { class: 'card' }, el('h3', {}, t('anGems')), el('p', { class: 'muted small' }, t('anGemsTip')), videoList(r.hiddenGems, (v) => `${pct(v.avgPercent)} · ${fmtNum(v.impressions)} imp.`)),
      el('div', { class: 'card' }, el('h3', {}, t('anPackaging')), el('p', { class: 'muted small' }, t('anPackagingTip')), videoList(r.packaging, (v) => `CTR ${pct(v.ctr)} · ${fmtNum(v.impressions)} imp.`)),
      el('div', { class: 'card' }, el('h3', {}, t('anTopRetention')), el('p', { class: 'muted small' }, t('anTopRetentionTip')), videoList(r.topRetention, (v) => pct(v.avgPercent))),
      el('div', { class: 'card' }, el('h3', {}, t('anTopCtr')), el('p', { class: 'muted small' }, t('anTopCtrTip')), videoList(r.topCtr, (v) => `CTR ${pct(v.ctr)}`)),
      el('div', { class: 'card' }, el('h3', {}, t('anTopViews')), videoList(r.topViews, (v) => fmtNum(v.views))),
      el('div', { class: 'card' },
        el('h3', {}, t('anDays')),
        r.weekdays.some((g) => g.count) ? bars(r.weekdays, days) : el('p', { class: 'muted small' }, t('anNoTime')),
        r.hours ? [el('h3', {}, t('anHours')), bars(r.hours.filter((g) => g.count), r.hours.filter((g) => g.count).map((g) => `${String(g.key).padStart(2, '0')}:00`))] : '',
        el('p', { class: 'muted small' }, t('anTimingNote'))),
    ),
    el('p', { class: 'note' }, t('anRetentionNote')),
  );
}

export function initAnalytics() {
  bindDrop($('an-drop'), $('an-file'), async (f) => load(await f.text()));
  $('an-demo').addEventListener('click', () => load(demoCsv()));
}
