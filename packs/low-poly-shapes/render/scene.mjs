// Shared by render.mjs and probe.mjs: loads three.js from the environment and turns one frame into an SVG.
// No network, no clock, no randomness: a frame is a pure function of the props and the frame number.
import path from "node:path";
import { pathToFileURL } from "node:url";

/** three.js and its Projector, from <envDir>/node/node_modules/three (the recipe's npm step). */
export async function loadThree(envDir) {
  const root = path.join(envDir, "node", "node_modules", "three");
  const THREE = await import(pathToFileURL(path.join(root, "build", "three.module.js")).href);
  const { Projector, RenderableFace } = await import(pathToFileURL(path.join(root, "examples", "jsm", "renderers", "Projector.js")).href);
  return { THREE, Projector, RenderableFace };
}

/** Palettes per scene: background top, background bottom, then the shape's three tones. */
const PALETTES = [
  ["#0f172a", "#1e293b", "#38bdf8", "#0ea5e9", "#e0f2fe"],
  ["#1c1917", "#292524", "#fb923c", "#f97316", "#ffedd5"],
  ["#052e16", "#14532d", "#4ade80", "#22c55e", "#dcfce7"],
  ["#2e1065", "#3b0764", "#c084fc", "#a855f7", "#f3e8ff"],
];

const clamp01 = (x) => Math.min(1, Math.max(0, x));
const easeOutBack = (x) => {
  const c1 = 1.70158;
  const c3 = c1 + 1;
  return 1 + c3 * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2);
};
const easeInOut = (x) => (x < 0.5 ? 2 * x * x : 1 - Math.pow(-2 * x + 2, 2) / 2);
const hex = (c) => `#${c.getHexString()}`;
const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/"/g, "&quot;");

/** The scene of a frame: its index, its props entry and the seconds since it started. */
export function sceneAt(props, frame) {
  const t = frame / props.fps;
  const scenes = props.scenes;
  let i = scenes.findIndex((s) => t >= s.start && t < s.start + s.seconds);
  if (i < 0) i = t < scenes[0].start ? 0 : scenes.length - 1;
  return { index: i, scene: scenes[i], local: Math.max(0, t - scenes[i].start) };
}

/** Builds the three.js scene for one frame and returns it as an SVG document (string). */
export function frameSvg(lib, props, frame, { plate } = {}) {
  const { THREE, Projector, RenderableFace } = lib;
  const W = props.width;
  const H = props.height;
  const { index, scene: s, local } = sceneAt(props, frame);
  const tokens = new Set(s.tokens ?? []);
  const pal = PALETTES[index % PALETTES.length];

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(36, W / H, 0.1, 100);
  const push = tokens.has("push") ? easeInOut(clamp01(local / Math.max(0.5, s.seconds))) : 0;
  camera.position.set(0, 0.35, 7.2 - 1.0 * push);
  camera.lookAt(0, 0.35, 0);
  camera.updateMatrixWorld();

  const geometries = [() => new THREE.IcosahedronGeometry(0.8, 1), () => new THREE.OctahedronGeometry(0.85, 1), () => new THREE.DodecahedronGeometry(0.8, 0)];
  const geometry = geometries[index % geometries.length]();
  const material = new THREE.MeshLambertMaterial({ color: pal[2], flatShading: true });
  const mesh = new THREE.Mesh(geometry, material);
  const spin = tokens.has("drift") ? 0.55 : 0.22;
  mesh.rotation.set(0.35 + local * spin * 0.35, local * spin + index * 0.9, 0);
  const pop = tokens.has("pop") ? easeOutBack(clamp01(local / 0.6)) : 1;
  mesh.scale.setScalar(Math.max(0.01, pop));
  mesh.position.set(0, 0.45, 0);
  scene.add(mesh);
  scene.updateMatrixWorld();

  const light = new THREE.Vector3(-0.45, 0.8, 0.55).normalize();
  const base = new THREE.Color(pal[2]);
  const lit = new THREE.Color(pal[4]);
  const shade = new THREE.Color(pal[3]);

  const data = new Projector().projectScene(scene, camera, false, true);
  const faces = data.elements.filter((e) => e instanceof RenderableFace).sort((a, b) => b.z - a.z);
  const sx = (v) => ((v.positionScreen.x + 1) / 2) * W;
  const sy = (v) => ((1 - v.positionScreen.y) / 2) * H;
  const polys = faces.map((f) => {
    const lambert = Math.max(0, f.normalModel.dot(light));
    const c = shade.clone().lerp(base, clamp01(0.25 + lambert)).lerp(lit, Math.pow(lambert, 6) * 0.6);
    const pts = [f.v1, f.v2, f.v3].map((v) => `${sx(v).toFixed(1)},${sy(v).toFixed(1)}`).join(" ");
    return `<polygon points="${pts}" fill="${hex(c)}" stroke="${hex(c)}" stroke-width="1.2" stroke-linejoin="round"/>`;
  });

  const shadowY = H * 0.6;
  const shadowR = W * 0.26 * pop;
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">`,
    `<defs><linearGradient id="bg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${pal[0]}"/><stop offset="1" stop-color="${pal[1]}"/></linearGradient>`,
    `<radialGradient id="sh"><stop offset="0" stop-color="#000" stop-opacity="0.45"/><stop offset="1" stop-color="#000" stop-opacity="0"/></radialGradient></defs>`,
    `<rect width="${W}" height="${H}" fill="url(#bg)"/>`,
    plate ? `<image href="${esc(plate)}" x="0" y="0" width="${W}" height="${H}" preserveAspectRatio="xMidYMid slice" opacity="0.22"/>` : "",
    `<ellipse cx="${W / 2}" cy="${shadowY.toFixed(1)}" rx="${shadowR.toFixed(1)}" ry="${(shadowR * 0.18).toFixed(1)}" fill="url(#sh)"/>`,
    ...polys,
    `</svg>`,
  ].join("");
}
