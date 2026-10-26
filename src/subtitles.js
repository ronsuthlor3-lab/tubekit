// Subtitle files (SRT, WebVTT, SBV), transcripts and YouTube chapters.
// Pure functions, tested under `node --test`.

/** "00:01:02,345" / "1:02.345" / "0:01:02.345" -> seconds. */
export function parseTime(s) {
  const m = /^(?:(\d+):)?(\d{1,2}):(\d{1,2})(?:[.,](\d{1,3}))?$/.exec(String(s).trim());
  if (!m) return NaN;
  return Number(m[1] || 0) * 3600 + Number(m[2]) * 60 + Number(m[3]) + Number((m[4] || '0').padEnd(3, '0')) / 1000;
}

const pad = (n, w = 2) => String(n).padStart(w, '0');

export function formatTime(sec, sep = ',') {
  const ms = Math.round(Math.max(0, sec) * 1000);
  const h = Math.floor(ms / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  const s = Math.floor((ms % 60000) / 1000);
  return `${pad(h)}:${pad(m)}:${pad(s)}${sep}${pad(ms % 1000, 3)}`;
}

/** Chapter timestamp as YouTube expects: "0:00", "4:05", "1:02:03". */
export function chapterTime(sec) {
  const t = Math.floor(sec);
  const h = Math.floor(t / 3600);
  const m = Math.floor((t % 3600) / 60);
  const s = t % 60;
  return h ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
}

/**
 * Parse SRT, VTT or SBV text into cues [{start, end, text}].
 * Inline tags such as <c>, <b> and YouTube's word timing tags are removed.
 */
export function parseSubtitles(input) {
  const text = String(input).replace(/^﻿/, '').replace(/\r\n?/g, '\n');
  const cues = [];
  const clean = (t) => t.replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').trim();
  for (const block of text.split(/\n{2,}/)) {
    const lines = block.split('\n').filter((l) => l.trim() !== '');
    const i = lines.findIndex((l) => /-->/.test(l) || /^\d+:\d{2}:\d{2}\.\d{3},\d+:\d{2}:\d{2}\.\d{3}$/.test(l.trim()));
    if (i < 0) continue;
    let start;
    let end;
    if (lines[i].includes('-->')) {
      const [a, b] = lines[i].split('-->');
      start = parseTime(a);
      end = parseTime(b.trim().split(/\s+/)[0]);
    } else {
      const [a, b] = lines[i].trim().split(',');
      start = parseTime(a);
      end = parseTime(b);
    }
    const body = clean(lines.slice(i + 1).join('\n'));
    if (Number.isFinite(start) && Number.isFinite(end) && body) cues.push({ start, end, text: body });
  }
  cues.sort((a, b) => a.start - b.start);
  // YouTube auto-captions repeat the previous line in "rolling" cues; drop exact repeats.
  return cues.filter((c, i) => i === 0 || c.text !== cues[i - 1].text);
}

export function toSrt(cues) {
  return cues.map((c, i) => `${i + 1}\n${formatTime(c.start)} --> ${formatTime(c.end)}\n${c.text}\n`).join('\n');
}

export function toVtt(cues) {
  return 'WEBVTT\n\n' + cues.map((c) => `${formatTime(c.start, '.')} --> ${formatTime(c.end, '.')}\n${c.text}\n`).join('\n');
}

/** Plain transcript; a new paragraph after pauses longer than `gap` seconds. */
export function toTranscript(cues, gap = 2) {
  let out = '';
  cues.forEach((c, i) => {
    if (i && c.start - cues[i - 1].end > gap) out += '\n\n';
    else if (i) out += ' ';
    out += c.text.replace(/\n/g, ' ');
  });
  return out.trim();
}

/** Join cues shorter than `minSeconds` into the next one, for easier-to-read subtitles. */
export function mergeShortCues(cues, minSeconds = 1.2, maxChars = 84) {
  const out = [];
  for (const c of cues) {
    const prev = out[out.length - 1];
    if (prev && prev.end - prev.start < minSeconds && (prev.text + ' ' + c.text).length <= maxChars && c.start - prev.end < 0.5) {
      prev.text = `${prev.text} ${c.text}`;
      prev.end = c.end;
    } else out.push({ ...c });
  }
  return out;
}

/**
 * Suggest chapter starts at the longest pauses, keeping chapters at least `minLength` apart.
 * Titles default to the first words after the pause; the creator should rename them.
 */
export function suggestChapters(cues, { count = 6, minLength = 60 } = {}) {
  if (!cues.length) return [];
  const total = cues[cues.length - 1].end;
  const gaps = cues.slice(1).map((c, i) => ({ at: c.start, gap: c.start - cues[i].end, cue: c })).sort((a, b) => b.gap - a.gap);
  const picked = [0];
  for (const g of gaps) {
    if (picked.length >= count) break;
    if (g.at < minLength || total - g.at < minLength) continue;
    if (picked.every((p) => Math.abs(p - g.at) >= minLength)) picked.push(g.at);
  }
  picked.sort((a, b) => a - b);
  const firstWords = (t) => t.replace(/\n/g, ' ').split(/\s+/).slice(0, 6).join(' ').slice(0, 60);
  return picked.map((at) => ({ start: Math.floor(at), title: firstWords((cues.find((c) => c.start >= at) ?? cues[0]).text) }));
}

/**
 * Check chapters against YouTube's rules: first at 0:00, at least 3, each at least 10 seconds.
 * @returns {string[]} problem codes
 */
export function validateChapters(chapters) {
  const problems = [];
  const sorted = [...chapters].sort((a, b) => a.start - b.start);
  if (!sorted.length || sorted[0].start !== 0) problems.push('FIRST_NOT_ZERO');
  if (sorted.length < 3) problems.push('TOO_FEW');
  for (let i = 1; i < sorted.length; i++) if (sorted[i].start - sorted[i - 1].start < 10) { problems.push('TOO_SHORT'); break; }
  if (sorted.some((c) => !c.title.trim())) problems.push('EMPTY_TITLE');
  return problems;
}

export function chaptersText(chapters) {
  return [...chapters].sort((a, b) => a.start - b.start).map((c) => `${chapterTime(c.start)} ${c.title.trim()}`).join('\n');
}

/** Cues overlapping [from, to], re-timed so `from` becomes 0. */
export function sliceCues(cues, from, to) {
  return cues
    .filter((c) => c.end > from && c.start < to)
    .map((c) => ({ start: Math.max(0, c.start - from), end: Math.min(to, c.end) - from, text: c.text }));
}
