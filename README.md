# TubeKit — free tools for YouTube creators

**▶ Use it now: https://ronsuthlor3-lab.github.io/tubekit/**

[ภาษาไทย](README.th.md)

Helps you get more **real** viewers by improving your content and packaging — **no view bots**.
Fake views break YouTube's rules, get removed, and can get a channel limited or terminated.

Runs entirely in your browser. Videos and files are **never uploaded**. Free, no sign-up. Thai + English UI.

## Five tools

| | What it does | Needs |
|---|---|---|
| 📊 **Analytics** | Finds "hidden gems" (high retention, low impressions), videos whose thumbnail/title needs work (many impressions, low CTR), and the publish days that work for you | A CSV exported from YouTube Studio (Advanced mode) |
| 🖼️ **Thumbnail + title** | Previews in the home feed, mobile and the small suggested sidebar, light/dark, next to competitors; checks size, ratio, busyness, contrast and title length | Your thumbnail images |
| ✂️ **Shorts** | Suggests highlights from the audio, crops to 9:16 (or full frame + blurred background), adds a headline and burned-in captions, outputs 720×1280 | A video file, optionally a caption file |
| 📝 **Captions + chapters** | Cleans YouTube's auto-captions (word-timing tags, rolling repeats), lets you edit, merge short lines, export SRT/VTT, build a transcript, suggest chapters and validate them against YouTube's rules | A .srt/.vtt/.sbv file from Studio |
| 💬 **Comments** | Lists comments your channel has not answered, questions first, with reply templates and a link to reply on YouTube | Your own YouTube Data API key (free) |

## Limits

- **Analytics:** Studio column names vary by language and chosen metrics; they are auto-detected (English/Thai) and can be corrected by hand. Per-second retention drop-off is not part of the export.
- **Shorts:** recorded in real time in the browser (a 60 s Short takes 60 s); keep the tab open. Output is usually WebM, which YouTube accepts. Best in Chrome/Edge on a computer. Highlight suggestions use audio only — you make the final pick.
- **Captions:** in-browser AI transcription of Thai is not accurate enough yet, so the tool starts from YouTube's own auto-captions.
- **Comments:** you post replies on YouTube yourself; nothing is posted for you. The key stays in your browser and is only sent to googleapis.com. Threads with more than 5 replies may be counted as unanswered.

## Development

Static site, vanilla JS modules, no build step. Pure logic lives in `src/analytics.js`, `src/subtitles.js`,
`src/comments.js` and `src/highlights.js`, tested with `npm test` (Node 20+).

## License

MIT. Not affiliated with YouTube or Google. Part of a set of [free tools](https://github.com/ronsuthlor3-lab).
