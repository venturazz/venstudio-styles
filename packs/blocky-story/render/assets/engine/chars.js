// Blocky R6-style characters built from code. Character faces +Z. Feet at y=0, ~5.3 studs tall.
// Joint layout (studs): legs pivot at hips y=2 (x=+-0.5), torso 2x2x1 from y=2 to 4,
// arms pivot at shoulders y=3.85 (x=+-1.5), head 1.25 x 1.15 x 1.15 centred at y=4.65.
// LEFT side of the character is +X (it faces +Z).
import { THREE, mat, rbox } from './core.js';

const texLoader = new THREE.TextureLoader();
const atlas = new Map();
function loadAtlas(url) {
  if (!atlas.has(url)) { const t = texLoader.load(url); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; atlas.set(url, t); }
  return atlas.get(url);
}
export function preloadFaces(styles) {
  const ps = [];
  for (const s of styles) for (const layer of ['eyes', 'mouth']) {
    const url = `/assets/faces/${s}_${layer}.png`;
    if (atlas.has(url)) continue;
    ps.push(new Promise((res, rej) => { const t = texLoader.load(url, () => res(), undefined, () => rej(new Error('face ' + url))); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; atlas.set(url, t); }));
  }
  return Promise.all(ps);
}
export const FACE_STYLES = ['kid', 'hero', 'girl', 'plain', 'mustache', 'villain', 'hero_blood'];

// eyes cell / mouth cell indices of the 4x4 atlases (see tools/make_faces_layered.py of the old kit)
export const EYES = { normal: 0, wide: 1, half: 2, closed: 3, happy: 4, squint: 5, side_l: 6, side_r: 7, terror: 8, worried: 9, angry: 10, scared: 11, wink: 12, up: 13, down: 14, cry: 15 };
export const MOUTHS = { flat: 0, smile: 1, open_smile: 2, laugh: 3, frown: 4, o: 5, talk: 6, talk_wide: 7, grimace: 8, grimace_wide: 9, scream: 10, smirk: 11, wavy: 12, yawn: 13, grin: 14, ah: 15 };
export const EXPR = {
  normal: ['normal', 'smile'], neutral: ['normal', 'flat'], happy: ['happy', 'open_smile'], smile: ['normal', 'smile'], laugh: ['happy', 'laugh'],
  shock: ['wide', 'o'], surprised: ['wide', 'ah'], scream: ['terror', 'scream'], angry: ['angry', 'frown'], furious: ['angry', 'grimace_wide'],
  scared: ['scared', 'wavy'], sly: ['squint', 'smirk'], smug: ['half', 'smirk'], worried: ['worried', 'wavy'], sad: ['worried', 'frown'],
  cry: ['cry', 'frown'], bored: ['half', 'flat'], sleepy: ['half', 'yawn'], side: ['side_r', 'flat'], side_l: ['side_l', 'flat'],
  wink: ['wink', 'grin'], grin: ['normal', 'grin'], focus: ['squint', 'flat'], up: ['up', 'o'], down: ['down', 'flat'], proud: ['happy', 'grin'],
  strain: ['closed', 'grimace'], dizzy: ['terror', 'wavy'], frozen: ['wide', 'o'],
};

function cellTex(url, idx) {
  const base = loadAtlas(url);
  const t = base.clone(); t.needsUpdate = true;
  t.repeat.set(0.25, 0.25); setCell(t, idx);
  return t;
}
function setCell(t, idx) { t.offset.set((idx % 4) * 0.25, 1 - (Math.floor(idx / 4) + 1) * 0.25); }

const DEFAULT = { skin: '#F2C94C', shirt: '#2F80ED', pants: '#27AE60', hair: 'short', hair_color: '#4A3222', face: 'kid', extras: [], shoes: null, scale: 1 };

