// Channel insights from a YouTube Studio "Advanced mode" export (Table data.csv).
// Pure functions: no DOM, tested under `node --test`.
//
// Column names depend on the metrics chosen and on the Studio language, so columns are
// detected by keywords (English and Thai) and the UI lets the user correct the mapping.

/** RFC 4180-ish CSV parser (quotes, escaped quotes, CRLF, BOM). */
export function parseCsv(text) {
  const rows = [];
  let row = [];
  let cell = '';
  let quoted = false;
  const s = String(text).replace(/^﻿/, '');
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (quoted) {
      if (c === '"' && s[i + 1] === '"') { cell += '"'; i++; }
      else if (c === '"') quoted = false;
      else cell += c;
    } else if (c === '"') quoted = true;
    else if (c === ',') { row.push(cell); cell = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && s[i + 1] === '\n') i++;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = '';
    } else cell += c;
  }
  if (cell !== '' || row.length) { row.push(cell); rows.push(row); }
  return rows.filter((r) => r.some((c) => c.trim() !== ''));
}

/** Fields we understand, with header keywords in English and Thai (lower case, tried in order). */
export const FIELDS = {
  title: ['video title', 'title', 'ชื่อวิดีโอ', 'ชื่อ'],
  id: ['content', 'video', 'เนื้อหา'],
  published: ['publish time', 'published', 'publish', 'เวลาเผยแพร่', 'เผยแพร่'],
  duration: ['duration', 'ระยะเวลา', 'ความยาว'],
  views: ['views', 'ยอดดู', 'การดู'],
  watchHours: ['watch time', 'เวลาในการรับชม'],
  avgDuration: ['average view duration', 'ระยะเวลาเฉลี่ยในการดู', 'ระยะเวลาการดูเฉลี่ย'],
  avgPercent: ['average percentage viewed', 'เปอร์เซ็นต์ที่ดูโดยเฉลี่ย', 'เปอร์เซ็นต์การดูเฉลี่ย'],
  impressions: ['impressions', 'การแสดงผล'],
  ctr: ['click-through rate', 'ctr', 'อัตราการคลิก'],
  subscribers: ['subscribers', 'ผู้ติดตาม', 'สมาชิก'],
};

/**
 * Guess which header index holds each field. More specific fields win:
 * "Impressions click-through rate" is CTR, not impressions; "Watch time (hours)" is not views.
 * @returns {Record<string, number>} field -> column index (-1 if not found)
 */
export function detectColumns(headers) {
  const h = headers.map((x) => String(x).toLowerCase().trim());
  const taken = new Set();
  const map = {};
  const order = ['ctr', 'avgPercent', 'avgDuration', 'watchHours', 'title', 'published', 'duration', 'impressions', 'subscribers', 'views', 'id'];
  for (const field of order) {
    map[field] = -1;
    for (const kw of FIELDS[field]) {
      const i = h.findIndex((name, idx) => !taken.has(idx) && (field === 'id' ? name === kw : name.includes(kw)));
      if (i >= 0) { map[field] = i; taken.add(i); break; }
    }
  }
  return map;
}

/** "12,345", "4.5%", "1:02:03", "" -> number (seconds for clock values) or NaN. */
export function toNumber(v) {
  const s = String(v ?? '').trim().replace(/,/g, '').replace(/%$/, '');
  if (!s) return NaN;
  if (/^\d+(:\d{1,2}){1,2}$/.test(s)) return s.split(':').reduce((t, p) => t * 60 + Number(p), 0);
  return Number(s);
}

/** Parse Studio dates like "Oct 21, 2026", "2026-10-21", "21 ต.ค. 2569". Returns Date or null. */
export function toDate(v) {
  const s = String(v ?? '').trim();
  if (!s) return null;
  const thMonths = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];
  const th = /^(\d{1,2})\s+(\S+)\s+(\d{4})/.exec(s);
  if (th) {
    const m = thMonths.indexOf(th[2]);
    if (m >= 0) {
      let y = Number(th[3]);
      if (y > 2400) y -= 543; // Buddhist era
      return new Date(y, m, Number(th[1]));
    }
  }
  const d = new Date(s);
  return isNaN(d) ? null : d;
}

/**
 * Turn rows into video records using a column map. Skips the "Total" row Studio adds.
 * @returns {{title, id, published: Date|null, views, avgPercent, avgDuration, ctr, impressions, watchHours, subscribers, duration}[]}
 */
export function toVideos(rows, map) {
  const [, ...data] = rows;
  const get = (r, f) => (map[f] >= 0 ? r[map[f]] : '');
  return data
    .filter((r) => !/^(total|รวม|ทั้งหมด)$/i.test(String(get(r, 'title') || r[0]).trim()))
    .map((r) => ({
      title: String(get(r, 'title') || get(r, 'id') || '').trim(),
      id: String(get(r, 'id') || '').trim(),
      published: toDate(get(r, 'published')),
      views: toNumber(get(r, 'views')),
      avgPercent: toNumber(get(r, 'avgPercent')),
      avgDuration: toNumber(get(r, 'avgDuration')),
      ctr: toNumber(get(r, 'ctr')),
      impressions: toNumber(get(r, 'impressions')),
      watchHours: toNumber(get(r, 'watchHours')),
      subscribers: toNumber(get(r, 'subscribers')),
      duration: toNumber(get(r, 'duration')),
    }))
    .filter((v) => v.title && Number.isFinite(v.views));
}

const median = (xs) => {
  const a = xs.filter(Number.isFinite).sort((x, y) => x - y);
  if (!a.length) return NaN;
  const m = Math.floor(a.length / 2);
  return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2;
};

/**
 * Insights a creator can act on.
 * - top retention / top CTR / most views
 * - "hidden gems": high retention but few impressions (worth re-promoting)
 * - "packaging problems": many impressions, low CTR (title/thumbnail to fix)
 * - publish weekday/hour performance, judged by median views (robust against one viral hit)
 */
export function insights(videos) {
  const med = {
    views: median(videos.map((v) => v.views)),
    avgPercent: median(videos.map((v) => v.avgPercent)),
    ctr: median(videos.map((v) => v.ctr)),
    impressions: median(videos.map((v) => v.impressions)),
  };
  const by = (key) => [...videos].filter((v) => Number.isFinite(v[key])).sort((a, b) => b[key] - a[key]);

  const hiddenGems = videos
    .filter((v) => v.avgPercent > med.avgPercent * 1.15 && v.impressions < med.impressions)
    .sort((a, b) => b.avgPercent - a.avgPercent);
  const packaging = videos
    .filter((v) => v.impressions > med.impressions && v.ctr < med.ctr * 0.8)
    .sort((a, b) => b.impressions - a.impressions);

  const groups = (keyOf, size) => {
    const buckets = Array.from({ length: size }, () => []);
    for (const v of videos) if (v.published) buckets[keyOf(v.published)].push(v.views);
    return buckets.map((views, i) => ({ key: i, count: views.length, medianViews: median(views) }));
  };
  const hasTime = videos.some((v) => v.published && (v.published.getHours() || v.published.getMinutes()));

  return {
    count: videos.length,
    medians: med,
    topViews: by('views').slice(0, 5),
    topRetention: by('avgPercent').slice(0, 5),
    topCtr: by('ctr').slice(0, 5),
    hiddenGems: hiddenGems.slice(0, 5),
    packaging: packaging.slice(0, 5),
    weekdays: groups((d) => d.getDay(), 7),
    hours: hasTime ? groups((d) => d.getHours(), 24) : null,
  };
}
