import assert from 'node:assert/strict';
import { test } from 'node:test';
import { detectColumns, insights, parseCsv, toDate, toNumber, toVideos } from '../src/analytics.js';
import { fillTemplate, isQuestion, prioritise, unanswered, videoId } from '../src/comments.js';
import { loudnessPerSecond, pickSegments, verticalCrop } from '../src/highlights.js';
import { chaptersText, mergeShortCues, parseSubtitles, suggestChapters, toSrt, validateChapters } from '../src/subtitles.js';

// ---------- analytics ----------

test('CSV parser handles quotes, commas and CRLF', () => {
  assert.deepEqual(parseCsv('a,"b, c","say ""hi"""\r\n1,2,3\r\n'), [['a', 'b, c', 'say "hi"'], ['1', '2', '3']]);
});

test('English and Thai Studio headers are detected', () => {
  const en = detectColumns(['Content', 'Video title', 'Video publish time', 'Views', 'Watch time (hours)', 'Average view duration', 'Average percentage viewed (%)', 'Impressions', 'Impressions click-through rate (%)']);
  assert.deepEqual([en.id, en.title, en.published, en.views, en.watchHours, en.avgDuration, en.avgPercent, en.impressions, en.ctr], [0, 1, 2, 3, 4, 5, 6, 7, 8]);
  const th = detectColumns(['เนื้อหา', 'ชื่อวิดีโอ', 'ยอดดู', 'การแสดงผล', 'อัตราการคลิกผ่านของการแสดงผล (%)']);
  assert.deepEqual([th.id, th.title, th.views, th.impressions, th.ctr], [0, 1, 2, 3, 4]);
});

test('numbers, clock values and Thai dates are parsed', () => {
  assert.equal(toNumber('12,345'), 12345);
  assert.equal(toNumber('4.5%'), 4.5);
  assert.equal(toNumber('1:02:03'), 3723);
  assert.ok(Number.isNaN(toNumber('')));
  const d = toDate('21 ต.ค. 2569');
  assert.deepEqual([d.getFullYear(), d.getMonth(), d.getDate()], [2026, 9, 21]);
});

test('Total row is skipped and insights find gems and packaging problems', () => {
  const head = 'Video title,Views,Average percentage viewed (%),Impressions,Impressions click-through rate (%)';
  const rows = parseCsv([
    head,
    'Total,999999,,,',
    'normal 1,1000,40,10000,5', 'normal 2,1100,41,11000,5.2', 'normal 3,900,39,9000,4.8',
    'gem,300,70,2000,6',
    'bad thumbnail,800,40,50000,1.5',
  ].join('\n'));
  const videos = toVideos(rows, detectColumns(rows[0]));
  assert.equal(videos.length, 5);
  const r = insights(videos);
  assert.equal(r.hiddenGems[0].title, 'gem');
  assert.equal(r.packaging[0].title, 'bad thumbnail');
  assert.equal(r.topViews[0].title, 'normal 2');
});

// ---------- subtitles ----------

const VTT = `WEBVTT
Kind: captions

00:00:00.000 --> 00:00:02.000 align:start
สวัสดี<00:00:01.000><c> ครับ</c>

00:00:02.000 --> 00:00:02.010
สวัสดี ครับ

00:00:30.000 --> 00:00:31.000
หัวข้อที่สอง

00:01:40.000 --> 00:01:42.000
หัวข้อที่สาม
`;

test('VTT with YouTube word tags and rolling repeats', () => {
  const cues = parseSubtitles(VTT);
  assert.deepEqual(cues.map((c) => c.text), ['สวัสดี ครับ', 'หัวข้อที่สอง', 'หัวข้อที่สาม']);
  assert.match(toSrt(cues), /^1\n00:00:00,000 --> 00:00:02,000\nสวัสดี ครับ\n/);
});

test('SRT and SBV are read', () => {
  assert.equal(parseSubtitles('1\n00:00:01,500 --> 00:00:03,000\nhello\n')[0].start, 1.5);
  assert.equal(parseSubtitles('0:00:01.500,0:00:03.000\nhello\n')[0].end, 3);
});

