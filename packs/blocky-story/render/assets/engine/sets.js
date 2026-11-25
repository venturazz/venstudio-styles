// Locations built from code. Every set is built around its own origin; the studio moves it far away
// from the others and shows only the active one. Colliders are tagged: 'solid' (walls, desks, houses,
// trees: nobody walks through them), 'seat' (chairs, benches: allowed only while sitting).
// spots: named places {p:[x,0,z], ry} for characters; seats: {p, ry, h} (h = seat height).
import { THREE, box, cyl, mat, textTexture, panel, hash, noise1 } from './core.js';

class SetBuilder {
  constructor(name, opts) {
    this.name = name; this.group = new THREE.Group(); this.group.name = 'set:' + name;
    this.solids = []; this.spots = {}; this.seats = {}; this.light = opts.light || 'day';
    this.bounds = opts.bounds || [-30, 30, -30, 30]; this.indoor = !!opts.indoor;
    this.lamps = []; this.extras = []; this.anim = [];
  }
  solid(m, kind = 'solid') { m.userData.collider = kind; this.solids.push(m); return m; }
  spot(n, x, z, ry = 0, y = 0) { this.spots[n] = { p: [x, y, z], ry }; }
  seat(n, x, z, ry, h = 1.9) { this.seats[n] = { p: [x, 0, z], ry, h }; }
}

// ---------- building blocks ----------
function house(S, x, z, ry, o = {}) {
  const g = new THREE.Group(); g.position.set(x, 0, z); g.rotation.y = ry; S.group.add(g);
  const w = o.w || 12, d = o.d || 10, h = o.h || 9;
  S.solid(box(g, w, h, d, o.color || '#F6E58D', [0, 0, 0], { base: true, r: 0.12 }));
  const roof = new THREE.Mesh(new THREE.ConeGeometry(Math.max(w, d) * 0.78, 5, 4), mat(o.roof || '#C0392B'));
  roof.position.y = h + 2.5; roof.rotation.y = Math.PI / 4; roof.scale.set(w / Math.max(w, d), 1, d / Math.max(w, d)); roof.castShadow = true; g.add(roof);
  box(g, 2.6, 4.6, 0.2, '#8E5B2E', [0, 0, d / 2 + 0.05], { base: true });
  for (const sx of [-w / 3, w / 3]) { box(g, 2.4, 2.4, 0.2, '#D6EAF8', [sx, 4.2, d / 2 + 0.06], { emissive: o.night ? '#FFE9A8' : null, emissiveIntensity: 0.0 }); box(g, 2.8, 0.25, 0.3, '#fff', [sx, 2.9, d / 2 + 0.1]); }
  return g;
}
function tree(S, x, z, s = 1) {
  const g = new THREE.Group(); g.position.set(x, 0, z); g.scale.setScalar(s); S.group.add(g);
  S.solid(box(g, 1.2, 5, 1.2, '#8D6E63', [0, 0, 0], { base: true }));
  box(g, 5.5, 4, 5.5, '#2ECC71', [0, 6.5, 0], { r: 0.6 }); box(g, 3.6, 2.6, 3.6, '#27AE60', [0.4, 9, -0.3], { r: 0.5 });
  return g;
}
function lamp(S, x, z) {
  const g = new THREE.Group(); g.position.set(x, 0, z); S.group.add(g);
  S.solid(cyl(g, 0.18, 0.25, 9, '#2C3E50', [0, 0, 0], { base: true }));
  const bulb = box(g, 1.1, 1.1, 1.1, '#FFF3C4', [0, 9.4, 0], { emissive: '#FFE08A', emissiveIntensity: 0.0, r: 0.2 });
  const light = new THREE.PointLight('#FFD98A', 0, 26, 1.6); light.position.set(0, 9, 0); g.add(light);
  S.lamps.push({ bulb, light });
}
function bench(S, x, z, ry) {
  const g = new THREE.Group(); g.position.set(x, 0, z); g.rotation.y = ry; S.group.add(g);
  S.solid(box(g, 5, 0.3, 1.6, '#A0522D', [0, 1.75, 0]), 'seat'); box(g, 5, 1.4, 0.25, '#A0522D', [0, 2.6, -0.75]);
  box(g, 0.25, 1.6, 1.4, '#2C3E50', [-2.2, 0, 0], { base: true }); box(g, 0.25, 1.6, 1.4, '#2C3E50', [2.2, 0, 0], { base: true });
  return g;
}
function desk(S, x, z, ry = 0, color = '#C68E5B') {
  const g = new THREE.Group(); g.position.set(x, 0, z); g.rotation.y = ry; S.group.add(g);
  S.solid(box(g, 3.4, 0.25, 2.2, color, [0, 2.95, 0]));
  for (const [lx, lz] of [[-1.5, -0.9], [1.5, -0.9], [-1.5, 0.9], [1.5, 0.9]]) S.solid(box(g, 0.2, 2.85, 0.2, '#7F8C8D', [lx, 0, lz], { base: true }));
  return g;
}
function chair(S, x, z, ry = 0, color = '#2980B9') {
  const g = new THREE.Group(); g.position.set(x, 0, z); g.rotation.y = ry; S.group.add(g);
  S.solid(box(g, 2.0, 0.22, 2.0, color, [0, 1.75, 0]), 'seat');
  box(g, 2.0, 2.0, 0.22, color, [0, 2.9, -0.95]);
  for (const [lx, lz] of [[-0.85, -0.85], [0.85, -0.85], [-0.85, 0.85], [0.85, 0.85]]) box(g, 0.16, 1.7, 0.16, '#7F8C8D', [lx, 0, lz], { base: true });
  return g;
}
function wall(S, w, h, pos, ry, color, opts = {}) {
  const m = box(S.group, w, h, 0.6, color, pos, { base: true, rot: [0, ry, 0], r: 0.02, ...opts });
  return S.solid(m);
}
function floor(S, w, d, color, y = 0) { const m = box(S.group, w, 0.2, d, color, [0, y - 0.1, 0], { r: 0, shadow: false }); m.receiveShadow = true; return m; }
function grassGround(S, size = 220, color = '#6AB04C') {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(size, size), mat(color, { rough: 0.95 })); m.rotation.x = -Math.PI / 2; m.receiveShadow = true; S.group.add(m);
}