export class Char {
  constructor(opts = {}) {
    this.o = { ...DEFAULT, ...opts };
    const o = this.o;
    this.name = o.name || 'char';
    this.root = new THREE.Group(); this.root.name = 'char:' + this.name;
    this.body = new THREE.Group(); this.root.add(this.body);         // body bob / lean lives here
    const skin = mat(o.skin, { rough: 0.45 }), shirt = mat(o.shirt, { rough: 0.6 }), pants = mat(o.pants, { rough: 0.6 });
    const mk = (geo, m, parent, y) => { const me = new THREE.Mesh(geo, m); me.position.y = y; me.castShadow = true; me.receiveShadow = true; parent.add(me); return me; };

    // legs
    this.legL = new THREE.Group(); this.legL.position.set(0.5, 2, 0); this.body.add(this.legL);
    this.legR = new THREE.Group(); this.legR.position.set(-0.5, 2, 0); this.body.add(this.legR);
    mk(rbox(0.98, 2, 1, 0.08), pants, this.legL, -1); mk(rbox(0.98, 2, 1, 0.08), pants, this.legR, -1);
    if (o.shoes) { const sm = mat(o.shoes); mk(rbox(1.0, 0.35, 1.04, 0.06), sm, this.legL, -1.82); mk(rbox(1.0, 0.35, 1.04, 0.06), sm, this.legR, -1.82); }
    // torso
    this.torso = new THREE.Group(); this.torso.position.y = 2; this.body.add(this.torso);
    this.torsoMesh = mk(rbox(2, 2, 1, 0.1), shirt, this.torso, 1);
    // arms (sleeves = shirt color on top half when o.sleeves === 'short')
    const armMat = o.sleeves === 'long' ? shirt : skin;
    this.armL = new THREE.Group(); this.armL.position.set(1.5, 3.85, 0); this.body.add(this.armL);
    this.armR = new THREE.Group(); this.armR.position.set(-1.5, 3.85, 0); this.body.add(this.armR);
    for (const a of [this.armL, this.armR]) {
      mk(rbox(0.98, 2, 0.98, 0.1), armMat, a, -0.85);
      if (o.sleeves !== 'long') mk(rbox(1.02, 0.8, 1.02, 0.08), shirt, a, -0.2);
    }
    // head
    this.head = new THREE.Group(); this.head.position.y = 4.08; this.body.add(this.head);   // pivot at the neck
    this.headMesh = mk(rbox(1.25, 1.15, 1.15, 0.24), skin, this.head, 0.58);
    // face: two layered planes (eyes, mouth) using the 4x4 atlases
    const style = o.face;
    this.faceStyle = style;
    this.eyesTex = cellTex(`/assets/faces/${style}_eyes.png`, 0);
    this.mouthTex = cellTex(`/assets/faces/${style}_mouth.png`, 1);
    const fg = new THREE.PlaneGeometry(1.12, 1.12);
    const fm = t => new THREE.MeshStandardMaterial({ map: t, transparent: true, roughness: 0.6, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 });
    this.eyesPlane = new THREE.Mesh(fg, fm(this.eyesTex)); this.eyesPlane.position.set(0, 0.58, 0.578); this.head.add(this.eyesPlane);
    this.mouthPlane = new THREE.Mesh(fg, fm(this.mouthTex)); this.mouthPlane.position.set(0, 0.58, 0.579); this.head.add(this.mouthPlane);
    this.eyesPlane.renderOrder = 2; this.mouthPlane.renderOrder = 3;

    this._hair(o.hair, o.hair_color);
    for (const e of (o.extras || [])) this._extra(e);
    if (o.logo) { const lg = mk(rbox(0.7, 0.7, 0.05, 0.12), mat(o.logo), this.torso, 1.25); lg.position.z = 0.52; }
    if (o.stripe) { const st = mk(rbox(2.02, 0.4, 1.02, 0.02), mat(o.stripe), this.torso, 1.1); }
    this.root.scale.setScalar(o.scale || 1);
    this.root.traverse(m => { if (m.isMesh) m.userData.char = this; });
    this.curExpr = 'normal';
  }

