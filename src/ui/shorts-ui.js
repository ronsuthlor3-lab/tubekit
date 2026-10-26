import { loudnessPerSecond, pickSegments, verticalCrop } from '../highlights.js';
import { getLanguage, t } from '../i18n.js';
import { parseSubtitles } from '../subtitles.js';
import { $, el, shared } from './common.js';

const W = 720;
const H = 1280;
const state = { file: null, cues: [], playing: false, audio: null, recording: false, loop: 0 };

const video = () => $('sh-video');
const canvas = () => $('sh-canvas');

// ---------------- drawing ----------------

/** Split text into lines that fit `maxWidth`, by words (Thai has no spaces, so use Intl.Segmenter). */
function wrap(ctx, text, maxWidth) {
  const words = typeof Intl.Segmenter === 'function'
    ? [...new Intl.Segmenter(getLanguage() === 'th' ? 'th' : 'en', { granularity: 'word' }).segment(text)].map((s) => s.segment)
    : [...text];
  const lines = [];
  let line = '';
  for (const w of words) {
    if (w === '\n') { lines.push(line); line = ''; continue; }
    const next = line + w;
    if (ctx.measureText(next).width > maxWidth && line.trim()) { lines.push(line.trim()); line = w.trimStart(); }
    else line = next;
  }
  if (line.trim()) lines.push(line.trim());
  return lines;
}

