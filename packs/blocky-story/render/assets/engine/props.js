// Movable props. Each returns a THREE.Group with userData.animate(t) for idle motion (wings, spin).
import { THREE, box, cyl, mat, rbox, textTexture, panel } from './core.js';

export function pigeon() {
  const g = new THREE.Group(); g.name = 'pigeon';
  box(g, 0.9, 0.7, 1.4, '#8395A7', [0, 0, 0], { r: 0.25 });
  box(g, 0.6, 0.6, 0.6, '#576574', [0, 0.45, 0.7], { r: 0.22 });
  box(g, 0.62, 0.3, 0.3, '#2ECC71', [0, 0.2, 0.62], { r: 0.1 });            // shiny neck band
  box(g, 0.2, 0.15, 0.3, '#F39C12', [0, 0.42, 1.1], { r: 0.05 });           // beak
  box(g, 0.12, 0.12, 0.05, '#111', [0.2, 0.55, 0.99], { r: 0.03 }); box(g, 0.12, 0.12, 0.05, '#111', [-0.2, 0.55, 0.99], { r: 0.03 });
  box(g, 0.7, 0.18, 0.5, '#576574', [0, 0.05, -0.85], { r: 0.06 });        // tail
  const wl = new THREE.Group(); wl.position.set(0.45, 0.2, 0); g.add(wl); box(wl, 1.3, 0.12, 0.9, '#6C7A89', [0.65, 0, 0], { r: 0.05 });
  const wr = new THREE.Group(); wr.position.set(-0.45, 0.2, 0); g.add(wr); box(wr, 1.3, 0.12, 0.9, '#6C7A89', [-0.65, 0, 0], { r: 0.05 });
  g.userData.animate = (t, flying = true) => { const a = flying ? Math.sin(t * 22) * 0.75 : 0.05; wl.rotation.z = a; wr.rotation.z = -a; };
  g.userData.wings = [wl, wr];
  return g;
}

export function ball(color = '#E74C3C', r = 0.6) {
  const g = new THREE.Group(); g.name = 'ball';
  const m = new THREE.Mesh(new THREE.SphereGeometry(r, 24, 16), mat(color, { rough: 0.35 })); m.castShadow = true; g.add(m);
  g.userData.animate = t => { m.rotation.x = t * 9; m.rotation.z = t * 4; };
  return g;
}

export function paper(text = 'A+', color = '#fff') {
  const g = new THREE.Group(); g.name = 'paper';
  const t = textTexture(text, { bg: color, color: '#C0392B', w: 384, h: 512, size: 150 });
  const p = panel(g, 0.85, 1.1, t, [0, 0.03, 0], { rx: -Math.PI / 2, double: true });
  return g;
}

export function trophy() {
  const g = new THREE.Group(); g.name = 'trophy';
  const gold = mat('#F1C40F', { rough: 0.25, metal: 0.6 });
  box(g, 0.9, 0.3, 0.9, null, [0, 0.15, 0], { material: mat('#6D4C41') });
  cyl(g, 0.12, 0.2, 0.6, null, [0, 0.6, 0], { material: gold });
  cyl(g, 0.55, 0.25, 0.8, null, [0, 1.3, 0], { material: gold });
  return g;
}

export function gavel() {
  const g = new THREE.Group(); g.name = 'gavel';
  box(g, 0.15, 1.2, 0.15, '#8D6E63', [0, 0.6, 0]);
  box(g, 0.7, 0.35, 0.35, '#5D4037', [0, 1.25, 0]);
  return g;
}

export function marker(color = '#111') {
  const g = new THREE.Group(); g.name = 'marker';
  box(g, 0.18, 0.18, 0.8, '#ECF0F1', [0, 0, 0]); box(g, 0.19, 0.19, 0.2, color, [0, 0, 0.45]);
  return g;
}

export function micStand() {
  const g = new THREE.Group(); g.name = 'mic';
  cyl(g, 0.5, 0.5, 0.08, '#222', [0, 0.04, 0]); cyl(g, 0.05, 0.05, 4.2, '#333', [0, 2.1, 0]);
  const h = cyl(g, 0.15, 0.12, 0.45, '#111', [0, 4.35, 0.12]); h.rotation.x = 0.5;
  return g;
}

export function sign(text, o = {}) {
  const g = new THREE.Group(); g.name = 'sign';
  const w = o.w || 3.2, h = o.h || 1.8;
  box(g, 0.18, o.pole ?? 3, 0.18, '#7f8c8d', [0, (o.pole ?? 3) / 2, -0.05]);
  const t = textTexture(text, { bg: o.bg || '#fff', color: o.color || '#C0392B', border: o.border || '#C0392B', borderW: 30, w: 1024, h: Math.round(1024 * h / w) });
  box(g, w + 0.12, h + 0.12, 0.1, o.border || '#C0392B', [0, (o.pole ?? 3) + h / 2, -0.06]);
  panel(g, w, h, t, [0, (o.pole ?? 3) + h / 2, 0.0]);
  return g;
}

export function book(color = '#2980B9') {
  const g = new THREE.Group(); g.name = 'book';
  box(g, 1.0, 0.18, 0.75, color, [0, 0.09, 0]); box(g, 0.94, 0.14, 0.7, '#fdfdfd', [0.02, 0.09, 0]);
  return g;
}

export const PROPS = { pigeon, ball, paper, trophy, gavel, marker, micStand, sign, book };
