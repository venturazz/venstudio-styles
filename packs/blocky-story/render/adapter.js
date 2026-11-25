/* blocky-story — the Roblox kit's look, driven by a request instead of by a hand-written shots.js.
 *
 * The kit (Roblox Claude kit: three.js engine, eight code-built sets, blocky figures with drawn faces) loads a "video
 * folder": script.txt, audio/words.json, meta.json and shots.js. A pack has none of that, so this page answers those three
 * files from the request and supplies the choreography through the studio's shots hook. The kit's own engine, sets,
 * characters and caption drawing are vendored unchanged — the look is theirs, the request is ours.
 *
 * Contract: window.VENSTUDIO = { init(props), renderFrame(f) } and nothing else.
 */

import * as THREE from "./assets/vendor/three.module.js";
import { Studio } from "./assets/engine/studio.js";
import { buildShots } from "./cast.js";
/** The face atlases travel as data URLs (a pack holds text only), registered by the classic scripts before this bundle
 * runs; one override feeds the kit's texture loader. */
const ATLASES = (typeof window !== "undefined" && window.__BLOCKY_ATLASES) || {};
const originalLoad = THREE.TextureLoader.prototype.load;
THREE.TextureLoader.prototype.load = function load(url, onLoad, onProgress, onError) {
  const key = String(url).replace(/^\/+/, "").split("?")[0];
  const source = ATLASES[key] ?? ATLASES[key.replace(/^assets\//, "")] ?? url;
  return originalLoad.call(this, source, onLoad, onProgress, onError);
};

/** A Response for the three files the studio fetches by absolute path. */
const file = (body, type) => new Response(body, { status: 200, headers: { "content-type": type } });

let plan = { shots: [], words: [], duration: 5 };
let totalFrames = 1;
let fps = 30;
let studio = null;
let degraded = false;

/**
 * Split each caption into words and give them times inside the caption's own window, weighted by length. The studio animates
 * on those times and draws the caption band from them, so caption timing and picture timing cannot disagree.
 */
function wordsFrom(captions, duration) {
  const words = [];
  const perShot = [];
  for (const c of captions) {
    const text = String(c.text ?? "").trim();
    const list = text ? text.split(/\s+/) : [];
    const span = Math.max(0.2, Number(c.end) - Number(c.start));
    const weights = list.map((w) => Math.max(2, w.replace(/[^\p{L}\p{N}]/gu, "").length));
    const sum = weights.reduce((a, b) => a + b, 0) || 1;
    let at = Number(c.start) || 0;
    perShot.push(words.length);
    list.forEach((w, i) => {
      const d = (span * weights[i]) / sum;
      words.push({ w, start: at, end: at + d });
      at += d;
    });
  }
  // The studio ends the film at the last word plus a tail; keep that inside the requested duration.
  const last = words.length > 0 ? words[words.length - 1].end : 0;
  plan.tail = Math.max(0, Math.min(2, duration - last));
  return { words, perShot };
}

const page = {
  async init(props) {
    fps = Number(props?.fps) || 30;
    totalFrames = Math.max(1, Math.round(Number(props?.totalFrames) || (Number(props?.durationSec) || 6) * fps));
    const duration = totalFrames / fps;
    const W = Number(props?.width) || 1080;
    const H = Number(props?.height) || 1920;

    const captions = Array.isArray(props?.captions) ? props.captions.filter((c) => String(c.text ?? "").trim()) : [];
    const { words, perShot } = wordsFrom(captions, duration);
    if (words.length === 0) words.push({ w: "…", start: 0, end: Math.max(0.5, duration - 0.5) });

    // One shot per requested shot, each starting on its caption's first word.
    const requested = Array.isArray(props?.shots) && props.shots.length > 0 ? props.shots : [{ seconds: duration, motion: "zoom-in" }];
    plan.words = words;
    plan.shots = requested.map((s, i) => ({
      seconds: Number(s.seconds) || duration / requested.length,
      motion: s.motion ?? "zoom-in",
      word: perShot[Math.min(i, perShot.length - 1)] ?? 0,
    }));

    // The studio asks for its three files; answer them from the request.
    const scriptText = words.map((w) => w.w).join(" ");
    const baseFetch = typeof window.fetch === "function" ? window.fetch.bind(window) : null;
    const originalFetch = baseFetch ?? (() => Promise.reject(new Error("no fetch here")));
    window.fetch = (input, init2) => {
      const url = typeof input === "string" ? input : input?.url ?? "";
      if (url.startsWith("/video/script.txt")) return Promise.resolve(file(scriptText, "text/plain"));
      if (url.startsWith("/video/audio/words.json")) return Promise.resolve(file(JSON.stringify(words), "application/json"));
      if (url.startsWith("/video/meta.json")) return Promise.resolve(file(JSON.stringify({ tail: plan.tail ?? 0 }), "application/json"));
      return originalFetch(input, init2);
    };

    try {
      studio = new Studio(W, H);
    } catch (err) {
      // No WebGL (a stand-in DOM in a test, or a browser without the context): answer the job's shape and draw nothing.
      degraded = true;
      studio = null;
      console.log(`no WebGL here: ${err instanceof Error ? err.message : String(err)}`);
      return { totalFrames, fps, width: W, height: H };
    }
    studio.shotsHook = (K) => buildShots(K, plan);
    await studio.load();

    // The kit composites into its own 2D canvas; that is what the worker should photograph, so show it and hide the raw
    // WebGL canvas underneath.
    const gl = studio.r?.domElement;
    if (gl) gl.style.display = "none";
    studio.out.style.width = `${W}px`;
    studio.out.style.height = `${H}px`;
    studio.out.style.display = "block";
    document.body.appendChild(studio.out);

    studio.frame(0);
    return { totalFrames, fps, width: W, height: H };
  },

  renderFrame(f) {
    if (studio && !degraded) studio.frame(Number(f) / fps);
    return { frame: Number(f), t: Number(f) / fps };
  },
};

/** Debug affordance: what the page thinks the words, the captions and the shots are. Costs nothing and answers "why is the
 * caption band empty" without guessing. */
window.__BLOCKY_DEBUG = () => ({
  words: plan.words ?? null,
  captions: studio?.captions ?? null,
  shots: (studio?.shots ?? []).map((s) => ({ id: s.id, label: s.label, start: s.start, end: s.end })),
  duration: studio?.duration ?? null,
  degraded,
});

window.VENSTUDIO = page;
window.__venstudio = { init: page.init, frame: (f) => page.renderFrame(f) };