// ---------- sets ----------
export const SETS = {
  plaza(S) {
    grassGround(S);
    const sq = cyl(S.group, 24, 24, 0.12, '#D6CCBA', [0, 0.06, 0], { seg: 48, shadow: false }); sq.receiveShadow = true;
    // fountain
    S.solid(cyl(S.group, 4.2, 4.6, 1.5, '#BDC3C7', [0, 0, -4], { base: true, seg: 32 }));
    // water: solid light blue, its top 0.06 above the basin rim (same height = z-fighting flicker)
    const water = cyl(S.group, 3.7, 3.7, 0.12, '#5CC8F5', [0, 1.5, -4], { seg: 32, rough: 0.15, shadow: false });
    cyl(S.group, 0.7, 0.9, 3.4, '#BDC3C7', [0, 0, -4], { base: true }); cyl(S.group, 1.8, 1.6, 0.5, '#BDC3C7', [0, 3.3, -4]);
    const jet = cyl(S.group, 0.25, 0.5, 2.0, '#B3E5FC', [0, 3.6, -4], { base: true, opacity: 0.7 });
    S.anim.push((t, frozen) => { if (!frozen) jet.scale.y = 1 + Math.sin(t * 8) * 0.12; });
    // ring of houses
    const cols = ['#F6E58D', '#FFBE76', '#7ED6DF', '#E056FD', '#BADC58', '#FF7979', '#DFF9FB', '#F9CA24'];
    const roofs = ['#C0392B', '#2C3E50', '#8E44AD', '#16A085', '#D35400', '#2980B9'];
    for (let i = 0; i < 9; i++) {
      const a = -Math.PI * 0.95 + i * (Math.PI * 0.95 / 4); const r = 38;
      if (Math.cos(a) > 0.6 && Math.sin(a) > -0.2) continue;
      house(S, Math.sin(a) * r, -Math.cos(a) * r * 0.9 - 4, -a + Math.PI, { color: cols[i % cols.length], roof: roofs[i % roofs.length], h: 8 + (i % 3) * 2 });
    }
    // clock tower behind the fountain
    const tw = new THREE.Group(); tw.position.set(0, 0, -44); S.group.add(tw);
    S.solid(box(tw, 8, 26, 8, '#D7CCC8', [0, 0, 0], { base: true }));
    const roof = new THREE.Mesh(new THREE.ConeGeometry(6.5, 7, 4), mat('#5D4037')); roof.position.y = 29.5; roof.rotation.y = Math.PI / 4; roof.castShadow = true; tw.add(roof);
    const clockTex = textTexture('12', { bg: '#FFFDE7', color: '#222', w: 512, h: 512, size: 120 }); panel(tw, 5, 5, clockTex, [0, 20, 4.05]);
    for (const [x, z] of [[-17, 2], [17, 2], [-13, -16], [13, -16], [-24, -8], [24, -8]]) tree(S, x, z, 0.9 + hash(x * z) * 0.3);
    for (const [x, z] of [[-10, 10], [10, 10], [-12, -10], [12, -10]]) lamp(S, x, z);
    bench(S, -9, 4, Math.PI / 2 - 0.3); bench(S, 9, 4, -Math.PI / 2 + 0.3);
    S.seat('bench_l', -8.6, 4.1, Math.PI / 2 - 0.3, 1.86); S.seat('bench_r', 8.6, 4.1, -Math.PI / 2 + 0.3, 1.86);
    S.spot('center', 0, 6, 0); S.spot('fountain', 0, 2.2, 0); S.spot('left', -6, 6, 0.4); S.spot('right', 6, 6, -0.4);
    S.spot('back_l', -6, -12, 0.3); S.spot('back_r', 6, -12, -0.3); S.spot('front', 0, 12, Math.PI);
    S.bounds = [-22, 22, -20, 20];
  },

  classroom(S) {
    floor(S, 32, 28, '#D7B98E');
    for (let i = -15; i <= 15; i += 3) box(S.group, 0.06, 0.02, 28, '#C9A877', [i, 0.01, 0], { r: 0, shadow: false });
    wall(S, 32, 12, [0, 0, -13.3], 0, '#AED6F1');
    wall(S, 28, 12, [-16.3, 0, 0], Math.PI / 2, '#D6EAF8');
    wall(S, 28, 12, [16.3, 0, 0], Math.PI / 2, '#D6EAF8');
    const ceil = box(S.group, 34, 0.4, 28, '#F8F9F9', [0, 12.2, 0], { r: 0, shadow: false });
    // windows on the left wall (light boxes)
    for (const z of [-6, 2]) box(S.group, 0.3, 4.2, 5, '#E8F8FF', [-15.95, 4.5, z], { emissive: '#FFFFFF', emissiveIntensity: 0.6, base: true, shadow: false });
    // chalkboard
    box(S.group, 15.4, 6.4, 0.3, '#6D4C41', [0, 3.2, -12.9], { base: true });
    S.boardTex = textTexture('MATH TEST\n7 x 8 = ?', { bg: '#2E5E3E', color: '#F5F5F5', w: 1536, h: 640, chalk: true });
    S.board = panel(S.group, 15, 6, S.boardTex, [0, 6.4, -12.7]);
    // clock
    panel(S.group, 2, 2, textTexture('🕒', { bg: '#fff', color: '#111', w: 256, h: 256, size: 200 }), [9.5, 9.5, -12.9]);
    // teacher desk
    desk(S, 0, -8.5, 0, '#8D6E63'); S.spot('teacher', 0, -10.8, 0); S.spot('board', 4, -11.4, 0);
    // student desks: columns x, rows z. Students face -Z (the board): ry = PI
    const xs = [-8, 0, 8], zs = [-1.5, 5.5];
    let n = 0;
    for (const z of zs) for (const x of xs) {
      desk(S, x, z, 0); chair(S, x, z + 2.2, Math.PI, ['#2980B9', '#E67E22', '#27AE60'][n % 3]);
      S.seat('desk' + n, x, z + 2.1, Math.PI, 1.86); S.spot('aisle' + n, x + 4, z + 2.2, Math.PI); n++;
    }
    S.bounds = [-15, 15, -12.5, 12.5];
  },

  gym(S) {
    floor(S, 46, 34, '#E3B778');
    for (const [w, d, x, z] of [[0.3, 34, 0, 0], [46, 0.3, 0, 16.8], [46, 0.3, 0, -16.8]]) box(S.group, w, 0.03, d, '#fff', [x, 0.02, z], { r: 0, shadow: false });
    const circ = new THREE.Mesh(new THREE.RingGeometry(4.6, 5, 48), mat('#ffffff')); circ.rotation.x = -Math.PI / 2; circ.position.y = 0.03; S.group.add(circ);
    wall(S, 46, 16, [0, 0, -17.3], 0, '#F0B27A'); wall(S, 34, 16, [-23.3, 0, 0], Math.PI / 2, '#F5CBA7'); wall(S, 34, 16, [23.3, 0, 0], Math.PI / 2, '#F5CBA7');
    box(S.group, 48, 0.4, 36, '#ECF0F1', [0, 16.2, 0], { r: 0, shadow: false });
    // bleachers along the back wall
    for (let i = 0; i < 4; i++) S.solid(box(S.group, 30, 1.0 + i * 1.0, 1.6, i % 2 ? '#85929E' : '#5D6D7E', [0, 0, -11.2 - i * 1.6], { base: true, r: 0.04 }));
    S.banner = panel(S.group, 14, 3.2, textTexture('DODGEBALL\nCHAMPIONSHIP', { bg: '#C0392B', color: '#fff', w: 1400, h: 320 }), [0, 11, -16.9]);
    S.spot('kid', 0, 7, Math.PI); S.spot('thrower_c', 0, -9, 0); S.spot('thrower_l', -7, -9, 0.25); S.spot('thrower_r', 7, -9, -0.25);
    S.spot('team_l', -6, 8, Math.PI); S.spot('team_r', 6, 8, Math.PI);
    S.bounds = [-22, 22, -14, 16];
  },

  schoolyard(S) {
    grassGround(S, 200, '#78C850');
    const asphalt = box(S.group, 50, 0.1, 34, '#95A5A6', [0, 0.05, 0], { r: 0, shadow: false }); asphalt.receiveShadow = true;
    // school facade
    const sch = new THREE.Group(); sch.position.set(0, 0, -22); S.group.add(sch);
    S.solid(box(sch, 50, 14, 6, '#CD6155', [0, 0, 0], { base: true, r: 0.05 }));
    for (let i = -4; i <= 4; i++) if (i !== 0) box(sch, 3, 3.2, 0.3, '#D6EAF8', [i * 5.2, 7.5, 3.05], { base: true });
    box(sch, 5, 6.5, 0.3, '#5D4037', [0, 0, 3.05], { base: true });
    panel(sch, 12, 2.4, textTexture('SCHOOL', { bg: '#FDFEFE', color: '#1B2631', w: 1200, h: 240 }), [0, 11.5, 3.2]);
    // fence + hoop + slide
    for (let x = -24; x <= 24; x += 3) box(S.group, 0.2, 3, 0.2, '#7F8C8D', [x, 0, 17], { base: true });
    box(S.group, 48, 0.2, 0.2, '#7F8C8D', [0, 2.8, 17]);
    const hoop = new THREE.Group(); hoop.position.set(16, 0, -8); S.group.add(hoop);
    S.solid(cyl(hoop, 0.25, 0.25, 10, '#34495E', [0, 0, 0], { base: true })); box(hoop, 4, 3, 0.2, '#fff', [0, 10, 0.6]);
    const slide = new THREE.Group(); slide.position.set(-15, 0, -6); S.group.add(slide);
    S.solid(box(slide, 3, 6, 3, '#F39C12', [0, 0, 0], { base: true })); const ramp = box(slide, 2.6, 0.3, 9, '#E74C3C', [0, 3, 5.3]); ramp.rotation.x = 0.62;
    tree(S, -22, 10, 1); tree(S, 22, 10, 1.1);
    S.spot('center', 0, 4, 0); S.spot('bully', 0, 0, Math.PI); S.spot('kid', 0, 4, 0); S.spot('left', -6, 4, 0.3); S.spot('right', 6, 4, -0.3);
    S.bounds = [-23, 23, -18, 16];
  },

  townhall(S) {
    floor(S, 36, 30, '#8D6E63');
    wall(S, 36, 14, [0, 0, -14.3], 0, '#F5EEF8'); wall(S, 30, 14, [-18.3, 0, 0], Math.PI / 2, '#EBDEF0'); wall(S, 30, 14, [18.3, 0, 0], Math.PI / 2, '#EBDEF0');
    box(S.group, 38, 0.4, 30, '#FDFEFE', [0, 14.2, 0], { r: 0, shadow: false });
    for (let x = -16; x <= 16; x += 4) box(S.group, 1.0, 14, 0.8, '#D2B4DE', [x, 0, -13.8], { base: true });
    panel(S.group, 9, 3, textTexture('TOWN HALL', { bg: '#1B4F72', color: '#F7DC6F', w: 1200, h: 400 }), [0, 11, -13.7]);
    // stage + podium
    S.solid(box(S.group, 20, 1.2, 8, '#6E2C00', [0, 0, -9], { base: true, r: 0.05 }));
    const pod = new THREE.Group(); pod.position.set(0, 1.2, -6.8); S.group.add(pod);
    S.solid(box(pod, 4.4, 4.0, 2.2, '#5D4037', [0, 0, 0], { base: true }));
    S.podiumTex = textTexture('NO\nCLAPPING', { bg: '#FDEDEC', color: '#C0392B', border: '#C0392B', w: 900, h: 760 });
    S.podiumSign = panel(pod, 3.6, 3.0, S.podiumTex, [0, 2.0, 1.12]);
    for (const x of [-7, 7]) { const f = new THREE.Group(); f.position.set(x, 1.2, -11); S.group.add(f); cyl(f, 0.1, 0.1, 9, '#B7950B', [0, 0, 0], { base: true }); box(f, 3, 2, 0.08, x < 0 ? '#2E86C1' : '#CB4335', [1.6, 7.5, 0]); }
    // audience rows (seats face -Z)
    let n = 0;
    for (let r = 0; r < 3; r++) for (let c = -2; c <= 2; c++) { chair(S, c * 4.2, 2 + r * 4.4, Math.PI, '#922B21'); S.seat('row' + n, c * 4.2, 1.9 + r * 4.4, Math.PI, 1.86); n++; }
    S.spot('mayor', 0, -9.2, 0, 1.2); S.spot('stage_l', -6, -9.5, 0.3, 1.2); S.spot('aisle', 11, 4, -Math.PI / 2);
    S.mayorY = 1.2;
    S.bounds = [-17, 17, -13, 14];
  },

  auditorium(S) {
    floor(S, 44, 40, '#6E2C00');
    wall(S, 44, 18, [0, 0, -20.3], 0, '#4A235A'); wall(S, 40, 18, [-22.3, 0, 0], Math.PI / 2, '#5B2C6F'); wall(S, 40, 18, [22.3, 0, 0], Math.PI / 2, '#5B2C6F');
    box(S.group, 46, 0.4, 40, '#212F3D', [0, 18.2, 0], { r: 0, shadow: false });
    S.solid(box(S.group, 30, 2.2, 10, '#A04000', [0, 0, -14], { base: true, r: 0.05 }));
    for (let i = 0; i < 12; i++) box(S.group, 2.6, 15, 0.5, i % 2 ? '#B03A2E' : '#922B21', [-14.3 + i * 2.6, 2.2, -19.3], { base: true, r: 0.2 });
    S.banner = panel(S.group, 18, 3.2, textTexture('SPELLING BEE', { bg: '#F4D03F', color: '#1B2631', w: 1600, h: 300 }), [0, 14.5, -18.8]);
    // judges table on the stage (right)
    S.solid(box(S.group, 7, 2.6, 2.4, '#1C2833', [9, 2.2, -12], { base: true }));
    S.spot('stage', 0, -11.5, 0, 2.2); S.spot('stage_l', -6, -12, 0.2, 2.2); S.spot('judge', 9, -14.2, 0, 2.2); S.spot('aisle', 15, 6, -Math.PI / 2);
    S.stageY = 2.2;
    // audience: 4 rows x 7 seats, facing the stage (-Z)
    let n = 0;
    for (let r = 0; r < 4; r++) for (let c = -3; c <= 3; c++) { chair(S, c * 3.6, 0 + r * 4.4, Math.PI, '#7B241C'); S.seat('row' + n, c * 3.6, -0.1 + r * 4.4, Math.PI, 1.86); n++; }
    S.bounds = [-21, 21, -19, 19];
  },

  // ---- lokasi baru: kelas tinggal di sekolah tua (adegan "Kursi Nomor 7", malam) ----
  kelas_tua(S) {
    floor(S, 30, 26, '#6B5644');
    for (let x = -14; x <= 14; x += 2.5) box(S.group, 0.05, 0.02, 26, '#5A4630', [x, 0.01, 0], { r: 0, shadow: false });
    wall(S, 30, 12, [0, 0, -12.3], 0, '#4F5A48');
    wall(S, 26, 12, [-15.3, 0, 0], Math.PI / 2, '#58624F');
    wall(S, 26, 12, [15.3, 0, 0], Math.PI / 2, '#58624F');
    box(S.group, 32, 0.4, 26, '#34383A', [0, 12.2, 0], { r: 0, shadow: false });
    // papan tulis usang
    box(S.group, 13.6, 5.8, 0.3, '#39442F', [0, 3.0, -11.9], { base: true });
    S.boardTex = textTexture('KELAS 6B', { bg: '#39442F', color: '#DCE6D2', w: 1024, h: 512, chalk: true });
    S.board = panel(S.group, 12.8, 5.0, S.boardTex, [0, 5.7, -11.7]);
    // jendela tinggi: cahaya bulan masuk
    for (const wx of [-8.5, 0, 8.5]) {
      box(S.group, 4.8, 5.2, 0.3, '#93A9C6', [wx, 5.4, -12.05], { emissive: '#7E97BA', emissiveIntensity: 0.9, base: true, shadow: false });
      for (const i of [-1, 0, 1]) box(S.group, 0.16, 5.2, 0.34, '#2F3A2A', [wx + i * 2.4, 5.4, -12.0], { base: true });
    }
    // enam meja-kursi tua: baris depan z=-2, baris belakang z=4
    let n = 0;
    for (const z of [-2, 4]) for (const x of [-7, 0, 7]) {
      desk(S, x, z, 0, '#7A6450'); chair(S, x, z + 2.2, Math.PI, '#6E5B45');
      S.seat('desk' + n, x, z + 2.1, Math.PI, 1.86); n++;
    }
    S.seat('chair7', 7, 6.1, Math.PI, 1.86); // kursi nomor 7 = baris belakang paling kanan
    // angka 7 ditempel di sandaran kursi itu
    panel(S.group, 1.35, 1.35, textTexture('7', { bg: '#E9DDC6', color: '#3A2A1C', w: 256, h: 256, size: 200 }), [7, 3.05, 7.33]);
    // lampu gantung berkedip (di luar S.lamps supaya S.anim bisa mengendalikannya sendiri)
    cyl(S.group, 0.06, 0.06, 3.0, '#2E2E2E', [0, 9.6, -1], { base: true });
    const bulb = box(S.group, 1.15, 0.5, 1.15, '#FFF3C4', [0, 8.4, -1], { emissive: '#FFE08A', emissiveIntensity: 0.5, r: 0.3, unique: true });
    const pl = new THREE.PointLight('#FFD98A', 0, 24, 1.7); pl.position.set(0, 8.2, -1); S.group.add(pl);
    S.anim.push(t => { const f = 0.7 + 0.3 * noise1(t * 3.1, 7), cut = hash(Math.floor(t * 2.7)) > 0.87 ? 0.1 : 1; pl.intensity = 64 * f * cut; bulb.material.emissiveIntensity = 1.5 * f * cut; });
    S.spot('teacher', 0, -9.6, 0); S.spot('board', 3.4, -10.4, 0);
    S.spot('doorway', 12.6, 9.6, -2.3); S.spot('backleft', -7, 10, Math.PI);
    S.bounds = [-14, 14, -11.5, 12];
  },

  // ---- lokasi baru: ruang makan rumah ----
  rumah(S) {
    floor(S, 26, 20, '#C9A874');
    wall(S, 26, 11, [0, 0, -9.3], 0, '#E4D2B2');
    wall(S, 20, 11, [-13.3, 0, 0], Math.PI / 2, '#EADCC0');
    wall(S, 20, 11, [13.3, 0, 0], Math.PI / 2, '#EADCC0');
    box(S.group, 28, 0.4, 20, '#FFF7E8', [0, 11.2, 0], { r: 0, shadow: false });
    box(S.group, 5.4, 4.4, 0.3, '#6E86A8', [6.4, 5.6, -9.05], { emissive: '#5C739B', emissiveIntensity: 0.85, base: true, shadow: false });
    for (const i of [-1, 0, 1]) box(S.group, 0.2, 4.4, 0.34, '#4A3B2A', [6.4 + i * 2.7, 5.6, -9.0], { base: true });
    // dinding keempat + pintu, tanpa ini ruangan terbuka ke langit
    wall(S, 26, 11, [0, 0, 9.3], 0, '#E4D2B2');
    box(S.group, 3.4, 6.6, 0.12, '#7A5230', [-7.5, 0, 8.9], { base: true });
    box(S.group, 0.3, 6.6, 0.12, '#5C3A22', [-9.2, 0, 8.86], { base: true });
    // lampu makan
    cyl(S.group, 0.05, 0.05, 3.2, '#2E2E2E', [0, 9.2, 1.5], { base: true });
    const bulb = box(S.group, 1.8, 0.6, 1.8, '#FFF3C4', [0, 7.6, 1.5], { emissive: '#FFE08A', emissiveIntensity: 0.7, r: 0.35 });
    const pl = new THREE.PointLight('#FFDCA8', 0, 28, 1.6); pl.position.set(0, 7.4, 1.5); S.group.add(pl);
    S.lamps.push({ bulb, light: pl });
    // meja makan + 4 kursi (tempat keempat kosong)
    S.solid(box(S.group, 8.2, 0.3, 4.6, '#8B5E3C', [0, 2.5, 1.5], { base: true }));
    for (const [lx, lz] of [[-3.6, -0.5], [3.6, -0.5], [-3.6, 3.5], [3.6, 3.5]]) box(S.group, 0.22, 2.5, 0.22, '#6E4A2E', [lx, 0, lz], { base: true });
    for (const [cx, cz, cr] of [[-2.2, -1.4, 0], [2.2, -1.4, 0], [-2.2, 4.4, Math.PI], [2.2, 4.4, Math.PI]]) chair(S, cx, cz, cr, '#7A5A3C');
    S.seat('ibu', -2.2, -1.5, 0, 1.86); S.seat('ayah', 2.2, -1.5, 0, 1.86);
    S.seat('adik', -2.2, 4.3, Math.PI, 1.86); S.seat('kosong', 2.2, 4.3, Math.PI, 1.86);
    // tiga piring; tempat keempat sengaja kosong
    for (const [px, pz] of [[-2.2, 0.4], [2.2, 0.4], [-2.2, 2.6]]) cyl(S.group, 0.72, 0.72, 0.14, '#F7F7F5', [px, 2.95, pz], { seg: 24, shadow: false });
    S.spot('pintu', 0, 8.8, Math.PI); S.spot('tengah', 0, 6.2, Math.PI);
    S.bounds = [-12, 12, -8.5, 9.5];
  },
};

export function buildSet(name) {
  const f = SETS[name];
  if (!f) throw new Error('unknown set ' + name + ' (have: ' + Object.keys(SETS).join(', ') + ')');
  const INDOOR = ['classroom', 'gym', 'townhall', 'auditorium', 'kelas_tua', 'rumah'];
  const S = new SetBuilder(name, { light: INDOOR.includes(name) ? 'indoor' : 'day', indoor: INDOOR.includes(name) });
  f(S);
  S.group.traverse(m => { if (m.isMesh) m.userData.set = name; });
  return S;
}
export const SET_NAMES = Object.keys(SETS);
