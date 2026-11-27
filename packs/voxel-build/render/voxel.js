/* voxel-build — the look, as a page a worker can capture.
 *
 * Locked by this file: real block textures from the kit, the clipping-plane sweep that makes a structure appear block by
 * block from the ground up, the three camera moves, the pixel typeface, the lower-third caption plate and the pay-off word.
 * Left open to the request: how many shots, their lengths, the words on screen, the motion per shot, and — since the
 * pack declares a vocabulary (style.json contract.story) — which structure each shot shows, what happens to it
 * (build, damage, idle) and whether the camera holds the building or the villager beside it.
 *
 * Everything here is a pure function of the frame number. No clock, no animation loop, no random: ask for frame 91 twice
 * and the same pixels come back, which is why this chain is determinism grade A and can be diffed frame by frame.
 */

import * as THREE from "./assets/vendor/three.module.js";
import "./assets/mcrig.js";
import "./assets/mcvoxel.js";
import { font as pixelFont, textures as embedded } from "./assets/blob.js";

// The kit: the structures this look can build. The writer's story picks one per shot (props.shots[i].intent.structure);
// this list is the boundary the portal validates against and the fallback when a shot names nothing.
import { compileParts } from "./world.js";

const KIT = ["well", "farm", "medium_house", "blacksmith", "church", "tavern", "large_house", "library"];
// Older runs carry no intent at all: they keep the fixed rotation, so a video recorded before the vocabulary existed
// still renders exactly as it did.
const ROTATION = KIT;

/** What a shot can do to its structure: raised from the ground, taken apart from the top, or just standing there. */
const ACTIONS = { build: "build", damage: "damage", idle: "idle" };
/** What the camera holds: the building, or the villager who lives beside it. */
const FOCUS = { structure: "structure", villager: "villager" };

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
// What the page had to decide alone this run (unknown material, part outside the limit, fallback to the rotation). The
// worker's job result carries it, so a run that drifted says so instead of looking fine.
let worldNotes = [];
/** The pack's own block names, read from the map the kit draws with (null until the first composed shot asks). */
let knownBlocks = null;
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
  const { camera, center, dist } = rig;
  const e = ease(p);
  const { x, z } = center;
  const h = center.y;
  // A shot that holds the villager looks at the villager: closer, lower, and off the building's axis.
  if (rig.focus === "villager" && rig.villager) {
    const v = rig.villager;
    // A villager is 1.95 blocks tall: far enough to keep the building in shot, close enough that the villager reads.
    const matter = Math.max(4.5, Math.min(9, dist * 0.18));
    camera.position.set(v.x + matter * (0.55 + 0.1 * e), v.y + 3.6, v.z + matter * (0.95 - 0.2 * e));
    camera.lookAt(v.x, v.y + 1.5, v.z);
    return;
  }
  if (cam === "orbit") {
    const a = -0.9 + e * 1.1;
    camera.position.set(x + Math.sin(a) * dist, h + dist * 0.28, z + Math.cos(a) * dist);
  } else if (cam === "crane") {
    // From below the eaves up to eye level, always far enough that nothing leaves the frame.
    camera.position.set(x + dist * 0.6, h * 0.45 + dist * (0.08 + 0.22 * e), z + dist * 0.72);
  } else {
    // A real push-in: the building is whole at the cut, and the move ends closer than it started.
    const d = dist * (1 - 0.34 * e);
    camera.position.set(x + d * 0.34, h + d * 0.2, z + d * 0.93);
  }
  camera.lookAt(x, h, z);
}

