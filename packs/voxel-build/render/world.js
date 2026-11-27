/**
 * world.js — the primitives a story can build from, compiled to the kit's own node list.
 *
 * Why this exists: choosing a structure from a fixed list is a menu, and a menu is the weakest part of a look — it can
 * only make what someone already modelled. A story says "a gate with two towers"; this turns that into blocks out of the
 * same palette the kit uses, so the page draws a gate nobody modelled, with the textures, lighting and sweep it always
 * had. The lookup stays for speed: a named structure in the kit is still the cheapest thing to draw.
 *
 * Pure: no THREE, no DOM, no clock. Same parts in, same nodes out, in the same order — which is what lets a run be
 * re-rendered and compared byte for byte.
 *
 * Node format is the kit's own: [x, y, z, blockName, param2]. Blocks are 1×1×1, y = 0 is the ground plane.
 */

/** The part kinds this look understands. The portal checks against this list; an unknown kind is refused by name. */
export const PRIMITIVES = ["box", "walls", "roof", "cylinder", "stair", "path", "tree", "blocks"];

/**
 * Materials a part may name. Any block the installed map knows also works — this list is the ones that read as
 * architecture at a glance, and the page reports (rather than silently swaps) anything outside both.
 */
export const MATERIALS = [
  "mcl_core:stonebrick",
  "mcl_core:stonebrickcarved",
  "mcl_core:cobble",
  "mcl_core:mossycobble",
  "mcl_core:stone",
  "mcl_core:wood",
  "mcl_core:tree",
  "mcl_core:leaves",
  "mcl_core:glass",
  "mcl_core:brick_block",
  "mcl_core:sandstone",
  "mcl_core:dirt_with_grass",
  "mcl_wool:white_carpet",
  "mcl_wool:red_carpet",
  "mcl_stairs:stair_wood",
  "mcl_stairs:slab_wood",
  "mcl_stairs:slab_cobble",
  "mcl_walls:stonebrick_9",
  "mcl_walls:stonebrick_12",
  "mcl_torches:torch",
];

const FALLBACK_MATERIAL = "mcl_core:stonebrick";
const MAX_PARTS = 64;
const MAX_BLOCKS = 24000;
const LIMIT = 96; // blocks from the origin, any axis

const isNum = (v) => typeof v === "number" && Number.isFinite(v);
const int = (v, d) => (isNum(v) ? Math.round(v) : d);
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

/**
 * Compile a shot's parts to a kit node list.
 * Returns { size, nodes, notes, blocks }: `size` is the bounds the camera framing needs, `notes` is every decision the
 * page had to make on its own (unknown material, part outside the limit, too many blocks), so the run can say it out
 * loud instead of quietly drawing something else.
 */