function drawText(ctx, text, y, size, anchorBottom) {
  ctx.font = `700 ${size}px "Leelawadee UI", "Noto Sans Thai", "Sarabun", system-ui, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const lines = wrap(ctx, text, W * 0.86).slice(0, 4);
  const lh = size * 1.3;
  let top = anchorBottom ? y - lines.length * lh : y;
  ctx.lineJoin = 'round';
  for (const l of lines) {
    ctx.lineWidth = size * 0.22;
    ctx.strokeStyle = 'rgba(0,0,0,0.85)';
    ctx.strokeText(l, W / 2, top + lh / 2);
    ctx.fillStyle = '#fff';
    ctx.fillText(l, W / 2, top + lh / 2);
    top += lh;
  }
}

function draw() {
  const v = video();
  const ctx = canvas().getContext('2d');
  if (!v.videoWidth) return;
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, W, H);
  if ($('sh-fit').value === 'blur') {
    const cover = Math.max(W / v.videoWidth, H / v.videoHeight);
    ctx.filter = 'blur(28px) brightness(0.7)';
    ctx.drawImage(v, (W - v.videoWidth * cover) / 2, (H - v.videoHeight * cover) / 2, v.videoWidth * cover, v.videoHeight * cover);
    ctx.filter = 'none';
    const fit = W / v.videoWidth;
    const h = v.videoHeight * fit;
    ctx.drawImage(v, 0, (H - h) / 2, W, h);
  } else {
    const r = verticalCrop(v.videoWidth, v.videoHeight, Number($('sh-center').value));
    ctx.drawImage(v, r.x, r.y, r.w, r.h, 0, 0, W, H);
  }
  const headline = $('sh-headline').value.trim();
  if (headline) drawText(ctx, headline, H * 0.08, 58, false);
  const now = v.currentTime;
  const cue = state.cues.find((c) => now >= c.start && now < c.end);
  if (cue) drawText(ctx, cue.text, H * 0.8, 50, true);
}

// A fixed 30 fps timer drives drawing and the end check. Frame callbacks (rAF /
// requestVideoFrameCallback) pause whenever the page is not being painted, which would
// leave the recording without frames and let playback run past the end.
function startLoop() {
  clearInterval(state.loop);
  state.loop = setInterval(() => {
    draw();
    const v = video();
    if (state.playing && (v.ended || v.currentTime >= Number($('sh-start').value) + clipLength())) stopPlayback();
  }, 1000 / 30);
}

const clipLength = () => Math.min(180, Math.max(5, Number($('sh-len').value) || 45));

// ---------------- audio routing ----------------

/** Route the video's sound through Web Audio once, so it can be recorded and muted separately. */
function audioGraph() {
  if (state.audio) return state.audio;
  const ac = new AudioContext();
  const src = ac.createMediaElementSource(video());
  const dest = ac.createMediaStreamDestination();
  const speakers = ac.createGain();
  src.connect(dest);
  src.connect(speakers).connect(ac.destination);
  state.audio = { ac, dest, speakers };
  return state.audio;
}

async function seek(time) {
  const v = video();
  if (Math.abs(v.currentTime - time) < 0.05) return;
  await new Promise((resolve) => { v.addEventListener('seeked', resolve, { once: true }); v.currentTime = time; });
}

async function play() {
  const g = audioGraph();
  await g.ac.resume();
  await seek(Number($('sh-start').value));
  state.playing = true;
  startLoop();
  await video().play();
}

function stopPlayback() {
  state.playing = false;
  clearInterval(state.loop);
  video().pause();
  draw();
  state.onEnd?.();
  state.onEnd = null;
}

// ---------------- recording ----------------

// WebM first: it is the most reliable recorder output in Chrome/Edge and YouTube accepts it.
// Some H.264 encoders report support but then reject a 720×1280 frame, so MP4 comes last.
const MIMES = ['video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm', 'video/mp4;codecs=avc1.640028,mp4a.40.2', 'video/mp4'];
const supportedMimes = () => MIMES.filter((m) => window.MediaRecorder?.isTypeSupported?.(m));

async function record() {
  const options = supportedMimes();
  if (!options.length || !canvas().captureStream) return say(t('shUnsupported'));
  if (state.recording) return;
  for (const mime of options) {
    const result = await recordWith(mime);
    if (result !== 'ENCODER_FAILED') return;
  }
  say(t('shUnsupported'));
}

async function recordWith(mime) {
  state.recording = true;
  $('sh-record').disabled = true;
  $('sh-result').hidden = true;
  const g = audioGraph();
  const stream = new MediaStream([...canvas().captureStream(30).getVideoTracks(), ...g.dest.stream.getAudioTracks()]);
  const rec = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: 6_000_000 });
  const chunks = [];
  let recError = null;
  rec.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); };
  rec.onerror = (e) => { recError = e.error?.message || 'MediaRecorder error'; };
  const done = new Promise((resolve) => { rec.onstop = resolve; });
  g.speakers.gain.value = 0; // record silently
  const end = Number($('sh-start').value) + clipLength();
  const timer = setInterval(() => say(t('shRecording', { s: Math.max(0, Math.ceil(end - video().currentTime)) })), 500);
  state.onEnd = () => rec.state !== 'inactive' && rec.stop();
  await seek(Number($('sh-start').value));
  draw();
  rec.start(1000);
  try {
    await play();
  } catch (err) {
    recError = err.message;
    stopPlayback();
  }
  await done;
  // The recorder may stop on its own (encoder error) while the video keeps playing.
  if (state.playing) stopPlayback();
  state.onEnd = null;
  clearInterval(timer);
  g.speakers.gain.value = 1;
  const type = mime.startsWith('video/mp4') ? 'mp4' : 'webm';
  const blob = new Blob(chunks, { type: mime.split(';')[0] });
  if (recError || !blob.size) {
    state.recording = false;
    $('sh-record').disabled = false;
    console.warn(`Recording as ${mime} failed:`, recError || 'empty file');
    return 'ENCODER_FAILED';
  }
  const a = $('sh-download');
  if (a.href) URL.revokeObjectURL(a.href);
  a.href = URL.createObjectURL(blob);
  a.download = `${(state.file?.name || 'video').replace(/\.[^.]+$/, '')}-short.${type}`;
  $('sh-result').hidden = false;
  say(t('shDone', { type: type.toUpperCase() }));
  state.recording = false;
  $('sh-record').disabled = false;
}

const say = (msg) => { $('sh-msg').textContent = msg; };

// ---------------- highlights ----------------

async function analyze() {
  if (!state.file) return;
  $('sh-analyze').disabled = true;
  $('sh-analyze-msg').textContent = t('shAnalyzing');
  try {
    const ac = new AudioContext();
    const buf = await ac.decodeAudioData(await state.file.arrayBuffer());
    ac.close();
    const mono = new Float32Array(buf.length);
    for (let ch = 0; ch < buf.numberOfChannels; ch++) {
      const data = buf.getChannelData(ch);
      for (let i = 0; i < data.length; i++) mono[i] += data[i] / buf.numberOfChannels;
    }
    const segments = pickSegments(loudnessPerSecond(mono, buf.sampleRate), { length: clipLength(), count: 5 });
    const mmss = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
    $('sh-suggest').replaceChildren(
      el('p', { class: 'small strong' }, t('shSuggest')),
      el('div', { class: 'row wrap' }, segments.map((s, i) =>
        el('button', { type: 'button', class: 'secondary', onclick: () => { $('sh-start').value = String(s.start); seek(s.start).then(draw); } },
          `${i + 1}. ${mmss(s.start)}–${mmss(s.end)}`))),
      el('p', { class: 'muted small' }, t('shSuggestNote')));
    $('sh-analyze-msg').textContent = '';
  } catch (err) {
    console.error(err);
    $('sh-analyze-msg').textContent = String(err.message || err);
  }
  $('sh-analyze').disabled = false;
}

// ---------------- wiring ----------------

function setCues(cues) {
  state.cues = cues;
  $('sh-subs-msg').textContent = cues.length ? t('shSubsLoaded', { n: cues.length }) : '';
  draw();
}

export function initShorts() {
  // The drawing code works in W×H; make sure the canvas really is that size.
  canvas().width = W;
  canvas().height = H;
  const drop = $('sh-drop');
  const onFile = async (f) => {
    state.file = f;
    const v = video();
    if (v.src) URL.revokeObjectURL(v.src);
    v.src = URL.createObjectURL(f);
    await new Promise((r) => v.addEventListener('loadeddata', r, { once: true }));
    $('sh-work').hidden = false;
    $('sh-suggest').replaceChildren();
    $('sh-start').max = String(Math.max(0, v.duration - 5));
    draw();
  };
  $('sh-file').addEventListener('change', (e) => { if (e.target.files[0]) onFile(e.target.files[0]); e.target.value = ''; });
  drop.addEventListener('dragover', (e) => { e.preventDefault(); drop.classList.add('over'); });
  drop.addEventListener('dragleave', () => drop.classList.remove('over'));
  drop.addEventListener('drop', (e) => { e.preventDefault(); drop.classList.remove('over'); if (e.dataTransfer.files[0]) onFile(e.dataTransfer.files[0]); });

  $('sh-start').addEventListener('change', () => seek(Number($('sh-start').value)).then(draw));
  for (const id of ['sh-center', 'sh-fit', 'sh-headline']) $(id).addEventListener('input', draw);
  $('sh-subs').addEventListener('change', async (e) => { const f = e.target.files[0]; if (f) setCues(parseSubtitles(await f.text())); e.target.value = ''; });
  $('sh-subs-tab').addEventListener('click', () => setCues(shared.cues));
  $('sh-preview').addEventListener('click', () => (state.playing ? stopPlayback() : play()));
  $('sh-record').addEventListener('click', record);
  $('sh-analyze').addEventListener('click', analyze);
}

export const renderShorts = () => draw();
