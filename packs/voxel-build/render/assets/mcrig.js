/* mcrig.js — load real Minecraft-style B3D rigs (converted to JSON) into three.js.
 *
 * A B3D mob is one skinned mesh whose vertices are grouped per bone. b3d2json.py
 * splits that mesh per bone, so here every node just gets its own voxel piece and
 * the node tree keeps the original pivots. Rotating a named node (arm, wing, neck1)
 * therefore moves its voxels rigidly — exactly how the game animates mobs.
 *
 * Usage:
 *   const rig = new MCRig(THREE);
 *   const inst = await rig.load('assets/villager.json', 'assets/mobs_mc_villager.png');
 *   scene.add(inst.group);              // group scaled so the mob is H blocks tall
 *   inst.nodes['head'];                 // Object3D pivot, ready to animate
 */
(function (global) {
  'use strict';

  class MCRig {
    constructor(THREE) {
      this.THREE = THREE;
      this._texCache = new Map();
      this._jsonCache = new Map();
    }

    async texture(url) {
      if (this._texCache.has(url)) return this._texCache.get(url);
      const THREE = this.THREE;
      const tex = await new Promise((res, rej) => {
        new THREE.TextureLoader().load(url, t => res(t), undefined, e => rej(e));
      });
      tex.magFilter = THREE.NearestFilter;
      tex.minFilter = THREE.NearestFilter;
      tex.generateMipmaps = false;
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
      tex.needsUpdate = true;
      this._texCache.set(url, tex);
      return tex;
    }

    async json(url) {
      if (this._jsonCache.has(url)) return this._jsonCache.get(url);
      const data = await (await fetch(url)).json();
      this._jsonCache.set(url, data);
      return data;
    }

    /* Build one instance. opts:
     *   height  target height in blocks (null = use raw model units)
     *   tint    material colour multiplier
     *   yaw     extra rotation of the whole rig (radians)
     *   hide    array of node names to hide (e.g. held-item bones)
     */
    async load(jsonUrl, texUrl, opts) {
      const THREE = this.THREE;
      opts = opts || {};
      const data = await this.json(jsonUrl);
      const tex = await this.texture(texUrl);
      const mat = new THREE.MeshLambertMaterial({
        map: tex,
        side: THREE.DoubleSide,          // Blitz3D is left-handed; mirroring flips winding
        alphaTest: 0.5,
        color: opts.tint === undefined ? 0xffffff : opts.tint
      });

      const nodes = {};
      const hidden = (opts.hide || []).map(h => h.toLowerCase());
      const self = this;

      function build(n) {
        const pivot = new THREE.Group();
        pivot.name = n.name;
        pivot.position.fromArray(n.pos || [0, 0, 0]);
        // file quaternion is (w,x,y,z); three wants (x,y,z,w)
        const q = n.rot || [1, 0, 0, 0];
        pivot.quaternion.set(q[1], q[2], q[3], q[0]);
        pivot.scale.fromArray(n.scale || [1, 1, 1]);
        if (n.geo && n.geo.idx.length) {
          const pos = new Float32Array(n.geo.pos);
          const nrm = new Float32Array(n.geo.nrm);
          const uv = new Float32Array(n.geo.uv.length);
          // Blitz3D texture origin is TOP-left; three.js flipY=true puts v=0 at
          // the image bottom, so mirror v. Verified with a banded debug atlas:
          // without this the head samples the bottom band instead of the face.
          for (let i = 0; i < n.geo.uv.length; i += 2) {
            uv[i] = n.geo.uv[i];
            uv[i + 1] = 1 - n.geo.uv[i + 1];
          }
          const g = new THREE.BufferGeometry();
          g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
          g.setAttribute('normal', new THREE.BufferAttribute(nrm, 3));
          g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
          g.setIndex(n.geo.idx);
          const m = new THREE.Mesh(g, mat);
          m.frustumCulled = false;
          m.name = n.name + ':mesh';
          pivot.add(m);
        }
        if (hidden.indexOf(n.name.toLowerCase()) !== -1) pivot.visible = false;
        for (const c of (n.children || [])) pivot.add(build(c));
        nodes[n.name] = pivot;
        return pivot;
      }

      const group = new THREE.Group();
      const roots = data.nodes || [];
      for (const r of roots) group.add(build(r));

      // Blitz3D: left-handed, Y up. Mirror X so the rig faces the same way in three.js.
      group.scale.x = -1;

      const vh = data.bounds.max[1] - data.bounds.min[1];
      if (opts.height) {
        const k = opts.height / vh;
        group.scale.multiplyScalar(k);
      }
      if (opts.yaw !== undefined) group.rotation.y = opts.yaw;

      // drop the rig so its feet sit on y = 0 of the group's parent
      if (data.bounds.min[1] !== 0) {
        const lift = new THREE.Group();
        for (const c of group.children.slice()) lift.add(c);
        group.add(lift);
        lift.position.y = -data.bounds.min[1];
      }

      // ---- real animation clips ------------------------------------------
      // Every bone carries its own KEYS list in the .b3d; the game's Lua picks a
      // frame range and a speed (villager walk 0..40 @25 fps, head_nod 50..60,
      // head_shake 60..70; golem punch 80..90; dragon fly 0..20 @8). Frame
      // numbers here are the same index space the Lua uses.
      const T = {};
      for (const an of (data.anims || [])) {
        for (const nm in an.tracks) {
          const keys = an.tracks[nm];
          if (!T[nm] || keys.length > T[nm].f.length) {
            T[nm] = { f: keys.map(k => k[0]), p: keys.map(k => k[1]),
                      s: keys.map(k => k[2]), r: keys.map(k => k[3]) };
          }
        }
      }
      const _q1 = new THREE.Quaternion(), _q2 = new THREE.Quaternion();
      function keyAt(nm, f) {
        const tr = T[nm]; const n = tr.f.length;
        if (f <= tr.f[0]) return [0, 0, 0];
        if (f >= tr.f[n - 1]) return [n - 1, n - 1, 0];
        let lo = 0, hi = n - 1;
        while (hi - lo > 1) { const m = (lo + hi) >> 1; if (tr.f[m] <= f) lo = m; else hi = m; }
        const a = tr.f[lo], b = tr.f[hi];
        return [lo, hi, b === a ? 0 : (f - a) / (b - a)];
      }

      /* Pose every bone at `sec` seconds into the clip [from,to] advancing at
       * `speed` frames per second — the same contract as Luanti set_animation. */
      function poseAt(sec, from, to, speed, opts) {
        opts = opts || {};
        const span = Math.max(to - from, 1e-4);
        const f = from + ((sec * speed) % span);
        for (const nm in T) {
          const node = nodes[nm]; if (!node) continue;
          const tr = T[nm]; const [i, j, k] = keyAt(nm, f);
          const pi = tr.p[i], pj = tr.p[j];
          if (pi && pj) node.position.set(pi[0] + (pj[0] - pi[0]) * k,
                                          pi[1] + (pj[1] - pi[1]) * k,
                                          pi[2] + (pj[2] - pi[2]) * k);
          const si = tr.s[i], sj = tr.s[j];
          if (si && sj) node.scale.set(si[0] + (sj[0] - si[0]) * k,
                                       si[1] + (sj[1] - si[1]) * k,
                                       si[2] + (sj[2] - si[2]) * k);
          const ri = tr.r[i], rj = tr.r[j];
          if (ri && rj) {
            _q1.set(ri[1], ri[2], ri[3], ri[0]);
            _q2.set(rj[1], rj[2], rj[3], rj[0]);
            node.quaternion.copy(_q1).slerp(_q2, k);
          }
        }
      }

      /* Turn the head bone toward a world point (clamped), after posing. */
      function lookHead(target, yawMax, pitchMax) {
        // VoxeLibre mobs swivel on the 'head.control' bone, not 'head'
        const h = nodes['head.control'] || nodes.head || nodes.head2 || nodes.body;
        if (!h || !target) return;
        h.updateWorldMatrix(true, false);
        const wp = new THREE.Vector3(); h.getWorldPosition(wp);
        const d = target.clone().sub(wp);
        const yaw = Math.atan2(d.x, d.z) - Math.atan2(
          Math.sin(group.rotation.y), Math.cos(group.rotation.y));
        const pitch = -Math.atan2(d.y, Math.hypot(d.x, d.z));
        h.rotation.y = Math.max(-yawMax, Math.min(yawMax, yaw)) * -1;
        h.rotation.x = Math.max(-pitchMax, Math.min(pitchMax, pitch));
      }

      return { group, nodes, bounds: data.bounds, modelHeight: vh,
               mirror: -1, mat, poseAt, lookHead, frames: T,
               setTexture: async (u) => {
                 mat.map = await self.texture(u); mat.needsUpdate = true; } };
    }
  }

  /* Wooden-block helper: turn a 16x16 texture into the 6-material array three.js
   * wants for a BoxGeometry, reusing one THREE.Texture with different offsets. */
  function blockMaterials(THREE, tex, perFace) {
    const mk = (u0, v0) => {
      const t = tex.clone();
      t.needsUpdate = true;
      t.offset.set(u0, v0);
      t.repeat.set(1, 1);
      t.magFilter = THREE.NearestFilter;
      t.minFilter = THREE.NearestFilter;
      return new THREE.MeshLambertMaterial({ map: t, transparent: false });
    };
    // perFace: {top, bottom, side} texture objects, each of which may be a
    // single texture or an atlas with N tiles (u0 = tileIndex / N)
    const side = perFace.side, top = perFace.top || side, bot = perFace.bottom || side;
    const order = [0, 0, 2, 2, 1, 1];        // +x,-x,+y,-y,+z,-z -> side,side,top,bottom,side,side
    const src = [side, side, top, bot, side, side];
    return order.map((o, i) => {
      const t = src[i].clone();
      t.needsUpdate = true;
      t.magFilter = THREE.NearestFilter;
      t.minFilter = THREE.NearestFilter;
      t.wrapS = t.wrapT = THREE.RepeatWrapping;
      return new THREE.MeshLambertMaterial({ map: t });
    });
  }

  global.MCRig = MCRig;
  global.mcBlockMaterials = blockMaterials;
})(window);