  _hair(kind, color) {
    const h = mat(color, { rough: 0.7 }); const head = this.head;
    const add = (w, ht, d, x, y, z, r = 0.12, m = h) => { const me = new THREE.Mesh(rbox(w, ht, d, r), m); me.position.set(x, y, z); me.castShadow = true; head.add(me); return me; };
    switch (kind) {
      case 'short': add(1.33, 0.32, 1.23, 0, 1.2, -0.02, 0.14); add(1.33, 0.7, 0.2, 0, 0.9, -0.55, 0.08); break;
      case 'messy': add(1.36, 0.36, 1.25, 0, 1.22, 0); for (let i = 0; i < 5; i++) add(0.38, 0.3, 0.38, -0.5 + i * 0.25, 1.45, -0.2 + (i % 2) * 0.3, 0.1); add(1.33, 0.7, 0.2, 0, 0.9, -0.55); break;
      case 'spiky': add(1.33, 0.25, 1.23, 0, 1.18, 0); for (let i = 0; i < 4; i++) { const s = add(0.36, 0.55, 0.36, -0.45 + i * 0.3, 1.45, 0.05 - (i % 2) * 0.25, 0.06); s.rotation.z = (i - 1.5) * 0.25; } break;
      case 'bob': add(1.4, 0.36, 1.3, 0, 1.2, 0); add(0.22, 1.0, 1.25, 0.7, 0.68, -0.02); add(0.22, 1.0, 1.25, -0.7, 0.68, -0.02); add(1.4, 1.0, 0.22, 0, 0.68, -0.63); break;
      case 'long': add(1.4, 0.36, 1.3, 0, 1.2, 0); add(0.22, 1.5, 1.25, 0.7, 0.45, -0.02); add(0.22, 1.5, 1.25, -0.7, 0.45, -0.02); add(1.4, 1.6, 0.22, 0, 0.4, -0.63); break;
      case 'bun': add(1.33, 0.3, 1.23, 0, 1.2, 0); add(0.62, 0.55, 0.62, 0, 1.55, -0.25, 0.25); break;
      case 'cap': { add(1.36, 0.42, 1.26, 0, 1.22, 0, 0.16); const b = add(1.1, 0.1, 0.65, 0, 1.06, 0.82, 0.04); break; }
      case 'cap_back': { add(1.36, 0.42, 1.26, 0, 1.22, 0, 0.16); add(1.1, 0.1, 0.65, 0, 1.06, -0.82, 0.04); break; }
      case 'tophat': { const k = mat('#1d1d22', { rough: 0.4 }); add(1.6, 0.1, 1.5, 0, 1.2, 0, 0.04, k); add(1.0, 1.0, 1.0, 0, 1.75, 0, 0.06, k); add(1.02, 0.18, 1.02, 0, 1.38, 0, 0.02, mat('#C0392B')); break; }
      case 'bald': break;
      case 'buzz': add(1.29, 0.12, 1.19, 0, 1.17, 0, 0.06); break;
      case 'ponytail': add(1.36, 0.32, 1.25, 0, 1.2, 0); add(0.4, 1.0, 0.4, 0, 0.75, -0.78, 0.16); break;
      default: add(1.33, 0.32, 1.23, 0, 1.2, 0);
    }
    // hair showing under a cap or hat (o.hair_under = its color): fringe at the back and sideburns
    if (this.o.hair_under && ['cap', 'cap_back', 'tophat'].includes(kind)) {
      const hu = mat(this.o.hair_under, { rough: 0.7 });
      add(1.32, 0.55, 0.18, 0, 0.82, -0.56, 0.06, hu); add(0.16, 0.42, 0.5, 0.64, 0.86, 0.05, 0.05, hu); add(0.16, 0.42, 0.5, -0.64, 0.86, 0.05, 0.05, hu);
      if (kind === 'cap_back') add(1.0, 0.22, 0.16, 0, 1.0, 0.57, 0.05, hu);
    }
  }

  _extra(e) {
    const head = this.head, torso = this.torso;
    const add = (p, w, h, d, c, x, y, z, r = 0.04) => { const me = new THREE.Mesh(rbox(w, h, d, r), mat(c)); me.position.set(x, y, z); me.castShadow = true; p.add(me); return me; };
    const [name, arg] = String(e).split(':');
    if (name === 'glasses') { add(head, 0.42, 0.3, 0.06, '#111', 0.27, 0.72, 0.62); add(head, 0.42, 0.3, 0.06, '#111', -0.27, 0.72, 0.62); add(head, 0.15, 0.06, 0.06, '#111', 0, 0.74, 0.62); }
    if (name === 'tie') { add(torso, 0.3, 1.2, 0.08, arg || '#C0392B', 0, 1.25, 0.53); }
    if (name === 'sash') { const s = add(torso, 0.4, 2.6, 0.06, arg || '#E74C3C', 0, 1.0, 0.53); s.rotation.z = 0.75; }
    if (name === 'badge') { add(torso, 0.4, 0.4, 0.06, arg || '#F1C40F', 0.55, 1.5, 0.53, 0.15); }
    if (name === 'backpack') { add(torso, 1.6, 1.6, 0.6, arg || '#E67E22', 0, 1.05, -0.8, 0.15); }
    if (name === 'bowtie') { add(torso, 0.55, 0.25, 0.08, arg || '#8E44AD', 0, 1.85, 0.53); }
    if (name === 'apron') { add(torso, 1.7, 1.9, 0.06, arg || '#ECF0F1', 0, 0.95, 0.53); }
    if (name === 'collar') { add(torso, 1.4, 0.2, 1.06, arg || '#ffffff', 0, 1.93, 0); }
  }

