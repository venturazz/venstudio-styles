/* voxel-build — the look, as a page a worker can capture.
 *
 * Locked by this file: real block textures from the kit, the clipping-plane sweep that makes a structure appear block by
 * block from the ground up, the three camera moves, the pixel typeface, the lower-third caption plate and the pay-off word.
 * Left open to the request: how many shots, their lengths, the words on screen, the motion per shot.
 *
 * Everything here is a pure function of the frame number. No clock, no animation loop, no random: ask for frame 91 twice
 * and the same pixels come back, which is why this chain is determinism grade A and can be diffed frame by frame.
 */

import * as THREE from "./assets/vendor/three.module.js";
import "./assets/mcrig.js";
import "./assets/mcvoxel.js";
import { font as pixelFont, textures as embedded } from "./assets/blob.js";

// Fixed rotation, simplest first: a short that starts on a well and ends on a library reads as a village growing. The
// structures come from the kit; the order is the style's business, not the writer's.
const ROTATION = ["well", "farm", "medium_house", "blacksmith", "church", "tavern", "large_house", "library"];

// A writer asks for "zoom in"; this is what a zoom is in a voxel village. Unknown motions fall back to the push-in.
const MOTIONS = {
  "zoom-in": "push-in",
  "push-in": "push-in",
  "pan-left": "orbit",
  "pan-right": "orbit",
  orbit: "orbit",
  "zoom-out": "crane",
  crane: "crane",
  static: "push-in",
};

const WORD_FROM = 0.68; // where the pay-off word lands inside a shot
const CAPTION_SAFE = 0.08; // of the frame height, per the pack's contract

let W = 1080;
let H = 1920;
let FPS = 30;
let shots = [];
let captions = [];
let totalFrames = 0;
let renderer = null;
let degraded = false;
let vox = null;
let scenes = [];
let active = -1;

/**
 * The pack ships no binaries: every texture and the typeface live in assets/blob.js as data URLs. Both the kit's builder and
 * its rig go through THREE.TextureLoader, so one override on that prototype is enough — the call sites keep using the paths
 * the block map names.
 */