/** Build one shot's world: its structure on real grass, plus a villager for scale. */
async function buildScene(THREE_, rig, struct, parts, cam, action, focus) {
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

  // A named kit structure, or the shot's own parts compiled into the same node format the kit reads. Both go through
  // the same builder, so the sweep, the materials and the lighting are the look's, not the writer's.
  let body;
  if (Array.isArray(parts) && parts.length > 0) {
    // The installed map decides what a material name means; read it once so a wrong name is a note, not a quiet swap.
    if (knownBlocks === null) {
      try {
        const map = await (await fetch("assets/vendor/blockmap.json")).json();
        knownBlocks = new Set(Object.keys(map));
      } catch {
        knownBlocks = new Set();
      }
    }
    const built = compileParts(parts, { known: knownBlocks });
    for (const n of built.notes) worldNotes.push(`shot: ${n}`);
    const url = URL.createObjectURL(new Blob([JSON.stringify({ size: built.size, nodes: built.nodes })], { type: "application/json" }));
    body = await vox.build(url, { origin: [0, 0, 0], name: "parts" });
  } else {
    body = await vox.build(`assets/vendor/struct/${struct}.json`, { origin: [0, 0, 0], name: struct });
  }
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
  // Framing: the whole structure has to fit, tower and all. Distance comes from the bounding sphere and the narrower of
  // the two fields of view — a portrait frame has a much narrower one horizontally, which is what cropped the tall kit
  // buildings into unnamed wall fragments.
  const size = new THREE_.Vector3().subVectors(box.max, box.min);
  const center = new THREE_.Vector3((box.min.x + box.max.x) / 2, (box.min.y + box.max.y) / 2, (box.min.z + box.max.z) / 2);
  // Read the camera defensively: a stand-in DOM (the pack's own test) has a camera without fov, and a NaN distance here
  // would silently blank the frame instead of failing loudly.
  const fov = Number(camera.fov) > 1 ? Number(camera.fov) : 48;
  const vFov = (fov * Math.PI) / 180;
  const aspect = Number(W) > 0 && Number(H) > 0 ? W / H : 9 / 16;
  const hFov = 2 * Math.atan(Math.tan(vFov / 2) * aspect);
  const sphere = 0.5 * Math.hypot(size.x, size.y, size.z);
  const fit = (sphere / Math.sin(Math.min(vFov, hFov) / 2)) * 1.15;
  const dist = Number.isFinite(fit) && fit > 0 ? fit : Math.max(size.x, size.y, size.z) * 2.2;

  let villagerAt = null;
  try {
    const villager = await rig.load("assets/vendor/villager.json", "assets/vendor/mobs_mc_villager.png", { height: 1.95 });
    // Outside the footprint: a villager set 3.4 blocks from the centre of a 13-block church stands inside its wall.
    villager.group.position.set(box.max.x + 2.6, 0, box.max.z + 1.8);
    villager.group.rotation.y = -1.1;
    scene.add(villager.group);
    villagerAt = { x: villager.group.position.x, y: villager.group.position.y, z: villager.group.position.z };
  } catch {
    // A villager that will not load is not a reason to lose the shot; the village just stands empty.
  }

  return { scene, camera, mid, top, center, dist, radius: dist, cam, struct, sweep: top + 1.5, action, focus, villager: villagerAt };
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
  // than animating blocks and cannot drift between frames. What the plane does is the shot's own intent: a structure
  // raised from the ground, taken apart from the top, or standing still.
  const reveal = rig.action === "damage" ? 1 - 0.85 * p : rig.action === "idle" ? 1 : p;
  vox.clip.constant = -0.2 + reveal * rig.sweep;
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
    worldNotes = [];
    W = Number(props?.width) || 1080;
    H = Number(props?.height) || 1920;
    FPS = Number(props?.fps) || 30;

    const list = Array.isArray(props?.shots) && props.shots.length > 0 ? props.shots : [{ seconds: 3, motion: "zoom-in" }];
    let at = 0;
    shots = list.map((s, i) => {
      const seconds = Math.max(0.5, Number(s.seconds) || 3);
      // The story is the request's: the scene spec names a structure, an action and what the camera holds. Anything the
      // kit does not know falls back to the fixed rotation, so an old run or a stale payload still renders.
      const intent = s.intent && typeof s.intent === "object" ? s.intent : {};
      const named = typeof intent.structure === "string" ? intent.structure : "";
      // Two ways to say what to build, and the story is free to pick either: a named structure from the kit (cheap, and
      // what a menu would give), or parts composed from the primitives (anything the blocks can make).
      const parts = Array.isArray(intent.parts) && intent.parts.length > 0 ? intent.parts : null;
      const shot = {
        start: at,
        seconds,
        motion: s.motion ?? "zoom-in",
        caption: s.caption ?? null,
        struct: parts ? null : KIT.includes(named) ? named : ROTATION[i % ROTATION.length],
        parts,
        action: ACTIONS[intent.action] ?? "build",
        focus: FOCUS[intent.focus] ?? "structure",
      };
      if (parts && !KIT.includes(named)) worldNotes.push(`shot ${i + 1}: built from parts, not from the kit`);
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
      return { totalFrames, fps: FPS, width: W, height: H, degraded: true, ...(worldNotes.length > 0 ? { world: worldNotes.slice(0, 24) } : {}) };
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
      made.push(await buildScene(THREE, rig, shot.struct, shot.parts, cam, shot.action, shot.focus));
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
    // `world` is what the page decided alone (see worldNotes): the worker stores it with the job, so a run that fell
    // back or swapped a material can be seen without opening the video.
    return { totalFrames, fps: FPS, width: W, height: H, ...(worldNotes.length > 0 ? { world: worldNotes.slice(0, 24) } : {}) };
  },

  renderFrame(f) {
    draw(Number(f) / FPS);
    return { frame: Number(f), t: Number(f) / FPS };
  },
};

window.VENSTUDIO = page;
window.__venstudio = { init: page.init, frame: (f) => page.renderFrame(f) };