  // eyes / mouth by name (EYES / MOUTHS keys) or an expression name from EXPR
  setFace(eyes, mouth) {
    const ei = EYES[eyes] ?? 0, mi = MOUTHS[mouth] ?? 1;
    setCell(this.eyesTex, ei); setCell(this.mouthTex, mi);
  }
  setFaceStyle(style) {
    if (style === this.faceStyle) return;
    this.faceStyle = style;
    const e = cellTex(`/assets/faces/${style}_eyes.png`, 0), m = cellTex(`/assets/faces/${style}_mouth.png`, 1);
    this.eyesTex = e; this.mouthTex = m; this.eyesPlane.material.map = e; this.mouthPlane.material.map = m;
    this.eyesPlane.material.needsUpdate = true; this.mouthPlane.material.needsUpdate = true;
  }
  headWorld() { const v = new THREE.Vector3(0, 0.58, 0); this.head.localToWorld(v); return v; }
  faceWorld() { const v = new THREE.Vector3(0, 0.45, 0.62); this.head.localToWorld(v); return v; }
}

// Ready-made looks. Woso sheets become characters/<key>.json with the same fields.
export const PRESETS = {
  kid:     { skin: '#F2C94C', shirt: '#2F80ED', pants: '#27AE60', hair: 'messy', hair_color: '#5B3A1E', face: 'kid' },
  girl:    { skin: '#F5D0A9', shirt: '#E84393', pants: '#2D3436', hair: 'ponytail', hair_color: '#3E2723', face: 'girl' },
  bully:   { skin: '#E0B080', shirt: '#2D3436', pants: '#636E72', hair: 'buzz', hair_color: '#2C1B10', face: 'villain', scale: 1.15, extras: ['collar:#b2bec3'] },
  teacher: { skin: '#F5D0A9', shirt: '#6C5CE7', pants: '#2D3436', hair: 'bun', hair_color: '#7F8C8D', face: 'plain', extras: ['glasses'], sleeves: 'long' },
  mayor:   { skin: '#F2C94C', shirt: '#2C3E50', pants: '#2C3E50', hair: 'tophat', hair_color: '#555', face: 'mustache', extras: ['sash:#E74C3C', 'collar:#ffffff'], sleeves: 'long', scale: 1.08 },
  coach:   { skin: '#E0B080', shirt: '#D63031', pants: '#2D3436', hair: 'cap', hair_color: '#D63031', face: 'mustache', extras: ['badge:#dfe6e9'] },
  dad:     { skin: '#F2C94C', shirt: '#00B894', pants: '#34495E', hair: 'short', hair_color: '#2C1B10', face: 'mustache' },
  mom:     { skin: '#F5D0A9', shirt: '#FDCB6E', pants: '#6C5CE7', hair: 'bob', hair_color: '#8E5B2E', face: 'girl' },
  judge:   { skin: '#E0B080', shirt: '#2D3436', pants: '#2D3436', hair: 'bald', hair_color: '#555', face: 'plain', extras: ['glasses', 'bowtie:#C0392B'], sleeves: 'long' },
};
const CROWD_SHIRTS = ['#E17055', '#00CEC9', '#FDCB6E', '#A29BFE', '#55EFC4', '#FF7675', '#74B9FF', '#FAB1A0', '#81ECEC', '#FFEAA7', '#D63031', '#6C5CE7'];
const CROWD_PANTS = ['#2D3436', '#636E72', '#0984E3', '#00B894', '#6D4C41', '#34495E'];
const SKINS = ['#F2C94C', '#F5D0A9', '#E0B080', '#C68642', '#8D5524', '#F2C94C'];
const HAIRS = ['short', 'messy', 'bob', 'bun', 'cap', 'spiky', 'buzz', 'ponytail', 'long', 'bald'];
const HAIRC = ['#2C1B10', '#5B3A1E', '#8E5B2E', '#F1C40F', '#7F8C8D', '#C0392B', '#111'];
const FACES = ['plain', 'kid', 'girl', 'mustache', 'plain', 'hero'];
export function crowdLook(i) {
  const h = HAIRS[(i * 7) % HAIRS.length];
  return { name: 'extra' + i, skin: SKINS[(i * 5) % SKINS.length], shirt: CROWD_SHIRTS[(i * 3) % CROWD_SHIRTS.length], pants: CROWD_PANTS[(i * 7) % CROWD_PANTS.length],
    hair: h, hair_color: HAIRC[(i * 11) % HAIRC.length], face: FACES[(i * 13) % FACES.length], scale: 0.95 + ((i * 37) % 10) / 100 };
}
