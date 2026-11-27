// The primitives a story builds from: shape and bounds, never subject. A gate is nobody's kit model, which is the point.
import test from "node:test";
import assert from "node:assert/strict";
import { compileParts, PRIMITIVES, MATERIALS } from "../packs/voxel-build/render/world.js";

const gate = [
  { kind: "walls", at: [1, 0, 0], size: [11, 7, 3], material: "mcl_core:stonebrick", openings: [{ at: [4, 0], w: 2, h: 4 }] },
  { kind: "roof", at: [0, 7, 0], size: [13, 3], style: "gable", rise: 3, material: "mcl_core:wood" },
  { kind: "cylinder", at: [0, 0, 0], radius: 2, height: 12, material: "mcl_core:cobble" },
  { kind: "roof", at: [0, 12, 0], size: [5, 5], style: "hip", rise: 3, material: "mcl_core:wood" },
  { kind: "cylinder", at: [12, 0, 0], radius: 2, height: 12, material: "mcl_core:cobble" },
  { kind: "roof", at: [12, 12, 0], size: [5, 5], style: "hip", rise: 3, material: "mcl_core:wood" },
];

const has = (nodes, x, y, z) => nodes.some((n) => n[0] === x && n[1] === y && n[2] === z);

test("a gate nobody modelled is built from parts, with a doorway through it", () => {
  const built = compileParts(gate);
  assert.ok(built.blocks > 300, `expected a real gate, got ${built.blocks} blocks`);
  // The opening is cut through the front wall and the back wall: no block anywhere in the 2×4 slot.
  for (const x of [5, 6]) for (let y = 0; y < 4; y++) for (const z of [0, 1, 2]) assert.equal(has(built.nodes, x, y, z), false, `(${x},${y},${z}) should be open`);
  assert.equal(has(built.nodes, 4, 0, 0), true, "the wall beside the doorway stands");
  // Towers are shells: the rim is placed, the middle of the tower is not.
  assert.equal(has(built.nodes, 2, 5, 0), true);
  assert.equal(has(built.nodes, 0, 5, 0), false);
  // Size is what the camera frames: tall enough for two 12-block towers under 3-block roofs.
  assert.ok(built.size[1] >= 15, `height ${built.size[1]}`);
});

test("the same parts compile to the same blocks, in the same order, every time", () => {
  assert.equal(JSON.stringify(compileParts(gate)), JSON.stringify(compileParts(structuredClone(gate))));
});

test("a material the map does not know is swapped and said out loud, not hidden", () => {
  const built = compileParts([{ kind: "box", at: [0, 0, 0], size: [2, 2, 2], material: "stone" }]);
  assert.ok(built.notes.some((n) => /material "stone" is not a block name/.test(n)), built.notes.join(" | "));
  assert.ok(built.nodes.every((n) => n[3] === "mcl_core:stonebrick"));
});

test("an unknown kind is refused by name, and the list is the primitives", () => {
  const built = compileParts([{ kind: "space-elevator" }]);
  const note = built.notes.join(" | ");
  assert.match(note, /unknown kind "space-elevator"/);
  for (const p of PRIMITIVES) assert.ok(note.includes(p), `${p} missing from ${note}`);
  assert.ok(!built.notes.some((n) => /material/.test(n)), "a kind note is not a material note");
});

test("parts stay inside the block budget and the world limit", () => {
  const huge = compileParts([{ kind: "box", at: [0, 0, 0], size: [48, 48, 48], material: MATERIALS[0] }]);
  assert.ok(huge.blocks <= 24000, `${huge.blocks} blocks`);
  const far = compileParts([{ kind: "box", at: [500, 0, 0], size: [2, 2, 2] }]);
  assert.equal(far.nodes.some((n) => n[0] > 96), false, "nothing lands past the limit");
});

test("every kind makes blocks and reports its bound size", () => {
  for (const part of [
    { kind: "box", at: [0, 0, 0], size: [3, 3, 3] },
    { kind: "walls", at: [0, 0, 0], size: [4, 3, 4] },
    { kind: "roof", at: [0, 0, 0], size: [4, 4], rise: 2 },
    { kind: "cylinder", at: [0, 0, 0], radius: 3, height: 4 },
    { kind: "stair", at: [0, 0, 0], size: [3, 1, 5], rise: 4 },
    { kind: "path", at: [0, 0, 0], size: [3, 1, 3] },
    { kind: "tree", at: [0, 0, 0], rise: 4 },
    { kind: "blocks", nodes: [[0, 0, 0, "mcl_core:stone"], [1, 0, 0, "mcl_core:stone"]] },
  ]) {
    const built = compileParts([part]);
    assert.ok(built.blocks > 0, `${part.kind} made nothing`);
    assert.deepEqual(built.notes, [], `${part.kind}: ${built.notes.join(" | ")}`);
    assert.ok(built.size.every((n) => n >= 1), `${part.kind} size ${built.size}`);
  }
});