const originalLoad = THREE.TextureLoader.prototype.load;
THREE.TextureLoader.prototype.load = function load(url, onLoad, onProgress, onError) {
  const key = String(url).includes("/vendor/") ? String(url).split("/vendor/").pop() : String(url);
  const source = embedded[key] ?? embedded[key.replace(/^pp\//, "")] ?? url;
  return originalLoad.call(this, source, onLoad, onProgress, onError);
};

const ease = (x) => (x < 0.5 ? 2 * x * x : 1 - Math.pow(-2 * x + 2, 2) / 2);
const clamp01 = (x) => Math.max(0, Math.min(1, x));

function el(id) {
  return document.getElementById(id);
}

/** The caption that is on screen at this second, or null. */
function captionAt(t) {
  for (const c of captions) if (t >= c.start - 1e-6 && t <= c.end + 1e-6) return c.text;
  return null;
}

/** The pay-off word: the last word of the shot's own caption, shouted. Not written here — read from the request. */
function wordFor(shot, text) {
  const source = text ?? shot.caption ?? "";
  const words = String(source).replace(/[^\p{L}\p{N}\s-]/gu, " ").trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return "";
  const last = words[words.length - 1];
  return last.length <= 14 ? last.toUpperCase() : last.slice(0, 14).toUpperCase();
}

function cameraFor(cam, rig, p) {
  const { camera, mid, top, radius } = rig;
  const e = ease(p);
  if (cam === "orbit") {
    const a = -0.9 + e * 1.1;
    camera.position.set(mid.x + Math.sin(a) * radius, top * 1.05 + 2.5, mid.z + Math.cos(a) * radius);
  } else if (cam === "crane") {
    camera.position.set(mid.x + radius * 0.75, top * 0.35 + 2 + e * top * 0.8, mid.z + radius * 0.75);
  } else {
    camera.position.set(mid.x + radius * 0.5, top * 0.75 + 2, mid.z + radius * (1.15 - 0.45 * e));
  }
  camera.lookAt(mid.x, top * 0.42, mid.z);
}

/** Build one shot's world: its structure on real grass, plus a villager for scale. */
async function buildScene(THREE_, rig, struct, cam) {
  const scene = new THREE_.Scene();
  scene.background = new THREE_.Color(0x9fc9e8);
  scene.fog = new THREE_.Fog(0x9fc9e8, 90, 220);
  const camera = new THREE_.PerspectiveCamera(48, W / H, 0.1, 600);
  scene.add(new THREE_.HemisphereLight(0xe8f2ff, 0x6a6a52, 1.25));
  const sun = new THREE_.DirectionalLight(0xfff4dc, 1.05);
  sun.position.set(18, 26, 12);
  scene.add(sun);

  const GROUND = 34;
  const groundData = { size: [GROUND, 1, GROUND], nodes: [] };
  for (let x = 0; x < GROUND; x++)
    for (let z = 0; z < GROUND; z++) groundData.nodes.push([x, -1, z, "mcl_core:dirt_with_grass", 0]);
  const groundUrl = URL.createObjectURL(new Blob([JSON.stringify(groundData)], { type: "application/json" }));
  const ground = await vox.build(groundUrl, { origin: [-GROUND / 2, 0, -GROUND / 2], name: "ground" });
  scene.add(ground);

  const body = await vox.build(`assets/vendor/struct/${struct}.json`, { origin: [0, 0, 0], name: struct });
  // The kit caches materials and shares them between meshes; a clipping plane set on the scene object would be ignored by
  // half the blocks. Attach it to every material the build produced, or the sweep stops halfway.
  for (const mesh of [body, ground]) {
    mesh.traverse((o) => {
      const m = o.material;
      for (const mat of Array.isArray(m) ? m : m ? [m] : []) {
        mat.clippingPlanes = [vox.clip];
        mat.clipShadows = false;
        mat.needsUpdate = true;
      }
    });
  }
  scene.add(body);

  body.updateMatrixWorld(true);
  const box = new THREE_.Box3().setFromObject(body);
  const top = Math.max(2, box.max.y);
  const mid = new THREE_.Vector3((box.min.x + box.max.x) / 2, 0, (box.min.z + box.max.z) / 2);
  const radius = Math.max(box.max.x - box.min.x, box.max.z - box.min.z) * 0.9 + 8;

  try {
    const villager = await rig.load("assets/vendor/villager.json", "assets/vendor/mobs_mc_villager.png", { height: 1.95 });
    villager.group.position.set(mid.x + 3.4, 0, mid.z + 2.6);
    villager.group.rotation.y = -1.1;
    scene.add(villager.group);
  } catch {
    // A villager that will not load is not a reason to lose the shot; the village just stands empty.
  }

  return { scene, camera, mid, top, radius, cam, struct, sweep: top + 1.5 };
}

/** Draw exactly one second of the timeline. The only entry point that touches pixels. */
function draw(t) {
  const global = Math.max(0, Math.min((totalFrames - 1) / FPS, t));
  let index = shots.length - 1;
  let start = 0;
  for (let i = 0; i < shots.length; i++) {
    if (global < shots[i].start + shots[i].seconds - 1e-6) {
      index = i;
      start = shots[i].start;
      break;
    }
  }
  const shot = shots[index];
  const rig = scenes[index];
  if (degraded || !rig) {
    // No WebGL (a stand-in DOM in a test, or a browser without the context): the page still answers the job's shape and
    // writes the caption, it just draws nothing. The contract test runs this way; the pixels come from real Chrome.
    const text = captionAt(global) ?? shot.caption ?? "";
    const capOnly = el("caption");
    const wordOnly = el("word");
    if (capOnly) capOnly.textContent = text;
    if (wordOnly) wordOnly.textContent = wordFor(shot, text);
    return;
  }
  const local = global - start;
  const p = shot.seconds > 0 ? clamp01(local / shot.seconds) : 1;

  // The build: the structure is whole from the first frame, a plane near the ground hides the rest. Cutting is cheaper
  // than animating blocks and cannot drift between frames.
  vox.clip.constant = -0.2 + p * rig.sweep;
  cameraFor(rig.cam, rig, p);

  if (active !== index) {
    active = index;
    // One canvas, many worlds: swap the scene under the same renderer, so the camera and the lighting stay identical.
    renderer.info.reset();
  }
  renderer.render(rig.scene, rig.camera);

  // The overlay is written after the draw so the caption and the word are in place when the screenshot is taken.
  const text = captionAt(global) ?? shot.caption ?? "";
  const capEl = el("caption");
  const wordEl = el("word");
  if (!capEl || !wordEl) return;
  const capIn = clamp01((p - 0.04) / 0.1);
  capEl.textContent = text;
  capEl.style.opacity = String(text ? capIn : 0);
  capEl.style.transform = `translateY(${(1 - capIn) * 12}px)`;

  const word = wordFor(shot, text);
  const w = clamp01((p - WORD_FROM) / 0.16);
  wordEl.textContent = word;
  if (word && w > 0) {
    const pop = w < 0.62 ? 1.5 - 0.55 * (w / 0.62) : 1 + 0.05 * Math.sin(((w - 0.62) / 0.38) * Math.PI);
    wordEl.style.opacity = String(Math.min(1, w * 3));
    wordEl.style.transform = `scale(${pop})`;
  } else {
    wordEl.style.opacity = "0";
  }
}

/**
 * Two names for one page. A pack is driven by the worker with `window.VENSTUDIO = { init(props), renderFrame(f) }`; a page
 * Hermes writes for a single job is driven with `window.__venstudio = { init(props), frame(f, fps) }`. This page is a pack,
 * so the first is the contract and the second is an alias anyone can call by hand.
 */
const page = {
  async init(props) {
    W = Number(props?.width) || 1080;
    H = Number(props?.height) || 1920;
    FPS = Number(props?.fps) || 30;

    const list = Array.isArray(props?.shots) && props.shots.length > 0 ? props.shots : [{ seconds: 3, motion: "zoom-in" }];
    let at = 0;
    shots = list.map((s, i) => {
      const seconds = Math.max(0.5, Number(s.seconds) || 3);
      const shot = {
        start: at,
        seconds,
        motion: s.motion ?? "zoom-in",
        caption: s.caption ?? null,
        struct: ROTATION[i % ROTATION.length],
      };
      at += seconds;
      return shot;
    });
    totalFrames = Math.max(1, Math.round((Number(props?.durationSec) || at) * FPS));

    const raw = Array.isArray(props?.captions) ? props.captions : [];
    captions = raw
      .map((c) => ({ start: Number(c.start) || 0, end: Number(c.end) || 0, text: String(c.text ?? "").trim() }))
      .filter((c) => c.text && c.end > c.start)
      .sort((a, b) => a.start - b.start);

    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
    } catch (err) {
      degraded = true;
      renderer = null;
      console.log(`no WebGL here: ${err instanceof Error ? err.message : String(err)}`);
    }
    if (!renderer) {
      // Still answer the job's shape — and only that: the worker checks these four numbers and nothing else. Nothing is
      // drawn and nothing is claimed about the picture.
      draw(0);
      // The flag the worker reads (0.19.1): a still or a video of text on a blank plate is not the look.
      return { totalFrames, fps: FPS, width: W, height: H, degraded: true };
    }
    renderer.setPixelRatio(1);
    renderer.setSize(W / 2, H / 2, false);
    renderer.domElement.style.width = `${W}px`;
    renderer.domElement.style.height = `${H}px`;
    renderer.localClippingEnabled = true;
    const holder = el("stage");
    if (holder?.replaceChildren) holder.replaceChildren(renderer.domElement);
    else holder?.appendChild?.(renderer.domElement);

    const rig = new window.MCRig(THREE);
    vox = new window.MCVoxel(THREE, rig);
    vox.clip = new THREE.Plane(new THREE.Vector3(0, -1, 0), 0);
    await vox.loadMap("assets/vendor/blockmap.json");

    const made = [];
    for (const shot of shots) {
      const cam = MOTIONS[shot.motion] ?? "push-in";
      made.push(await buildScene(THREE, rig, shot.struct, cam));
    }
    scenes = made;
    active = -1;

    // The font must be in place before the first frame: a screenshot taken mid-load renders the caption in the fallback
    // face and every frame after it differs.
    if (typeof FontFace !== "undefined" && typeof pixelFont === "string") {
      const face = new FontFace("Pixel", `url(${pixelFont})`);
      await face.load();
      document.fonts.add(face);
    }
    if (document.fonts?.ready) await document.fonts.ready;

    draw(0);
    return { totalFrames, fps: FPS, width: W, height: H };
  },

  renderFrame(f) {
    draw(Number(f) / FPS);
    return { frame: Number(f), t: Number(f) / FPS };
  },
};

window.VENSTUDIO = page;
window.__venstudio = { init: page.init, frame: (f) => page.renderFrame(f) };