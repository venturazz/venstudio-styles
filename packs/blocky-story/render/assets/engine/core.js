// Small helpers shared by every module. Units are Roblox "studs": a character is ~5.3 tall.
import * as THREE from '../vendor/three.module.js';
import { RoundedBoxGeometry } from '../vendor/RoundedBoxGeometry.js';

export { THREE };
export const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
export const lerp = (a, b, k) => a + (b - a) * k;
export const smooth = k => { k = clamp(k); return k * k * (3 - 2 * k); };
export const easeOut = k => 1 - Math.pow(1 - clamp(k), 3);
export const easeIn = k => Math.pow(clamp(k), 3);
export const easeInOut = k => { k = clamp(k); return k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2; };
export const backOut = k => { k = clamp(k); const c1 = 1.70158, c3 = c1 + 1; return 1 + c3 * Math.pow(k - 1, 3) + c1 * Math.pow(k - 1, 2); };
export const v3 = (a) => a instanceof THREE.Vector3 ? a.clone() : new THREE.Vector3(a[0], a[1] ?? 0, a[2] ?? 0);
export const lerpV = (a, b, k) => new THREE.Vector3(lerp(a.x, b.x, k), lerp(a.y, b.y, k), lerp(a.z, b.z, k));
export const deg = d => d * Math.PI / 180;

// deterministic pseudo-random (same video every render)
export function hash(n) { const s = Math.sin(n * 127.1 + 311.7) * 43758.5453; return s - Math.floor(s); }
export function noise1(t, seed = 0) {
  const i = Math.floor(t), f = t - i; const a = hash(i + seed * 57), b = hash(i + 1 + seed * 57);
  return lerp(a, b, smooth(f)) * 2 - 1;
}

const matCache = new Map();
export function mat(color, opts = {}) {
  const key = color + JSON.stringify(opts);
  if (!opts.unique && matCache.has(key)) return matCache.get(key);
  const m = new THREE.MeshStandardMaterial({ color: new THREE.Color(color), roughness: opts.rough ?? 0.55, metalness: opts.metal ?? 0.0,
    emissive: opts.emissive ? new THREE.Color(opts.emissive) : new THREE.Color(0), emissiveIntensity: opts.emissiveIntensity ?? 1,
    transparent: !!opts.opacity, opacity: opts.opacity ?? 1, map: opts.map || null });
  if (!opts.unique) matCache.set(key, m);
  return m;
}

const geoCache = new Map();
export function rbox(w, h, d, r = 0.08) {
  const key = [w, h, d, r].join(',');
  if (!geoCache.has(key)) geoCache.set(key, r > 0 ? new RoundedBoxGeometry(w, h, d, 3, Math.min(r, w / 2 - 0.001, h / 2 - 0.001, d / 2 - 0.001)) : new THREE.BoxGeometry(w, h, d));
  return geoCache.get(key);
}

// A mesh box. pos is the CENTER unless opts.base is true (then pos.y is the bottom).
export function box(parent, w, h, d, color, pos = [0, 0, 0], opts = {}) {
  const m = new THREE.Mesh(rbox(w, h, d, opts.r ?? 0.06), opts.material || mat(color, opts));
  m.position.set(pos[0], (pos[1] ?? 0) + (opts.base ? h / 2 : 0), pos[2] ?? 0);
  if (opts.rot) m.rotation.set(opts.rot[0] || 0, opts.rot[1] || 0, opts.rot[2] || 0);
  m.castShadow = opts.shadow !== false; m.receiveShadow = true;
  parent.add(m);
  return m;
}

export function cyl(parent, rTop, rBot, h, color, pos = [0, 0, 0], opts = {}) {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(rTop, rBot, h, opts.seg || 24), opts.material || mat(color, opts));
  m.position.set(pos[0], (pos[1] ?? 0) + (opts.base ? h / 2 : 0), pos[2] ?? 0);
  m.castShadow = opts.shadow !== false; m.receiveShadow = true;
  parent.add(m);
  return m;
}

// Text drawn on a canvas -> texture (signs, boards, banners). Lines split on \n.
export function textTexture(text, o = {}) {
  const W = o.w || 1024, H = o.h || 512;
  const c = document.createElement('canvas'); c.width = W; c.height = H;
  const g = c.getContext('2d');
  g.fillStyle = o.bg || '#ffffff'; g.fillRect(0, 0, W, H);
  if (o.border) { g.strokeStyle = o.border; g.lineWidth = o.borderW || 28; g.strokeRect(g.lineWidth / 2, g.lineWidth / 2, W - g.lineWidth, H - g.lineWidth); }
  const lines = String(text).split('\n');
  let size = o.size || Math.floor(H / (lines.length + 0.6));
  g.font = `${o.weight || 900} ${size}px ${o.font || 'Arial Black, Arial, sans-serif'}`;
  const maxW = Math.max(...lines.map(l => g.measureText(l).width));
  if (maxW > W * 0.88) { size = Math.floor(size * W * 0.88 / maxW); g.font = `${o.weight || 900} ${size}px ${o.font || 'Arial Black, Arial, sans-serif'}`; }
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillStyle = o.color || '#111';
  const lh = size * 1.12, y0 = H / 2 - (lines.length - 1) * lh / 2;
  lines.forEach((l, i) => {
    if (o.stroke) { g.lineWidth = size * 0.12; g.strokeStyle = o.stroke; g.strokeText(l, W / 2, y0 + i * lh); }
    g.fillText(l, W / 2, y0 + i * lh);
  });
  if (o.chalk) { // dusty chalk look
    const id = g.getImageData(0, 0, W, H);
    for (let i = 0; i < id.data.length; i += 4) { const n = (hash(i) - 0.5) * 30; id.data[i] += n; id.data[i + 1] += n; id.data[i + 2] += n; }
    g.putImageData(id, 0, 0);
  }
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 8;
  return tex;
}

// A flat panel with a texture (sign, poster, board) facing +Z.
export function panel(parent, w, h, tex, pos, opts = {}) {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.8, side: opts.double ? THREE.DoubleSide : THREE.FrontSide }));
  m.position.set(...pos); if (opts.ry) m.rotation.y = opts.ry; if (opts.rx) m.rotation.x = opts.rx;
  m.receiveShadow = true; parent.add(m); return m;
}