export function compileParts(parts) {
  const nodes = new Map(); // "x,y,z" -> [x,y,z,name,param2]; later parts overwrite earlier ones, like placing blocks
  const notes = [];
  const put = (x, y, z, name, param2 = 0) => {
    if (!isNum(x) || !isNum(y) || !isNum(z)) return;
    const ix = Math.round(x), iy = Math.round(y), iz = Math.round(z);
    if (Math.abs(ix) > LIMIT || Math.abs(iy) > LIMIT || Math.abs(iz) > LIMIT) return;
    if (iy < 0) return;
    if (nodes.size >= MAX_BLOCKS) return;
    nodes.set(`${ix},${iy},${iz}`, [ix, iy, iz, name, param2]);
  };
  const mat = (p, at) => {
    const m = typeof p.material === "string" ? p.material.trim() : "";
    if (!m) return FALLBACK_MATERIAL;
    if (!MATERIALS.includes(m) && !/^[a-z0-9_]+:[a-z0-9_]+$/.test(m)) {
      notes.push(`${at}: material "${m}" is not a block name; drew ${FALLBACK_MATERIAL}`);
      return FALLBACK_MATERIAL;
    }
    return m;
  };

  if (!Array.isArray(parts)) return { size: [1, 1, 1], nodes: [], notes: ["no parts"], blocks: 0 };
  if (parts.length > MAX_PARTS) notes.push(`${parts.length} parts, only the first ${MAX_PARTS} drawn`);

  parts.slice(0, MAX_PARTS).forEach((part, i) => {
    const at = `part ${i + 1}${part && part.kind ? ` (${part.kind})` : ""}`;
    if (!part || typeof part !== "object") {
      notes.push(`${at}: not an object`);
      return;
    }
    const [ax, ay, az] = Array.isArray(part.at) ? part.at : [0, 0, 0];
    const ox = int(ax, 0), oy = int(ay, 0), oz = int(az, 0);
    const [w, h, d] = Array.isArray(part.size) ? part.size.map((n) => clamp(int(n, 1), 1, 48)) : [1, 1, 1];
    const m = mat(part, at);
    switch (part.kind) {
      case "box": {
        // Solid block of `size`, or hollow when it is a shell (walls + floor + roof left to other parts).
        const hollow = part.hollow === true;
        for (let x = 0; x < w; x++)
          for (let y = 0; y < h; y++)
            for (let z = 0; z < d; z++) {
              const edge = x === 0 || x === w - 1 || z === 0 || z === d - 1;
              if (hollow && !edge) continue;
              put(ox + x, oy + y, oz + z, m);
            }
        break;
      }
      case "walls": {
        // Perimeter, one block thick, with doorways and windows cut out: openings [{at:[x,y], w, h}] in local blocks.
        const openings = Array.isArray(part.openings) ? part.openings : [];
        const open = (x, y) =>
          openings.some((o) => {
            if (!o || !Array.isArray(o.at)) return false;
            const oa = Math.round(o.at[0]), ob = Math.round(o.at[1]);
            const ow = clamp(int(o.w, 1), 1, 12), oh = clamp(int(o.h, 1), 1, 12);
            return x >= oa && x < oa + ow && y >= ob && y < ob + oh;
          });
        for (let x = 0; x < w; x++)
          for (let y = 0; y < h; y++)
            for (let z = 0; z < d; z++) {
              const edge = x === 0 || x === w - 1 || z === 0 || z === d - 1;
              if (!edge) continue;
              // Doorways are cut on the front/side run: use z for the front wall, x for the sides.
              if (open(x, y) && (z === 0 || z === d - 1) && d > 1) continue;
              if (open(z, y) && (x === 0 || x === w - 1) && w > 1) continue;
              if (open(x, y) && d <= 1) continue;
              put(ox + x, oy + y, oz + z, m);
            }
        break;
      }
      case "roof": {
        // Gable: two slopes meeting at a ridge along x. Hip: steps in from both axes. Flat: one slab.
        const style = part.style === "hip" || part.style === "flat" ? part.style : "gable";
        const rise = clamp(int(part.rise, Math.max(2, Math.ceil(Math.min(w, d) / 2))), 1, 16);
        if (style === "flat") {
          for (let x = -1; x <= w; x++) for (let z = -1; z <= d; z++) put(ox + x, oy, oz + z, m);
          break;
        }
        if (style === "hip") {
          for (let k = 0; k < rise; k++) {
            const x0 = k, x1 = w - 1 - k, z0 = k, z1 = d - 1 - k;
            if (x0 > x1 || z0 > z1) break;
            for (let x = x0; x <= x1; x++) {
              put(ox + x, oy + k, oz + z0, m);
              put(ox + x, oy + k, oz + z1, m);
            }
            for (let z = z0; z <= z1; z++) {
              put(ox + x0, oy + k, oz + z, m);
              put(ox + x1, oy + k, oz + z, m);
            }
          }
          break;
        }
        for (let k = 0; k < rise; k++) {
          const z0 = k, z1 = d - 1 - k;
          if (z0 > z1) break;
          for (let x = 0; x < w; x++) {
            put(ox + x, oy + k, oz + z0, m);
            if (z1 !== z0) put(ox + x, oy + k, oz + z1, m);
          }
        }
        break;
      }
      case "cylinder": {
        // A tower: rings of blocks at a radius, hollow shell by default. Height comes as `height` (how a writer thinks
        // about a tower) or as size[1]; reading only one of them silently drew a one-block ring under a floating roof.
        const r = clamp(int(part.radius, 3), 1, 20);
        const tall = clamp(int(part.height, h), 1, 48);
        const hollow = part.hollow !== false;
        for (let y = 0; y < tall; y++)
          for (let x = -r; x <= r; x++)
            for (let z = -r; z <= r; z++) {
              const dd = Math.sqrt(x * x + z * z);
              if (dd > r + 0.35) continue;
              if (hollow && dd < r - 1) continue;
              put(ox + x, oy + y, oz + z, m);
            }
        break;
      }
      case "stair": {
        // A stepped run: step from the ground up to `rise` over `size[2]` blocks.
        const steps = clamp(int(part.rise, h), 1, 16);
        for (let z = 0; z < d; z++) {
          const top = Math.min(steps, 1 + Math.floor((z * steps) / Math.max(1, d - 1)));
          for (let y = 0; y < top; y++) for (let x = 0; x < w; x++) put(ox + x, oy + y, oz + z, m);
        }
        break;
      }
      case "path": {
        // A ground strip, one block thick, laid at y = 0.
        for (let x = 0; x < w; x++) for (let z = 0; z < d; z++) put(ox + x, 0, oz + z, m);
        break;
      }
      case "tree": {
        // Trunk and a blocky canopy; height is the trunk, the canopy grows over it.
        const trunk = clamp(int(part.rise, 4), 2, 14);
        const leaf = typeof part.leaf === "string" ? part.leaf : "mcl_core:leaves";
        for (let y = 0; y < trunk; y++) put(ox, oy + y, oz, m);
        for (let dx = -2; dx <= 2; dx++)
          for (let dz = -2; dz <= 2; dz++)
            for (let dy = 0; dy <= 2; dy++) {
              const dist = Math.abs(dx) + Math.abs(dz) + dy;
              if (dist > 3) continue;
              put(ox + dx, oy + trunk - 1 + dy, oz + dz, leaf);
            }
        break;
      }
      case "blocks": {
        // Escape hatch: the writer states nodes exactly as the kit stores them.
        const raw = Array.isArray(part.nodes) ? part.nodes : [];
        for (const n of raw) {
          if (!Array.isArray(n) || n.length < 4) continue;
          put(n[0], n[1], n[2], typeof n[3] === "string" ? n[3] : m, int(n[4], 0));
        }
        break;
      }
      default:
        notes.push(`${at}: unknown kind "${String(part.kind)}"; it can build ${PRIMITIVES.join(", ")}`);
    }
  });

  const list = [...nodes.values()].sort((a, b) => a[1] - b[1] || a[0] - b[0] || a[2] - b[2]);
  let maxX = 0, maxY = 0, maxZ = 0, minX = 0, minZ = 0;
  for (const [x, y, z] of list) {
    maxX = Math.max(maxX, x); maxY = Math.max(maxY, y); maxZ = Math.max(maxZ, z);
    minX = Math.min(minX, x); minZ = Math.min(minZ, z);
  }
  if (list.length === 0) notes.push("nothing was built: no part produced a block");
  return { size: [maxX - minX + 1, maxY + 1, maxZ - minZ + 1], nodes: list, notes, blocks: list.length };
}