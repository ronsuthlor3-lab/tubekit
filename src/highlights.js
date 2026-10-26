// Picking candidate Shorts segments from a long video's audio.
// Loud, lively stretches (laughs, reactions, emphasis) are a reasonable first guess for
// highlights. This is a heuristic: the creator always chooses the final cut.

/**
 * Loudness per second (RMS) from mono PCM samples.
 * @param {Float32Array} samples
 * @param {number} sampleRate
 */
export function loudnessPerSecond(samples, sampleRate) {
  const n = Math.floor(samples.length / sampleRate);
  const out = new Float32Array(n);
  for (let s = 0; s < n; s++) {
    let sum = 0;
    const from = s * sampleRate;
    for (let i = from; i < from + sampleRate; i++) sum += samples[i] * samples[i];
    out[s] = Math.sqrt(sum / sampleRate);
  }
  return out;
}

/**
 * Best non-overlapping windows of `length` seconds, scored by mean loudness plus variation
 * (speech with emphasis scores higher than steady music or silence).
 * @returns {{start: number, end: number, score: number}[]} best first
 */
export function pickSegments(loudness, { length = 45, count = 5 } = {}) {
  const n = loudness.length;
  if (n < length) return n ? [{ start: 0, end: n, score: 1 }] : [];
  const max = Math.max(...loudness) || 1;
  const norm = Array.from(loudness, (v) => v / max);
  const scores = [];
  for (let s = 0; s + length <= n; s++) {
    let mean = 0;
    for (let i = s; i < s + length; i++) mean += norm[i];
    mean /= length;
    let variation = 0;
    for (let i = s + 1; i < s + length; i++) variation += Math.abs(norm[i] - norm[i - 1]);
    variation /= length - 1;
    scores.push({ start: s, end: s + length, score: mean + variation * 1.5 });
  }
  scores.sort((a, b) => b.score - a.score);
  const picked = [];
  for (const c of scores) {
    if (picked.length >= count) break;
    if (picked.every((p) => c.end <= p.start || c.start >= p.end)) picked.push(c);
  }
  const best = picked[0]?.score || 1;
  return picked.map((p) => ({ ...p, score: p.score / best }));
}

/** Source rectangle for a 9:16 crop of a w×h frame, centred at `centerX` (0..1). */
export function verticalCrop(w, h, centerX = 0.5) {
  const cw = Math.min(w, Math.round((h * 9) / 16));
  const x = Math.round(Math.min(w - cw, Math.max(0, centerX * w - cw / 2)));
  return { x, y: 0, w: cw, h };
}
