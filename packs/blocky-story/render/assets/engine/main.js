import { Studio } from './studio.js';
import { textTexture } from './core.js';
window.__textTexture = textTexture;
const q = new URLSearchParams(location.search);
const studio = new Studio(+q.get('w') || 360, +q.get('h') || 640);
window.K = {
  async load() { try { return await studio.load(); } catch (e) { console.error('[K] ' + (e.stack || e)); throw e; } },
  frame: (t, o) => studio.frame(t, o),
  qa: (o) => studio.qa(o || {}),
  cues: () => studio.cues,
  captions: () => studio.captions.map(c => ({ start: c.start, end: c.end, text: c.words.map(w => w.text).join(' ') })),
  shots: () => studio.shots.map(s => ({ id: s.id, label: s.label, start: s.start, end: s.end })),
};
window.__studio = studio;
