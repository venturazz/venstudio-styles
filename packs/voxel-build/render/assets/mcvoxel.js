/* mcvoxel.js — build Luanti .mts structures into three.js using real block
 * textures, with Minecraft's per-face shading so the result reads as the game.
 *
 *   const vox = new MCVoxel(THREE, rig);
 *   await vox.loadMap('vendor/blockmap.json');
 *   const g = await vox.build('vendor/struct/small_house.json');
 *   scene.add(g);
 *
 * Shapes are cuboid lists in block-local 0..1 space, so stairs/slabs/fences/
 * panes/torches/crops all render without a separate model file. Faces are
 * batched per texture into one BufferGeometry (6 draw calls per structure, not
 * 6 per block).
 */
(function (global) {
  'use strict';

  // Minecraft's fixed face lighting: +Y brightest, -Y darkest.
  const TINT = { py: 1.0, pz: 0.86, nz: 0.86, px: 0.64, nx: 0.64, ny: 0.5 };

  // cuboids: [x0,y0,z0,x1,y1,z1] in 0..1 block space (y up, front = +z)
  const SHAPES = {
    cube: [[0, 0, 0, 1, 1, 1]],
    slab: [[0, 0, 0, 1, 0.5, 1]],
    slab_top: [[0, 0.5, 0, 1, 1, 1]],
    plate: [[0, 0, 0, 1, 0.0625, 1]],
    carpet: [[0, 0, 0, 1, 0.0625, 1]],
    stairs: [[0, 0, 0, 1, 0.5, 1], [0, 0.5, 0, 0.5, 1, 1]],
    fence: [[0.375, 0, 0.375, 0.625, 1, 0.625],
            [0, 0.375, 0.4375, 1, 0.5625, 0.5625],
            [0.4375, 0.375, 0, 0.5625, 0.5625, 1]],
    pane: [[0, 0, 0.4375, 1, 1, 0.5625], [0.4375, 0, 0, 0.5625, 1, 1]],
    torch: [[0.4375, 0, 0.4375, 0.5625, 0.625, 0.5625]],
    chain: [[0.4375, 0, 0.4375, 0.5625, 1, 0.5625]],
    door: [[0, 0, 0, 1, 1, 0.1875]],
    bed: [[0, 0, 0, 1, 0.5625, 1]]
  };

  class MCVoxel {
    constructor(THREE, rig) {
      this.THREE = THREE;
      this.rig = rig;
      this.map = {};
      this._mats = new Map();
    }

    async loadMap(url) {
      this.map = await (await fetch(url)).json();
      // textures are listed relative to the block map, not the page
      this._base = url.slice(0, url.lastIndexOf('/') + 1);
      return this.map;
    }

    _p(p) { return (this._base || '') + p; }

    _mat(texPath, face, alpha, emit) {
      const key = texPath + '|' + face + '|' + (alpha ? 1 : 0) + (emit ? 1 : 0);
      if (this._mats.has(key)) return this._mats.get(key);
      const THREE = this.THREE;
      const t = this.rig._texCache.get(this._p(texPath)) || null;
      const m = new THREE.MeshLambertMaterial({
        map: t,
        color: new THREE.Color(TINT[face], TINT[face], TINT[face]),
        transparent: !!alpha,
        alphaTest: alpha ? 0.12 : 0,
        side: THREE.FrontSide
      });
      if (emit) { m.emissive = new THREE.Color(0xffffff); m.emissiveMap = t; m.emissiveIntensity = 0.55; }
      this._mats.set(key, m);
      return m;
    }

    async _tex(texPath) {
      const u = this._p(texPath);
      if (!this.rig._texCache.has(u)) await this.rig.texture(u);
      return this.rig._texCache.get(u);
    }

    /* Resolve which texture a cuboid face uses for a node entry. */
    _faceTex(entry, face) {
      const t = entry.tex;
      if (t.all) return t.all;
      if (face === 'py' && t.top) return t.top;
      if (face === 'ny' && (t.bottom || t.top)) return t.bottom || t.top;
      if ((face === 'pz' || face === 'nz') && t.front) return t.front;
      return t.side || t.all || t.top;
    }

    async build(url, opts) {
      const THREE = this.THREE;
      opts = opts || {};
      const data = await (await fetch(url)).json();
      const origin = opts.origin || [0, 0, 0];
      const scale = opts.scale === undefined ? 1 : opts.scale;

      // batch buckets: key -> {mat, pos, nrm, uv, idx}
      const buckets = new Map();
      const bucket = (mat) => {
        let b = buckets.get(mat);
        if (!b) { b = { mat, pos: [], nrm: [], uv: [], idx: [] }; buckets.set(mat, b); }
        return b;
      };

      const used = new Set();
      let skipped = 0;

      // 90-degree yaw about the block centre for facedir nodes (stairs, doors, beds)
      const yawBox = (cb, k) => {
        if (!k) return cb;
        let [x0, y0, z0, x1, y1, z1] = cb;
        let ax = x0 - 0.5, az = z0 - 0.5, bx = x1 - 0.5, bz = z1 - 0.5;
        for (let i = 0; i < k; i++) {
          const nax = az, naz = -ax, nbx = bz, nbz = -bx;
          ax = nax; az = naz; bx = nbx; bz = nbz;
        }
        return [0.5 + Math.min(ax, bx), y0, 0.5 + Math.min(az, bz),
                0.5 + Math.max(ax, bx), y1, 0.5 + Math.max(az, bz)];
      };

      for (const nd of data.nodes) {
        const [x, y, z, name, param2] = nd;
        const entry = this.map[name];
        if (!entry) { skipped++; continue; }
        used.add(name);
        const k = (entry.shape === 'stairs' || entry.shape === 'door' || entry.shape === 'bed')
          ? ((param2 || 0) % 4) : 0;

        // preload textures for this node
        for (const p of new Set(Object.values(entry.tex))) await this._tex(p);

        for (const c of Object.values(entry.tex)) { /* keep order stable */ }
        const cuboids = (SHAPES[entry.shape] || SHAPES.cube).map(cb => yawBox(cb, k));
        const lowY = entry.low === undefined ? 1 : entry.low;

        for (const cb of cuboids) {
          let [x0, y0, z0, x1, y1, z1] = cb;
          y1 = Math.min(y1, lowY);
          if (y1 <= y0) continue;
          const bx = origin[0] + x * scale, by = origin[1] + y * scale, bz = origin[2] + z * scale;
          const X0 = bx + x0 * scale, X1 = bx + x1 * scale;
          const Y0 = by + y0 * scale, Y1 = by + y1 * scale;
          const Z0 = bz + z0 * scale, Z1 = bz + z1 * scale;

          const quads = [
            ['px', [X1, Y0, Z1], [X1, Y0, Z0], [X1, Y1, Z0], [X1, Y1, Z1], [1, 0, 0]],
            ['nx', [X0, Y0, Z0], [X0, Y0, Z1], [X0, Y1, Z1], [X0, Y1, Z0], [-1, 0, 0]],
            ['py', [X0, Y1, Z1], [X1, Y1, Z1], [X1, Y1, Z0], [X0, Y1, Z0], [0, 1, 0]],
            ['ny', [X0, Y0, Z0], [X1, Y0, Z0], [X1, Y0, Z1], [X0, Y0, Z1], [0, -1, 0]],
            ['pz', [X0, Y0, Z1], [X1, Y0, Z1], [X1, Y1, Z1], [X0, Y1, Z1], [0, 0, 1]],
            ['nz', [X1, Y0, Z0], [X0, Y0, Z0], [X0, Y1, Z0], [X1, Y1, Z0], [0, 0, -1]]
          ];

          for (const [face, a, b, c2, d, n] of quads) {
            if (face === 'ny' && Y0 <= by + 1e-6 && !opts.floor) { /* keep, floors are visible from below rarely */ }
            const texPath = this._faceTex(entry, face);
            const mat = this._mat(texPath, face, entry.alpha, entry.emit);
            const bk = bucket(mat);
            const base = bk.pos.length / 3;
            for (const v of [a, b, c2, d]) {
              bk.pos.push(v[0], v[1], v[2]);
              bk.nrm.push(n[0], n[1], n[2]);
            }
            // UV: 0..1 per face, flipped so textures read upright on side faces
            bk.uv.push(0, 0, 1, 0, 1, 1, 0, 1);
            bk.idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
          }
        }

        // crops: two crossed planes with alpha cut-out
        if (entry.shape === 'crop') {
          const texPath = entry.tex.all;
          for (const p of [0, 1]) {
            const mat = this._mat(texPath, 'py', true, false);
            mat.side = THREE.DoubleSide;
            const bk = bucket(mat);
            const cx = origin[0] + x * scale + 0.5 * scale, cz = origin[2] + z * scale + 0.5 * scale;
            const by = origin[1] + y * scale, h = scale * 0.9;
            const pts = p === 0
              ? [[cx - 0.5 * scale, by, cz], [cx + 0.5 * scale, by, cz], [cx + 0.5 * scale, by + h, cz], [cx - 0.5 * scale, by + h, cz]]
              : [[cx, by, cz - 0.5 * scale], [cx, by, cz + 0.5 * scale], [cx, by + h, cz + 0.5 * scale], [cx, by + h, cz - 0.5 * scale]];
            const n = p === 0 ? [0, 0, 1] : [1, 0, 0];
            const base = bk.pos.length / 3;
            for (const v of pts) { bk.pos.push(v[0], v[1], v[2]); bk.nrm.push(n[0], n[1], n[2]); }
            bk.uv.push(0, 0, 1, 0, 1, 1, 0, 1);
            bk.idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
          }
        }
      }

      const group = new THREE.Group();
      group.name = opts.name || 'structure';
      for (const bk of buckets.values()) {
        const g = new THREE.BufferGeometry();
        g.setAttribute('position', new THREE.Float32BufferAttribute(bk.pos, 3));
        g.setAttribute('normal', new THREE.Float32BufferAttribute(bk.nrm, 3));
        g.setAttribute('uv', new THREE.Float32BufferAttribute(bk.uv, 2));
        g.setIndex(bk.idx);
        const mesh = new THREE.Mesh(g, bk.mat);
        mesh.frustumCulled = false;
        group.add(mesh);
      }
      group.userData = { size: data.size, blocks: data.nodes.length,
                         skipped, materials: buckets.size, used: [...used] };
      return group;
    }
  }

  global.MCVoxel = MCVoxel;
})(window);