// Finding comments that still need a reply, through the public YouTube Data API v3.
// Pure helpers (no fetch), tested under `node --test`. The app does the fetching with the
// user's own API key, which never leaves their browser except in requests to googleapis.com.

const API = 'https://www.googleapis.com/youtube/v3/commentThreads';

/** Extract an 11-character video id from a URL or a bare id. */
export function videoId(input) {
  const s = String(input ?? '').trim();
  if (/^[A-Za-z0-9_-]{11}$/.test(s)) return s;
  const m = /(?:v=|youtu\.be\/|shorts\/|live\/|embed\/)([A-Za-z0-9_-]{11})/.exec(s);
  return m ? m[1] : null;
}

export function threadsUrl({ videoId: vid, key, pageToken, maxResults = 100 }) {
  const p = new URLSearchParams({ part: 'snippet,replies', videoId: vid, maxResults: String(maxResults), order: 'time', textFormat: 'plainText', key });
  if (pageToken) p.set('pageToken', pageToken);
  return `${API}?${p}`;
}

const QUESTION = /[?？]|ไหม|มั้ย|มั๊ย|ไม๊|ยังไง|อย่างไร|อะไร|ที่ไหน|เมื่อไหร่|เมื่อไร|กี่|หรือเปล่า|รึเปล่า|ป่ะ|ปะคะ|ปะครับ|how |what |where |when |why |which |can you|could you|is it|do you/i;

export const isQuestion = (text) => QUESTION.test(String(text));

/**
 * Reduce API items to the threads the channel has not answered.
 * A thread counts as answered when any reply is by the channel that owns the video.
 * @param {object[]} items  commentThreads.list items
 * @returns {{id, videoId, author, text, likes, publishedAt, replies, question, url}[]}
 */
export function unanswered(items) {
  const out = [];
  for (const item of items ?? []) {
    const sn = item?.snippet;
    const top = sn?.topLevelComment?.snippet;
    if (!sn || !top) continue;
    const owner = sn.channelId;
    if (top.authorChannelId?.value && top.authorChannelId.value === owner) continue; // the creator's own comment
    const replies = item.replies?.comments ?? [];
    const answered = replies.some((r) => r?.snippet?.authorChannelId?.value === owner);
    if (answered) continue;
    // The API returns at most 5 replies inline; if there are more we cannot be sure, so keep it.
    out.push({
      id: item.id,
      videoId: sn.videoId,
      author: top.authorDisplayName ?? '',
      text: top.textDisplay ?? top.textOriginal ?? '',
      likes: top.likeCount ?? 0,
      publishedAt: top.publishedAt ?? '',
      replies: sn.totalReplyCount ?? 0,
      question: isQuestion(top.textDisplay ?? ''),
      url: `https://www.youtube.com/watch?v=${sn.videoId}&lc=${item.id}`,
    });
  }
  return out;
}

/** Questions first, then most liked, then newest. */
export function prioritise(list) {
  return [...list].sort((a, b) => Number(b.question) - Number(a.question) || b.likes - a.likes || String(b.publishedAt).localeCompare(String(a.publishedAt)));
}

/** Fill a reply template: {name} -> commenter name. */
export function fillTemplate(template, comment) {
  return String(template).replace(/\{name\}/g, comment.author.replace(/^@/, ''));
}