test('short cues merge', () => {
  const merged = mergeShortCues([{ start: 0, end: 0.5, text: 'a' }, { start: 0.6, end: 2, text: 'b' }]);
  assert.deepEqual(merged, [{ start: 0, end: 2, text: 'a b' }]);
});

test('chapters follow YouTube rules', () => {
  assert.deepEqual(validateChapters([{ start: 0, title: 'a' }, { start: 60, title: 'b' }, { start: 120, title: 'c' }]), []);
  assert.ok(validateChapters([{ start: 5, title: 'a' }]).includes('FIRST_NOT_ZERO'));
  assert.ok(validateChapters([{ start: 0, title: 'a' }, { start: 5, title: 'b' }, { start: 60, title: 'c' }]).includes('TOO_SHORT'));
  assert.equal(chaptersText([{ start: 3723, title: 'z' }, { start: 0, title: 'a' }]), '0:00 a\n1:02:03 z');
});

test('chapter suggestions start at 0 and use long pauses', () => {
  const cues = [];
  for (let i = 0; i < 30; i++) cues.push({ start: i * 10 + (i === 12 ? 6 : 0), end: i * 10 + 8, text: `line ${i}` });
  const ch = suggestChapters(cues, { count: 3, minLength: 60 });
  assert.equal(ch[0].start, 0);
  assert.ok(ch.some((c) => c.start === 126), JSON.stringify(ch));
});

// ---------- comments ----------

test('video ids from many URL shapes', () => {
  for (const u of ['dQw4w9WgXcQ', 'https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=1', 'https://youtu.be/dQw4w9WgXcQ', 'https://youtube.com/shorts/dQw4w9WgXcQ']) assert.equal(videoId(u), 'dQw4w9WgXcQ');
  assert.equal(videoId('not a link'), null);
});

test('unanswered threads exclude owner replies and owner comments; questions first', () => {
  const owner = 'UCowner';
  const th = (id, text, likes, { reply = false, author = `UC${id}` } = {}) => ({
    id,
    snippet: { channelId: owner, videoId: 'v', totalReplyCount: reply ? 1 : 0, topLevelComment: { snippet: { authorDisplayName: `@${id}`, authorChannelId: { value: author }, textDisplay: text, likeCount: likes } } },
    replies: reply ? { comments: [{ snippet: { authorChannelId: { value: owner } } }] } : undefined,
  });
  const list = prioritise(unanswered([th('a', 'nice', 50), th('b', 'ใช้ปากกาอะไรครับ', 1), th('c', 'thanks', 9, { reply: true }), th('d', 'pinned', 0, { author: owner })]));
  assert.deepEqual(list.map((c) => c.id), ['b', 'a']);
  assert.ok(isQuestion('วาดยังไงครับ'));
  assert.equal(fillTemplate('ขอบคุณคุณ {name}', list[0]), 'ขอบคุณคุณ b');
});

// ---------- highlights ----------

test('the loud part of a recording is picked first', () => {
  const rate = 100;
  const samples = new Float32Array(60 * rate);
  for (let i = 0; i < samples.length; i++) {
    const sec = i / rate;
    samples[i] = Math.sin(i) * (sec >= 30 && sec < 40 ? 0.8 * (1 + Math.sin(sec * 3)) / 2 : 0.05);
  }
  const segments = pickSegments(loudnessPerSecond(samples, rate), { length: 10, count: 3 });
  assert.ok(segments[0].start >= 27 && segments[0].start <= 33, JSON.stringify(segments[0]));
});

test('vertical crop stays inside the frame', () => {
  assert.deepEqual(verticalCrop(1920, 1080, 0.5), { x: 656, y: 0, w: 608, h: 1080 });
  assert.equal(verticalCrop(1920, 1080, 0).x, 0);
  assert.equal(verticalCrop(1920, 1080, 1).x, 1920 - 608);
});
