// The studio: timeline from the voice's word timestamps, the shot API used by videos/<slug>/shots.js,
// per-frame evaluation (sets, characters, props, camera, light), captions/overlays and the QA pass.
import { THREE, clamp, lerp, smooth, easeInOut, easeOut, backOut, v3, hash, noise1, mat } from './core.js';
import { Char, PRESETS, crowdLook, preloadFaces, FACE_STYLES, EXPR } from './chars.js';
import { basePose, idle, locomotion, sit, gesturePose, blendInto, applyPose, clapTouches, GESTURES } from './acting.js';
import { buildSet, SET_NAMES } from './sets.js';
import { PROPS } from './props.js';

const SET_SPACING = 700;
const MIN_SHOT = 1.5, MIN_QUICK = 0.9, MIN_CAPTION = 0.4;

export class Studio {
  constructor(W, H) {
    this.W = W; this.H = H;
    const r = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true, powerPreference: 'high-performance' });
    r.setPixelRatio(1); r.setSize(W, H); r.outputColorSpace = THREE.SRGBColorSpace;
    r.toneMapping = THREE.ACESFilmicToneMapping; r.toneMappingExposure = 1.12;
    r.shadowMap.enabled = true; r.shadowMap.type = THREE.PCFSoftShadowMap;
    this.r = r; document.body.appendChild(r.domElement);
    this.scene = new THREE.Scene();
    this.cam = new THREE.PerspectiveCamera(50, W / H, 0.1, 1200);
    this.out = document.createElement('canvas'); this.out.width = W; this.out.height = H; this.g = this.out.getContext('2d');
    // lights
    this.hemi = new THREE.HemisphereLight('#CFE8FF', '#7DBB4E', 1.0); this.scene.add(this.hemi);
    this.sun = new THREE.DirectionalLight('#FFF1D6', 2.6); this.sun.castShadow = true;
    const sz = W > 500 ? 4096 : 1024; this.sun.shadow.mapSize.set(sz, sz);
    const sc = this.sun.shadow.camera; sc.left = -48; sc.right = 48; sc.top = 48; sc.bottom = -48; sc.near = 1; sc.far = 220;
    this.sun.shadow.bias = -0.0004; this.sun.shadow.normalBias = 0.04; this.sun.shadow.radius = 3;
    this.scene.add(this.sun); this.scene.add(this.sun.target);
    this.fill = new THREE.DirectionalLight('#BFD7FF', 0.55); this.scene.add(this.fill); this.scene.add(this.fill.target);
    this.rim = new THREE.DirectionalLight('#FFFFFF', 0.6); this.scene.add(this.rim); this.scene.add(this.rim.target);
    // soft key from the camera side: faces that look at the lens are never in the dark
    this.camKey = new THREE.DirectionalLight('#FFF6EA', 0.75); this.scene.add(this.camKey); this.scene.add(this.camKey.target);
    // sky dome
    this.skyU = { top: { value: new THREE.Color('#4FA3F7') }, bottom: { value: new THREE.Color('#D8F0FF') } };
    this.sky = new THREE.Mesh(new THREE.SphereGeometry(500, 32, 16), new THREE.ShaderMaterial({
      uniforms: this.skyU, side: THREE.BackSide, depthWrite: false,
      vertexShader: 'varying vec3 vP; void main(){ vP = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
      fragmentShader: 'uniform vec3 top; uniform vec3 bottom; varying vec3 vP; void main(){ float k = smoothstep(-0.05, 0.55, vP.y); gl_FragColor = vec4(mix(bottom, top, k), 1.0); }' }));
    this.scene.add(this.sky);
    this.scene.fog = new THREE.Fog('#D8F0FF', 120, 420);
    this.sets = {}; this.setOrder = [];
    this.chars = []; this.props = []; this.shots = []; this.cues = []; this.crowdPool = [];
    this.raycaster = new THREE.Raycaster();
  }

  // ---------------- loading ----------------
  async load() {
    await preloadFaces(FACE_STYLES);
    const script = await (await fetch('/video/script.txt')).text();
    this.tokens = script.split('\n').filter(l => !l.trim().startsWith('#')).join(' ').split(/\s+/).filter(Boolean);
    this.words = this.tokens.map(t => ({ raw: t, w: t.replace(/\*/g, ''), hi: /^\*.*\*[^\w]*$/.test(t) }));
    let timed = null;
    try { const rsp = await fetch('/video/audio/words.json'); if (rsp.ok) timed = await rsp.json(); } catch {}
    this.voice = !!(timed && timed.length);
    if (this.voice) {
      if (timed.length !== this.words.length) console.log(`[K] words.json has ${timed.length} words, script has ${this.words.length}: re-run tools/align.py`);
      this.words.forEach((w, i) => { const tw = timed[Math.min(i, timed.length - 1)]; w.start = tw.start; w.end = tw.end; });
    } else this._estimateTimes();
    this.duration = this.words.length ? this.words[this.words.length - 1].end + 1.0 : 5;
    try { const m = await fetch('/video/meta.json'); if (m.ok) { this.meta = await m.json(); if (this.meta.tail) this.duration = this.words[this.words.length - 1].end + this.meta.tail; } } catch {}
    this.meta = this.meta || {};
    // Changed for the pack: the choreography comes from the request, not from a file beside the project. The rest of
    // this file is the kit's engine, vendored unchanged so the look stays the look.
    if (typeof this.shotsHook !== 'function') throw new Error('no shots hook: the page must set studio.shotsHook');
    await this.shotsHook(this.api());
    this._finalizeShots();
    this._buildCaptions();
    return this.info();
  }
  info() {
    const gl = this.r.getContext(); const dbg = gl.getExtension('WEBGL_debug_renderer_info');
    return { shots: this.shots.length, duration: this.duration, words: this.words.length, voice: this.voice,
      gpu: dbg ? gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) : 'unknown' };
  }
  _estimateTimes(wpm = 180) {
    let t = 0.3; const per = 60 / wpm;
    for (const w of this.words) {
      const syl = Math.max(1, (w.w.toLowerCase().match(/[aeiouy]+/g) || []).length);
      const d = per * (0.55 + 0.3 * Math.min(syl, 4));
      w.start = t; w.end = t + d; t += d;
      if (/[.!?…]["”']?$/.test(w.w)) t += 0.38; else if (/[,;:—-]$/.test(w.w)) t += 0.18;
    }
  }
  wordTime(i) { if (i <= 0) return 0; return this.words[Math.min(i, this.words.length - 1)].start; }

  // ---------------- API for shots.js ----------------
  api() {
    const st = this;
    return {
      THREE, PRESETS, EXPR, GESTURES, SETS: SET_NAMES, words: this.words,
      char(name, look = 'kid', extra = {}) { const o = typeof look === 'string' ? { ...PRESETS[look] } : { ...look }; const c = new Char({ ...o, ...extra, name }); st._addChar(c); return c; },
      async cast(key, extra = {}) {
        const r = await fetch(`/chars/${key}.json`); if (!r.ok) throw new Error(`characters/${key}.json not found`);
        const o = await r.json(); const c = new Char({ ...o, ...extra, name: o.name || key }); st._addChar(c); return c;
      },
      prop(kind, ...args) { const g = typeof kind === 'string' ? PROPS[kind](...args) : kind; g.visible = false; st.scene.add(g); const p = { g, kind: typeof kind === 'string' ? kind : 'custom' }; st.props.push(p); return p; },
      shot(w0, label, fn, opts = {}) { st.shots.push({ id: st.shots.length + 1, w0, label, fn, opts }); },
      time: i => st.wordTime(i),
      // index of the first word equal to `word` (punctuation ignored) at or after word index `from`
      find(word, from = 0) { const n = x => x.toLowerCase().replace(/[^a-z0-9']/g, ''); const i = st.words.findIndex((w, k) => k >= from && n(w.w) === n(word)); if (i < 0) throw new Error('word not found: ' + word); return i; },
    };
  }
  _addChar(c) { c.root.visible = false; this.scene.add(c.root); this.chars.push(c); }
  crowdChar(i) {
    while (this.crowdPool.length <= i) { const c = new Char(crowdLook(this.crowdPool.length + 1)); this._addChar(c); this.crowdPool.push(c); }
    return this.crowdPool[i];
  }
  getSet(name) {
    if (!this.sets[name]) {
      const S = buildSet(name); const idx = this.setOrder.length; this.setOrder.push(name);
      S.origin = new THREE.Vector3(idx * SET_SPACING, 0, 0); S.group.position.copy(S.origin); S.group.visible = false;
      this.scene.add(S.group); S.group.updateMatrixWorld(true);
      S.colliders = S.solids.map(m => ({ box: new THREE.Box3().setFromObject(m), kind: m.userData.collider, mesh: m }));
      S.blockers = []; S.group.traverse(m => { if (m.isMesh && m.material && !m.material.transparent && m.geometry.type !== 'PlaneGeometry') S.blockers.push(m); });
      this.sets[name] = S;
    }
    return this.sets[name];
  }

  _finalizeShots() {
    const sh = this.shots;
    // w0: word index, or {w: index, off: seconds after that word starts}, or {t: seconds}
    sh.forEach(s => { s.start = typeof s.w0 === 'object' ? (s.w0.t ?? this.wordTime(s.w0.w) + (s.w0.off || 0)) : this.wordTime(s.w0); });
    sh.sort((a, b) => a.start - b.start); sh.forEach((s, i) => { s.id = i + 1; });
    sh[0].start = 0;
    sh.forEach((s, i) => { s.end = i + 1 < sh.length ? sh[i + 1].start : this.duration; s.dur = s.end - s.start; });
    for (const s of sh) this._buildShot(s);
  }

  _buildShot(shot) {
    const st = this;
    shot.tracks = new Map(); shot.ptracks = new Map(); shot.overlays = []; shot.freeze = []; shot.light = null; shot.camSpec = null; shot.crowd = [];
    let crowdUsed = 0;
    const T = ch => { if (!shot.tracks.has(ch)) shot.tracks.set(ch, { put: null, moves: [], turns: [], gestures: [], faces: [], talks: [], looks: [], styles: [] }); return shot.tracks.get(ch); };
    const PT = p => { if (!shot.ptracks.has(p)) shot.ptracks.set(p, { put: null, flies: [], attach: null, from: 0, until: Infinity, spin: null }); return shot.ptracks.get(p); };
    const where = (w, opts = {}) => {
      const S = shot.set;
      if (Array.isArray(w)) return { p: new THREE.Vector3(w[0], w.length === 3 ? w[1] : 0, w.length === 3 ? w[2] : w[1]), ry: opts.ry ?? 0 };
      if (typeof w === 'string') {
        if (S.seats[w]) { const s = S.seats[w]; return { p: v3(s.p), ry: opts.ry ?? s.ry, seat: s }; }
        if (S.spots[w]) { const s = S.spots[w]; return { p: v3(s.p), ry: opts.ry ?? s.ry }; }
        throw new Error(`shot ${shot.id}: no spot or seat "${w}" in set ${S.name} (spots: ${Object.keys(S.spots).join(', ')}; seats: ${Object.keys(S.seats).join(', ')})`);
      }
      if (w && w.p) return { p: v3(w.p), ry: w.ry ?? 0 };
      throw new Error('bad place ' + JSON.stringify(w));
    };
    const s = {
      d: shot.dur, id: shot.id,
      w: i => st.wordTime(i) - shot.start,        // local time of word i
      set(name, opts = {}) { shot.set = st.getSet(name); shot.light = opts.light || shot.set.light; shot.lightOpts = opts; return shot.set; },
      light(preset, opts = {}) { shot.light = preset; shot.lightOpts = opts; },
      put(ch, w, opts = {}) {
        const at = where(w, opts); const tr = T(ch);
        tr.put = { p: at.p.clone().add(new THREE.Vector3(opts.dx || 0, opts.y ?? 0, opts.dz || 0)), ry: at.ry, seat: opts.stand ? null : at.seat || (opts.sit ? { h: 1.86 } : null) };
        if (opts.expr) tr.faces.push({ t: 0, expr: opts.expr });
        if (opts.do) tr.gestures.push({ t: 0, name: opts.do, dur: opts.dur ?? 99 });
        return s;
      },
      walk(ch, to, t0, t1, opts = {}) { const tr = T(ch); const end = where(to, opts); tr.moves.push({ to: end, t0, t1, run: !!opts.run, ry: opts.ry ?? end.ry, direct: !!opts.direct }); return s; },
      run(ch, to, t0, t1, opts = {}) { return s.walk(ch, to, t0, t1, { ...opts, run: true }); },
      turn(ch, ry, t, dur = 0.3) { T(ch).turns.push({ t, ry, dur }); return s; },
      look(ch, target, t = 0) { T(ch).looks.push({ t, target }); return s; },
      do(ch, name, t = 0, dur) { if (!GESTURES.includes(name)) throw new Error(`shot ${shot.id}: unknown gesture ${name}`); T(ch).gestures.push({ t, name, dur: dur ?? (name === 'clap' ? 0.5 : 1.2) }); return s; },
      expr(ch, e, t = 0) { if (!EXPR[e]) throw new Error(`shot ${shot.id}: unknown expression ${e} (have: ${Object.keys(EXPR).join(', ')})`); T(ch).faces.push({ t, expr: e }); return s; },
      face(ch, eyes, mouth, t = 0) { T(ch).faces.push({ t, eyes, mouth }); return s; },
      faceStyle(ch, style, t = 0) { T(ch).styles.push({ t, style }); return s; },
      talk(ch, t0, t1) { T(ch).talks.push({ t0, t1 }); return s; },
      // freeze characters/props (or 'all') at local time t; opts.until unfreezes them (they carry on from where they stopped)
      freeze(who, t, opts = {}) { shot.freeze.push({ who: who === 'all' ? 'all' : new Set([].concat(who)), t, until: opts.until ?? Infinity, flash: opts.flash !== false }); return s; },
      music(on, t) { st.cues.push({ t: shot.start + t, name: on ? '__music_on' : '__music_off', gain: 0, shot: shot.id }); return s; },
      // props
      place(p, w, opts = {}) { const tr = PT(p); const at = where(w, opts); tr.put = { p: at.p.clone().add(new THREE.Vector3(0, opts.y ?? 0, 0)), ry: at.ry, rx: opts.rx || 0, scale: opts.scale || 1 }; if (opts.from != null) tr.from = opts.from; if (opts.until != null) tr.until = opts.until; return s; },
      fly(p, pts, t0, t1, opts = {}) { PT(p).flies.push({ pts: pts.map(x => v3(x)), t0, t1, arc: opts.arc ?? 0, ease: opts.ease || 'linear', face: opts.face !== false }); return s; },
      attach(p, ch, hand = 'R', opts = {}) { PT(p).attach = { ch, hand, off: v3(opts.off || [0, -2.0, 0.3]), rot: opts.rot || [0, 0, 0], scale: opts.scale || 1 }; if (opts.from != null) PT(p).from = opts.from; return s; },
      show(p, from = 0, until = Infinity) { const tr = PT(p); tr.from = from; tr.until = until; return s; },
      // crowd: fill seats or spots with generic people
      crowd(places, opts = {}) {
        const list = typeof places === 'string' ? Object.keys(shot.set.seats).filter(k => k.startsWith(places)).concat(Object.keys(shot.set.spots).filter(k => k.startsWith(places))) : places;
        const out = [];
        list.forEach((pl, i) => {
          if (opts.skip && opts.skip.includes(pl)) return;
          const c = st.crowdChar(crowdUsed++); s.put(c, pl, { ry: opts.ry });
          const tr = T(c);
          if (opts.expr) tr.faces.push({ t: 0, expr: opts.expr });
          if (opts.do) tr.gestures.push({ t: (opts.at || 0) + hash(i + shot.id) * (opts.jitter ?? 0.15), name: opts.do, dur: opts.dur ?? 99 });
          if (opts.look) tr.looks.push({ t: 0, target: opts.look });
          out.push(c);
        });
        shot.crowd.push(...out); return out;
      },
      cam(spec) { shot.camSpec = spec; return s; },
      sfx(name, t, gain = 0) { st.cues.push({ t: shot.start + t, name, gain, shot: shot.id }); return s; },
      stamp(text, t, opts = {}) { shot.overlays.push({ kind: 'stamp', text, t, dur: opts.dur ?? 99, color: opts.color || '#E53935', rot: opts.rot ?? -8, size: opts.size || 0.11, y: opts.y ?? 0.3 }); return s; },
      title(text, t, opts = {}) { shot.overlays.push({ kind: 'title', text, t, dur: opts.dur ?? 99, color: opts.color || '#FFFFFF', bg: opts.bg || '#111111', y: opts.y ?? 0.16 }); return s; },
      board(text, opts = {}) { shot.boardText = { text, opts }; return s; },
      podium(text) { shot.podiumText = text; return s; },
      setText(meshName, text, opts) { shot.texts = shot.texts || []; shot.texts.push({ meshName, text, opts }); return s; },
    };
    shot.fn(s);
    if (!shot.set) throw new Error(`shot ${shot.id} (${shot.label}): call s.set(<location>) first`);
    // walking paths (A* around colliders) and auto clap sounds
    for (const [ch, tr] of shot.tracks) {
      let cur = tr.put ? { p: tr.put.p.clone(), ry: tr.put.ry } : null;
      if (!cur) throw new Error(`shot ${shot.id}: ${ch.name} moves but was never put()`);
      tr.moves.sort((a, b) => a.t0 - b.t0);
      for (const m of tr.moves) {
        m.from = cur.p.clone();
        m.path = m.direct ? [m.from, m.to.p.clone()] : this.findPath(shot.set, m.from, m.to.p.clone());
        m.lens = [0]; for (let i = 1; i < m.path.length; i++) m.lens.push(m.lens[i - 1] + m.path[i].distanceTo(m.path[i - 1]));
        m.len = m.lens[m.lens.length - 1]; cur = { p: m.to.p.clone(), ry: m.ry };
      }
      for (const g of tr.gestures) if (g.name === 'clap' || g.name === 'applaud') {
        const touches = clapTouches(g.name, g.dur).map(x => g.t + x).filter(x => !this._isFrozen(shot, ch, x) && x < shot.dur);
        if (g.name === 'clap') touches.forEach(x => this.cues.push({ t: shot.start + x, name: 'clap', gain: 0, shot: shot.id, auto: true }));
      }
    }
    // applause: one crowd sound when many people applaud
    const applauders = [...shot.tracks.values()].filter(tr => tr.gestures.some(g => g.name === 'applaud'));
    if (applauders.length >= 4) {
      const t0 = Math.min(...applauders.map(tr => tr.gestures.find(g => g.name === 'applaud').t));
      const stop = Math.min(...shot.freeze.filter(f => f.t > t0).map(f => f.t), shot.dur + 3);
      if (t0 >= 0 && stop - t0 > 0.3) this.cues.push({ t: shot.start + t0, name: 'applause', gain: 0, shot: shot.id, auto: true, dur: stop - t0 + 0.06 });
    }
    for (const f of shot.freeze) if (f.flash) this.cues.push({ t: shot.start + f.t, name: 'freeze', gain: 0, shot: shot.id, auto: true });
  }

  _fz(shot, x) { return shot.freeze.filter(f => f.who === 'all' || f.who.has(x)); }
  // the character's own clock: local time minus the time it spent frozen
  _ct(shot, x, lt) { let ct = lt; for (const f of this._fz(shot, x)) { const b = Math.min(f.until, lt); if (b > f.t) ct -= b - f.t; } return ct; }
  _isFrozen(shot, x, lt) { return this._fz(shot, x).some(f => lt >= f.t && lt < f.until); }

  // ---------------- path finding (grid A*, set-local coordinates) ----------------
  findPath(S, a, b) {
    const step = 0.75, R = 1.8;   // body + swinging arms clear walls, poles and desks
    const [x0, x1, z0, z1] = S.bounds;
    const nx = Math.ceil((x1 - x0) / step) + 1, nz = Math.ceil((z1 - z0) / step) + 1;
    if (!S.grid) {
      S.grid = new Uint8Array(nx * nz);
      for (const c of S.colliders) {
        const bx = c.box; if (bx.max.y < 0.3 || bx.min.y > 5) continue;
        for (let i = 0; i < nx; i++) for (let j = 0; j < nz; j++) {
          const x = x0 + i * step + S.origin.x, z = z0 + j * step + S.origin.z;
          const dx = Math.max(bx.min.x - x, 0, x - bx.max.x), dz = Math.max(bx.min.z - z, 0, z - bx.max.z);
          if (dx * dx + dz * dz < R * R) S.grid[i + j * nx] = 1;
        }
      }
    }
    const idx = (p) => [clamp(Math.round((p.x - x0) / step), 0, nx - 1), clamp(Math.round((p.z - z0) / step), 0, nz - 1)];
    const free = (i, j) => i >= 0 && j >= 0 && i < nx && j < nz && !S.grid[i + j * nx];
    const lineFree = (p, q) => { const n = Math.ceil(p.distanceTo(q) / (step * 0.5)); for (let k = 0; k <= n; k++) { const x = lerp(p.x, q.x, k / n), z = lerp(p.z, q.z, k / n); const [i, j] = idx({ x, z }); if (!free(i, j)) return false; } return true; };
    if (lineFree(a, b)) return [a, b];
    // start/goal inside a blocked cell (e.g. right next to a tree): use the nearest free cell
    const nearestFree = (p) => { let [i, j] = idx(p); if (free(i, j)) return [i, j]; for (let r = 1; r < 8; r++) for (let di = -r; di <= r; di++) for (let dj = -r; dj <= r; dj++) if (free(i + di, j + dj)) return [i + di, j + dj]; return [i, j]; };
    const [si, sj] = nearestFree(a), [gi, gj] = nearestFree(b);
    const start = si + sj * nx, goal = gi + gj * nx;
    const g = new Float32Array(nx * nz).fill(Infinity), from = new Int32Array(nx * nz).fill(-1), done = new Uint8Array(nx * nz);
    g[start] = 0; const open = [[0, start]];
    const H = (k) => Math.hypot((k % nx) - gi, Math.floor(k / nx) - gj);
    while (open.length) {
      open.sort((p, q) => p[0] - q[0]); const [, k] = open.shift();
      if (k === goal) break; if (done[k]) continue; done[k] = 1;
      const i = k % nx, j = Math.floor(k / nx);
      for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]]) {
        const ii = i + di, jj = j + dj; const kk = ii + jj * nx;
        if (!(free(ii, jj) || kk === goal)) continue;
        const ng = g[k] + Math.hypot(di, dj);
        if (ng < g[kk]) { g[kk] = ng; from[kk] = k; open.push([ng + H(kk), kk]); }
      }
    }
    if (from[goal] < 0) { console.log(`[K] no free path in ${S.name}, walking straight`); return [a, b]; }
    const cells = []; for (let k = goal; k !== -1; k = from[k]) cells.unshift(k);
    const pts = cells.map(k => new THREE.Vector3(x0 + (k % nx) * step, a.y, z0 + Math.floor(k / nx) * step));
    pts[0] = a.clone(); pts[pts.length - 1] = b.clone();
    const out = [pts[0]]; let i = 0;   // string pulling
    while (i < pts.length - 1) { let j = pts.length - 1; while (j > i + 1 && !lineFree(pts[i], pts[j])) j--; out.push(pts[j]); i = j; }
    return out;
  }

  // ---------------- evaluation ----------------
  shotAt(t) { let s = this.shots[0]; for (const x of this.shots) if (x.start <= t + 1e-6) s = x; return s; }

  evaluate(t) {
    const shot = this.shotAt(t); const lt = t - shot.start; const S = shot.set; const O = S.origin;
    for (const n in this.sets) this.sets[n].group.visible = (this.sets[n] === S);
    for (const c of this.chars) c.root.visible = false;
    for (const p of this.props) p.g.visible = false;
    if (shot.boardText && S.board) this._setBoard(S, shot.boardText);
    if (shot.podiumText && S.podiumSign) this._setPodium(S, shot.podiumText);
    const allF = shot.freeze.filter(f => f.who === 'all');
    let at = lt; for (const f of allF) { const b = Math.min(f.until, lt); if (b > f.t) at -= b - f.t; }
    for (const a of S.anim) a(at + shot.start, allF.some(f => lt >= f.t && lt < f.until));
    this._light(shot, lt, S);
    const state = new Map();
    for (const [ch, tr] of shot.tracks) state.set(ch, this._evalChar(ch, tr, shot, lt, O));
    for (const [p, tr] of shot.ptracks) this._evalProp(p, tr, shot, lt, O, state);
    this.scene.updateMatrixWorld(true);
    this._camera(shot, lt, O, state);
    return { shot, lt, state };
  }

  _evalChar(ch, tr, shot, lt, O) {
    const ct = this._ct(shot, ch, lt); const frozen = this._isFrozen(shot, ch, lt);
    ch.root.visible = true;
    let p = tr.put.p.clone(), ry = tr.put.ry, walking = false, run = false, phase = 0, sitting = !!tr.put.seat;
    for (const m of tr.moves) {
      if (ct < m.t0) break;
      sitting = false;
      const k = clamp((ct - m.t0) / Math.max(m.t1 - m.t0, 0.01));
      const kk = m.len > 0.01 ? (k < 1 ? smoothMove(k) : 1) : 1; const d = kk * m.len;
      let i = 1; while (i < m.lens.length - 1 && m.lens[i] < d) i++;
      const segK = (d - m.lens[i - 1]) / Math.max(m.lens[i] - m.lens[i - 1], 1e-6);
      p = m.path[i - 1].clone().lerp(m.path[i], clamp(segK));
      if (k < 1 && m.len > 0.05) { walking = true; run = m.run; phase = d * (run ? 1.05 : 1.35); const dir = m.path[i].clone().sub(m.path[i - 1]); ry = Math.atan2(dir.x, dir.z); }
      else ry = m.ry ?? ry;
    }
    for (const tn of tr.turns) if (ct >= tn.t) ry = lerpAngle(ry, tn.ry, smooth((ct - tn.t) / tn.dur));
    ch.root.position.set(O.x + p.x, p.y, O.z + p.z); ch.root.rotation.y = ry;
    // pose
    const pose = basePose(); idle(pose, ct, ch.name.length);
    if (sitting) sit(pose);
    if (walking) locomotion(pose, phase, run);
    let gw = 0;
    for (const g of tr.gestures) {
      if (ct < g.t) continue; const gl = ct - g.t; if (gl > g.dur + 0.18) continue;
      const w = Math.min(smooth(gl / 0.14), g.dur > 50 ? 1 : smooth((g.dur + 0.18 - gl) / 0.18));
      blendInto(pose, gesturePose(g.name, gl, g.dur), w); gw = w;
    }
    for (const lk of tr.looks) if (ct >= lk.t) {
      const tgt = lk.target === 'camera' ? null : (lk.target instanceof Char ? lk.target.root.position.clone() : new THREE.Vector3(O.x + lk.target[0], 0, O.z + lk.target[lk.target.length === 3 ? 2 : 1]));
      if (tgt) { const yaw = Math.atan2(tgt.x - ch.root.position.x, tgt.z - ch.root.position.z) - ry; pose.head[1] += clamp(wrapAngle(yaw), -0.9, 0.9); }
      else pose.head[1] += clamp(wrapAngle(Math.atan2(this.cam.position.x - ch.root.position.x, this.cam.position.z - ch.root.position.z) - ry), -0.9, 0.9);
    }
    applyPose(ch, pose);
    // face
    for (const s of tr.styles) if (ct >= s.t) ch.setFaceStyle(s.style);
    let eyes = 'normal', mouth = 'smile';
    for (const f of tr.faces) if (ct >= f.t) { if (f.expr) [eyes, mouth] = EXPR[f.expr]; else { eyes = f.eyes || eyes; mouth = f.mouth || mouth; } }
    const blinkT = (ct + hash(ch.name.length * 3.1) * 4) % 3.7;
    if (blinkT < 0.12 && !frozen && eyes !== 'closed' && eyes !== 'happy') eyes = 'closed';
    for (const tk of tr.talks) if (ct >= tk.t0 && ct < tk.t1) { const ph = Math.floor((ct - tk.t0) * 10); mouth = ['talk', 'talk_wide', 'talk', mouth][ph % 4]; }
    ch.setFace(eyes, mouth);
    // getting up from a seat: the first 0.45 s of the first walk still overlaps the chair, that is fine
    const m0 = tr.moves[0]; const exiting = !!(tr.put.seat && m0 && ct >= m0.t0 && ct - m0.t0 < 0.45);
    return { p, ry, sitting: sitting || exiting, walking, frozen };
  }

  _evalProp(pp, tr, shot, lt, O, state) {
    const ct = this._ct(shot, pp, lt); const pFrozen = this._isFrozen(shot, pp, lt);
    if (ct < tr.from || ct > tr.until) return;
    const g = pp.g; g.visible = true;
    if (tr.attach) {
      const a = tr.attach; const arm = a.hand === 'L' ? a.ch.armL : a.ch.armR;
      a.ch.root.updateMatrixWorld(true);
      const w = a.off.clone(); arm.localToWorld(w); g.position.copy(w);
      g.rotation.set(...a.rot); g.rotation.y += a.ch.root.rotation.y; g.scale.setScalar(a.scale);
    } else if (tr.put) { g.position.set(O.x + tr.put.p.x, tr.put.p.y, O.z + tr.put.p.z); g.rotation.set(tr.put.rx, tr.put.ry, 0); g.scale.setScalar(tr.put.scale); }
    let flying = false;
    for (const f of tr.flies) {
      if (ct < f.t0) { if (!tr.put && !tr.attach) { const q = f.pts[0]; g.position.set(O.x + q.x, q.y, O.z + q.z); } break; }
      let k = clamp((ct - f.t0) / Math.max(f.t1 - f.t0, 0.01)); if (f.ease === 'inout') k = easeInOut(k); else if (f.ease === 'out') k = easeOut(k);
      const n = f.pts.length - 1; const seg = Math.min(Math.floor(k * n), n - 1); const sk = k * n - seg;
      const q = f.pts[seg].clone().lerp(f.pts[seg + 1], sk); q.y += Math.sin(k * Math.PI) * f.arc;
      g.position.set(O.x + q.x, q.y, O.z + q.z);
      if (f.face) { const d = f.pts[seg + 1].clone().sub(f.pts[seg]); g.rotation.y = Math.atan2(d.x, d.z); }
      flying = ct < f.t1;
    }
    if (g.userData.animate) g.userData.animate(ct, pp.kind === 'pigeon' ? (tr.wingsOpen ? false : true) : flying);
  }

  _light(shot, lt, S) {
    const O = S.origin; const preset = shot.light || 'day'; const o = shot.lightOpts || {};
    let k = 0; // 0 day .. 1 night
    if (preset === 'night') k = 1; else if (preset === 'sunset') k = 0.55;
    else if (preset === 'timelapse') { const c = o.cycles || 2; k = 0.5 - 0.5 * Math.cos((lt / shot.dur) * c * 2 * Math.PI); }
    const indoor = preset === 'indoor';
    const day = { top: '#3D8BF2', bottom: '#D4EEFF', sun: '#FFF1D6', sunI: 2.7, hemi: 1.05, sky: '#CFE8FF', gnd: '#86C25A', fog: '#D4EEFF', exp: 1.12 };
    const dusk = { top: '#6C5CE7', bottom: '#FFB17A', sun: '#FFB06B', sunI: 1.9, hemi: 0.8, sky: '#FFD3A8', gnd: '#6B8F4E', fog: '#FFB17A', exp: 1.15 };
    const night = { top: '#0B1B3F', bottom: '#2C3E73', sun: '#9DB8FF', sunI: 0.9, hemi: 0.55, sky: '#5C7BD6', gnd: '#2E4A3A', fog: '#1C2B55', exp: 1.25 };
    const mix = (a, b, c, key) => { const ca = new THREE.Color(a[key]), cb = new THREE.Color(b[key]), cc = new THREE.Color(c[key]); return k < 0.55 ? ca.lerp(cb, k / 0.55) : cb.lerp(cc, (k - 0.55) / 0.45); };
    const num = (key) => k < 0.55 ? lerp(day[key], dusk[key], k / 0.55) : lerp(dusk[key], night[key], (k - 0.55) / 0.45);
    if (indoor) {
      this.skyU.top.value.set('#BFD9F2'); this.skyU.bottom.value.set('#EAF4FB');
      this.hemi.color.set('#FFFFFF'); this.hemi.groundColor.set('#B39B7A'); this.hemi.intensity = 1.35;
      this.sun.color.set('#FFF4E0'); this.sun.intensity = 2.2; this.sun.position.set(O.x + 9, 24, O.z + 30); this.sun.target.position.set(O.x, 0, O.z - 4);
      this.fill.intensity = 0.55; this.fill.position.set(O.x - 20, 14, O.z + 10); this.fill.target.position.set(O.x, 2, O.z);
      this.r.toneMappingExposure = 1.15; this.scene.fog.near = 400; this.scene.fog.far = 900;
      for (const l of S.lamps) { l.light.intensity = 0; l.bulb.material.emissiveIntensity = 0; }
    } else {
      this.skyU.top.value.copy(mix(day, dusk, night, 'top')); this.skyU.bottom.value.copy(mix(day, dusk, night, 'bottom'));
      this.hemi.color.copy(mix(day, dusk, night, 'sky')); this.hemi.groundColor.copy(mix(day, dusk, night, 'gnd')); this.hemi.intensity = num('hemi');
      this.sun.color.copy(mix(day, dusk, night, 'sun')); this.sun.intensity = num('sunI');
      const ang = lerp(0.95, 0.35, k); this.sun.position.set(O.x + 40 * Math.cos(ang), 60 * Math.sin(ang) + 10, O.z + 32); this.sun.target.position.set(O.x, 0, O.z);
      this.fill.intensity = 0.45; this.fill.position.set(O.x - 30, 20, O.z - 20); this.fill.target.position.set(O.x, 0, O.z);
      this.scene.fog.color.copy(mix(day, dusk, night, 'fog')); this.scene.fog.near = 120; this.scene.fog.far = 420;
      this.r.toneMappingExposure = num('exp');
      const lampOn = clamp((k - 0.45) / 0.3);
      for (const l of S.lamps) { l.light.intensity = 60 * lampOn; l.bulb.material.emissiveIntensity = 1.6 * lampOn; }
    }
    this.rim.intensity = indoor ? 0.5 : 0.55; this.rim.position.copy(this.cam.position).add(new THREE.Vector3(0, 10, 0)).multiplyScalar(1);
    this.sky.position.set(O.x, 0, O.z);
    this.sun.shadow.camera.updateProjectionMatrix();
  }

  _targetPoint(at, O, state) {
    if (at instanceof Char) return at.headWorld();
    if (Array.isArray(at)) return new THREE.Vector3(O.x + at[0], at[1], O.z + at[2]);
    if (at && at.isVector3) return at.clone();
    return new THREE.Vector3(O.x, 3, O.z);
  }

  _camera(shot, lt, O, state) {
    const sp = shot.camSpec || { at: [0, 3, 0], from: [0, 6, 18] };
    const k = clamp(lt / shot.dur);
    let tgt = this._targetPoint(sp.at, O, state);
    // at2/from2: the camera re-aims (and moves) inside the shot, from local time t2 over t2dur seconds
    const k2 = sp.t2 != null ? easeInOut(clamp((lt - sp.t2) / (sp.t2dur ?? 1))) : 0;
    if (sp.at2) tgt.lerp(this._targetPoint(sp.at2, O, state), k2);
    if (sp.aim) tgt.add(v3(sp.aim));
    let from;
    if (sp.from) from = new THREE.Vector3(O.x + sp.from[0], sp.from[1], O.z + sp.from[2]);
    else {
      const ch = sp.at instanceof Char ? sp.at : null; const ry = ch ? ch.root.rotation.y + (sp.angle ?? 0) : (sp.angle ?? 0);
      const dist = sp.dist ?? 9, side = sp.side ?? 0, h = sp.h ?? (tgt.y + 0.4);
      const base = ch ? ch.root.position.clone() : tgt.clone();
      from = new THREE.Vector3(base.x + Math.sin(ry) * dist + Math.cos(ry) * side, h, base.z + Math.cos(ry) * dist - Math.sin(ry) * side);
    }
    if (sp.from2) from.lerp(new THREE.Vector3(O.x + sp.from2[0], sp.from2[1], O.z + sp.from2[2]), k2);
    const move = sp.move || 'push'; const amt = sp.amount ?? (move === 'push' ? 0.07 : move === 'pull' ? 0.08 : 0);
    const e = easeInOut(k);
    let pos = from.clone();
    if (move === 'push') pos.lerp(tgt, amt * e);
    else if (move === 'pull') pos.lerp(tgt, amt * (1 - e)).add(from.clone().sub(tgt).multiplyScalar(amt * e * 0.5));
    else if (move === 'orbit') { const a = (sp.deg ?? 25) * Math.PI / 180 * (e - 0.5); const d = pos.clone().sub(tgt); pos = tgt.clone().add(d.applyAxisAngle(new THREE.Vector3(0, 1, 0), a)); pos.lerp(tgt, 0.04 * e); }
    else if (move === 'crane') { pos.y += (sp.rise ?? 4) * (e - 0.5); pos.lerp(tgt, 0.04 * e); }
    else if (move === 'track' && sp.at instanceof Char) { /* from is relative to the char each frame when built from dist/angle */ }
    if (sp.handheld !== false) { const hh = sp.handheld ?? 0.06; pos.x += noise1(lt * 0.9, 1) * hh; pos.y += noise1(lt * 0.8, 2) * hh; }
    // camera safety: never inside a collider, never blocked from the subject
    pos = this._safeCam(shot.set, pos, tgt);
    this.cam.position.copy(pos); this.cam.lookAt(tgt);
    this.camKey.position.copy(pos).add(new THREE.Vector3(0, 4, 0)); this.camKey.target.position.copy(tgt);
    this.camKey.intensity = (shot.light === 'night' ? 0.5 : shot.set.indoor ? 0.95 : 0.6) * (shot.lightOpts?.key ?? 1);
    // lens, crash zoom, whip pan
    let lens = sp.lens ?? 35;
    if (sp.crash) { const c = clamp(lt / 0.28); lens = lerp(lens * 0.55, lens, easeOut(c)); }
    if (sp.zoom) lens = lerp(lens, lens * sp.zoom, e);
    this.cam.fov = 2 * Math.atan(18 / lens) * 180 / Math.PI; this.cam.updateProjectionMatrix();
    if (sp.whip && lt < 0.22) this.cam.rotateY((1 - easeOut(lt / 0.22)) * 0.9 * (sp.whip === 'left' ? 1 : -1));
    if (sp.tilt) this.cam.rotateZ(sp.tilt);
    if (sp.shake && lt >= (sp.shakeAt ?? 0) && lt < (sp.shakeAt ?? 0) + (sp.shakeDur ?? 0.35)) { const a = sp.shake * (1 - (lt - (sp.shakeAt ?? 0)) / (sp.shakeDur ?? 0.35)); this.cam.position.x += noise1(lt * 40, 3) * a; this.cam.position.y += noise1(lt * 40, 4) * a; }
    this.cam.updateMatrixWorld(true);
    shot._camFixed = this._lastFix;
  }

  _safeCam(S, pos, tgt) {
    this._lastFix = null;
    const inside = p => S.colliders.some(c => c.box.clone().expandByScalar(0.35).containsPoint(p));
    let p = pos.clone(); let n = 0;
    while (inside(p) && n < 60) { p.lerp(tgt, 0.06); n++; }
    if (n) this._lastFix = 'moved out of a wall/prop';
    // occlusion: walk toward the target until the line of sight is clear
    for (let i = 0; i < 40; i++) {
      const dir = tgt.clone().sub(p); const dist = dir.length(); if (dist < 2.5) break;
      this.raycaster.set(p, dir.normalize()); this.raycaster.far = dist - 1.0;
      const hit = this.raycaster.intersectObjects(S.blockers, false)[0];
      if (!hit) break; p.lerp(tgt, 0.07); this._lastFix = 'moved closer: something blocked the view';
    }
    // stay above the floor and under ceilings
    p.y = Math.max(p.y, 0.8); if (S.indoor) p.y = Math.min(p.y, 11);
    return p;
  }

  _setBoard(S, b) { if (S._boardText === b.text) return; S._boardText = b.text; const { textTexture } = this._tt(); S.board.material.map = textTexture(b.text, { bg: '#2E5E3E', color: '#F5F5F5', w: 1536, h: 640, chalk: true, ...b.opts }); S.board.material.needsUpdate = true; }
  _setPodium(S, text) { if (S._podText === text) return; S._podText = text; const { textTexture } = this._tt(); S.podiumSign.material.map = textTexture(text, { bg: '#FDEDEC', color: '#C0392B', border: '#C0392B', w: 900, h: 760 }); S.podiumSign.material.needsUpdate = true; }
  _tt() { return this.__tt || (this.__tt = { textTexture: window.__textTexture }); }

  // ---------------- captions ----------------
  _buildCaptions() {
    const W = this.words; const groups = []; let cur = null;
    const strip = w => w.replace(/[“”"]/g, '').replace(/[.,;:]+$/, '');
    for (let i = 0; i < W.length; i++) {
      const w = W[i];
      if (!cur) cur = { words: [], start: w.start };
      cur.words.push({ text: strip(w.w).toUpperCase(), hi: w.hi, start: w.start, end: w.end });
      const brk = /[.!?…,;:—]["”']?$/.test(w.w) || cur.words.length >= 3 || (W[i + 1] && W[i + 1].start - w.end > 0.35);
      if (brk || i === W.length - 1) { groups.push(cur); cur = null; }
    }
    for (let i = 0; i < groups.length; i++) groups[i].end = i + 1 < groups.length ? groups[i + 1].start : groups[i].words[groups[i].words.length - 1].end + 0.6;
    // merge groups that would flash for less than MIN_CAPTION seconds
    for (let i = 0; i < groups.length - 1; i++) {
      const g = groups[i];
      if (g.end - g.start < MIN_CAPTION && g.words.length + groups[i + 1].words.length <= 4) { g.words.push(...groups[i + 1].words); g.end = groups[i + 1].end; groups.splice(i + 1, 1); i--; }
    }
    this.captions = groups;
  }
  _drawCaptions(t) {
    const g = this.g, W = this.W, H = this.H;
    const grp = this.captions.find(c => t >= c.start && t < c.end); if (!grp) return;
    const shown = grp.words.filter(w => t >= w.start - 0.02);
    if (!shown.length) return;
    const size = Math.round(W * 0.085); g.font = `900 ${size}px "Arial Black", Arial, sans-serif`;
    g.textAlign = 'left'; g.textBaseline = 'middle'; g.lineJoin = 'round';
    const space = size * 0.28; const widths = grp.words.map(w => g.measureText(w.text).width);
    let lines = [[]], lw = [0];
    grp.words.forEach((w, i) => { const L = lines.length - 1; if (lw[L] + widths[i] > W * 0.86 && lines[L].length) { lines.push([]); lw.push(0); } lines[lines.length - 1].push(i); lw[lines.length - 1] += widths[i] + space; });
    const y0 = H * 0.68 - (lines.length - 1) * size * 0.6;
    lines.forEach((ln, li) => {
      let x = W / 2 - (lw[li] - space) / 2; const y = y0 + li * size * 1.15;
      for (const i of ln) {
        const w = grp.words[i];
        if (t >= w.start - 0.02) {
          const pop = clamp((t - w.start) / 0.09); const sc = lerp(1.18, 1, backOut(pop));
          g.save(); g.translate(x + widths[i] / 2, y); g.scale(sc, sc);
          g.lineWidth = size * 0.2; g.strokeStyle = '#000'; g.strokeText(w.text, -widths[i] / 2, 0);
          g.fillStyle = w.hi ? '#FFE23B' : '#FFFFFF'; g.fillText(w.text, -widths[i] / 2, 0); g.restore();
        }
        x += widths[i] + space;
      }
    });
  }
  _drawOverlays(shot, lt) {
    const g = this.g, W = this.W, H = this.H;
    for (const o of shot.overlays) {
      if (lt < o.t || lt > o.t + o.dur) continue;
      const k = clamp((lt - o.t) / 0.18);
      if (o.kind === 'stamp') {
        const size = Math.round(W * o.size); g.save(); g.translate(W / 2, H * o.y); g.rotate(o.rot * Math.PI / 180); const sc = lerp(2.2, 1, backOut(k)); g.scale(sc, sc); g.globalAlpha = clamp(k * 2);
        g.font = `900 ${size}px "Arial Black", Arial, sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle';
        const lines = o.text.split('\n'); const tw = Math.max(...lines.map(l => g.measureText(l).width)) + size * 0.8, th = lines.length * size * 1.1 + size * 0.5;
        g.lineWidth = size * 0.14; g.strokeStyle = o.color; g.fillStyle = 'rgba(255,255,255,0.92)';
        roundRect(g, -tw / 2, -th / 2, tw, th, size * 0.2); g.fill(); g.stroke();
        g.fillStyle = o.color; lines.forEach((l, i) => g.fillText(l, 0, (i - (lines.length - 1) / 2) * size * 1.1));
        g.restore();
      } else if (o.kind === 'title') {
        const size = Math.round(W * 0.07); g.save(); g.globalAlpha = clamp(k * 1.5); g.font = `900 ${size}px "Arial Black", Arial, sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle';
        const tw = g.measureText(o.text).width + size; const y = H * o.y - (1 - easeOut(k)) * size;
        g.fillStyle = o.bg; roundRect(g, W / 2 - tw / 2, y - size * 0.75, tw, size * 1.5, size * 0.3); g.fill();
        g.fillStyle = o.color; g.fillText(o.text, W / 2, y); g.restore();
      }
    }
    // white flash on freezes
    for (const f of shot.freeze) if (f.flash && lt >= f.t && lt < f.t + 0.16) { g.save(); g.globalAlpha = 0.55 * (1 - (lt - f.t) / 0.16); g.fillStyle = '#E8F7FF'; g.fillRect(0, 0, W, H); g.restore(); }
  }

  frame(t, o = {}) {
    const { shot, lt } = this.evaluate(t);
    this.r.render(this.scene, this.cam);
    const g = this.g; g.drawImage(this.r.domElement, 0, 0);
    this._drawOverlays(shot, lt);
    if (o.captions !== false) this._drawCaptions(t);
    if (o.label) { g.save(); g.font = `700 ${Math.round(this.W * 0.045)}px Arial`; g.fillStyle = 'rgba(0,0,0,0.55)'; g.fillRect(0, 0, this.W, this.W * 0.07); g.fillStyle = '#fff'; g.fillText(`#${shot.id} ${t.toFixed(2)}s ${shot.label}`.slice(0, 40), 6, this.W * 0.05); g.restore(); }
    return this.out.toDataURL('image/jpeg', o.quality || 0.85);
  }

  // ---------------- QA ----------------
  qa(o = {}) {
    const problems = []; const shots = [];
    const P = (shot, t, kind, msg) => problems.push({ shot: shot.id, t, kind, msg });
    for (const shot of this.shots) {
      const samples = [shot.start + Math.min(0.15, shot.dur * 0.2), shot.start + shot.dur * 0.5, shot.end - Math.min(0.12, shot.dur * 0.2)];
      shots.push({ id: shot.id, label: shot.label, start: shot.start, end: shot.end, samples });
      if (o.only && !o.only.includes(shot.id)) continue;
      const minLen = shot.opts.quick ? MIN_QUICK : MIN_SHOT;
      if (shot.dur < minLen - 1e-3 && shot !== this.shots[this.shots.length - 1]) P(shot, shot.start, 'short_shot', `${shot.dur.toFixed(2)} s < ${minLen} s: merge with a neighbour or start it on a later word`);
      for (const t of samples) {
        const { state } = this.evaluate(t);
        if (shot._camFixed) P(shot, t, 'camera_fixed', shot._camFixed + ' (auto-fixed; check the framing)');
        const S = shot.set;
        // subject framing
        const subj = shot.camSpec && shot.camSpec.at instanceof Char ? shot.camSpec.at : null;
        if (subj) {
          const hp = subj.headWorld(); const v = hp.clone().project(this.cam);
          const sx = (v.x + 1) / 2, sy = (1 - v.y) / 2;
          if (v.z > 1 || sx < 0.06 || sx > 0.94 || sy < 0.06 || sy > 0.64) P(shot, t, 'framing', `${subj.name}'s head at (${sx.toFixed(2)}, ${sy.toFixed(2)}) of the frame: keep it in x 0.06-0.94, y 0.06-0.64 (captions live below)`);
          const top = hp.clone().add(new THREE.Vector3(0, 0.7, 0)).project(this.cam), bot = hp.clone().add(new THREE.Vector3(0, -0.7, 0)).project(this.cam);
          const hh = Math.abs(top.y - bot.y) / 2;
          if (hh > 0.3) P(shot, t, 'too_close', `${subj.name}'s head fills ${(hh * 100).toFixed(0)} % of the frame height: move the camera back or use a wider lens (max ~30 %)`);
          if (shot.camSpec.at2 && shot.camSpec.at2 instanceof Char) { /* subject changes inside the shot: framing checked on the first target */ }
          const fwd = new THREE.Vector3(Math.sin(subj.root.rotation.y + subj.head.rotation.y), 0, Math.cos(subj.root.rotation.y + subj.head.rotation.y));
          const toCam = this.cam.position.clone().sub(hp).setY(0).normalize();
          if (fwd.dot(toCam) < -0.25 && !shot.camSpec.back) P(shot, t, 'face_away', `${subj.name} faces away from the camera (add back:true if intended)`);
          // brightness of the face
          this.r.render(this.scene, this.cam);
          const fv = subj.faceWorld().project(this.cam);
          const lum = this._lum((fv.x + 1) / 2, (1 - fv.y) / 2);
          if (lum < 0.2) P(shot, t, 'dark', `${subj.name}'s face is too dark (luminance ${lum.toFixed(2)}); brighten the light or move the camera`);
        }
      }
      // contacts, checked every 0.08 s (bodies AND hands): walls, desks, benches, trees, other people
      for (let t = shot.start + 0.02; t < shot.end - 0.01; t += 0.08) {
        const { state } = this.evaluate(t);
        this._contacts(shot, t, state, P);
      }
    }
    // captions and pace
    for (const c of this.captions) if (c.end - c.start < MIN_CAPTION - 1e-3) problems.push({ shot: this.shotAt(c.start).id, t: c.start, kind: 'caption_fast', msg: `"${c.words.map(w => w.text).join(' ')}" is on screen ${(c.end - c.start).toFixed(2)} s` });
    const spoken = this.words.length ? this.words[this.words.length - 1].end - this.words[0].start : 1;
    const wpm = this.words.length / (spoken / 60);
    const cuts = this.shots.length / (this.duration / 60);
    return { shots, problems: dedupe(problems), pace: { wpm: Math.round(wpm), cutsPerMin: Math.round(cuts), duration: +this.duration.toFixed(2), voice: this.voice, avgShot: +(this.duration / this.shots.length).toFixed(2) }, captions: this.captions.length };
  }
  _contacts(shot, t, state, P) {
    const S = shot.set; const vis = [...state.entries()];
    const loc = v => `(${(v.x - S.origin.x).toFixed(1)}, ${v.z.toFixed(1)})`;
    for (const [ch, stt] of vis) {
      const rp = ch.root.position; const sc = ch.o.scale || 1; const R = 0.95 * sc;
      // body column vs colliders
      for (const c of S.colliders) {
        if (c.kind === 'seat' && stt.sitting) continue;
        if (stt.sitting && c.kind === 'solid' && c.box.max.y < 3.4) continue;  // legs under a desk
        const b = c.box; if (b.max.y < rp.y + 0.35 || b.min.y > rp.y + 5 * sc) continue;
        const dx = Math.max(b.min.x - rp.x, 0, rp.x - b.max.x), dz = Math.max(b.min.z - rp.z, 0, rp.z - b.max.z);
        if (dx * dx + dz * dz < R * R) { P(shot, t, 'clip', `${ch.name} goes into a ${c.kind} object at ${loc(rp)}`); break; }
      }
      // hands vs colliders and vs other people's bodies
      for (const [arm, side] of [[ch.armL, 'left'], [ch.armR, 'right']]) {
        const hand = new THREE.Vector3(0, -1.75, 0); arm.localToWorld(hand);
        for (const c of S.colliders) {
          if (c.kind === 'seat') continue;
          if (c.box.clone().expandByScalar(-0.04).containsPoint(hand)) { P(shot, t, 'hand_clip', `${ch.name}'s ${side} hand goes into a ${c.kind} object at ${loc(hand)} (raise the arm or move the character)`); break; }
        }
        for (const [o] of vis) {
          if (o === ch) continue; const op = o.root.position, os = o.o.scale || 1;
          const local = hand.clone().sub(op).applyAxisAngle(new THREE.Vector3(0, 1, 0), -o.root.rotation.y);
          const inBody = Math.abs(local.x) < 1.0 * os + 0.4 && Math.abs(local.z) < 0.5 * os + 0.4 && local.y > 0.2 && local.y < 4.1 * os;   // +0.4: the arm block is ~1 thick
          const inHead = Math.abs(local.x) < 0.62 * os + 0.4 && Math.abs(local.z) < 0.6 * os + 0.4 && local.y >= 4.1 * os && local.y < 5.3 * os + 0.3;
          if (inBody || inHead) { P(shot, t, 'hand_in_char', `${ch.name}'s ${side} hand goes into ${o.name}${inHead ? "'s head" : ''} at ${loc(hand)} (step back)`); break; }
        }
      }
    }
    for (let i = 0; i < vis.length; i++) for (let j = i + 1; j < vis.length; j++) {
      const A = vis[i][0], B = vis[j][0], a = A.root.position, b = B.root.position;
      const minD = 1.75 * Math.max(A.o.scale || 1, B.o.scale || 1);
      if (Math.hypot(a.x - b.x, a.z - b.z) < minD && Math.abs(a.y - b.y) < 2) P(shot, t, 'overlap', `${A.name} and ${B.name} walk/stand into each other at ${loc(a)}`);
    }
  }
  _lum(sx, sy) {
    const gl = this.r.getContext(); const x = Math.round(sx * this.W), y = Math.round((1 - sy) * this.H);
    // 11x11 patch around the face, 70th percentile: eyes, mouth and mustache are dark on purpose
    const n = 11, px = new Uint8Array(4 * n * n);
    gl.readPixels(clamp(x - 5, 0, this.W - n), clamp(y - 5, 0, this.H - n), n, n, gl.RGBA, gl.UNSIGNED_BYTE, px);
    const L = []; for (let i = 0; i < n * n; i++) L.push((0.2126 * px[i * 4] + 0.7152 * px[i * 4 + 1] + 0.0722 * px[i * 4 + 2]) / 255);
    L.sort((a, b) => a - b); return L[Math.floor(L.length * 0.7)];
  }
}

function dedupe(ps) { const seen = new Set(); return ps.filter(p => { const k = p.shot + p.kind + p.msg.replace(/\(.*$/, '').replace(/ at$/, ''); if (seen.has(k)) return false; seen.add(k); return true; }); }
function smoothMove(k) { const a = 0.18; if (k < a) return (k * k) / (2 * a * (1 - a)); if (k > 1 - a) return 1 - ((1 - k) * (1 - k)) / (2 * a * (1 - a)); return (k - a / 2) / (1 - a); }
function wrapAngle(a) { while (a > Math.PI) a -= 2 * Math.PI; while (a < -Math.PI) a += 2 * Math.PI; return a; }
function lerpAngle(a, b, k) { return a + wrapAngle(b - a) * k; }
function roundRect(g, x, y, w, h, r) { g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath(); }
