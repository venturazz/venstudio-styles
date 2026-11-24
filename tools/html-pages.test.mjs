/**
 * Runs every html-capture pack's page against its fixture in a small stand-in DOM, without a browser: the props are
 * the ones the worker builds (parseRenderSpec + buildHtmlCaptureProps from the worker copy), then init(props) and
 * renderFrame for every frame. It catches a page that throws, never answers the job's size, or writes NaN into the
 * picture. It proves nothing about pixels: the real capture runs in CI with Chrome Headless Shell (ci.yml) and in
 * venstudio's CI through render-video.
 *
 * The worker copy is runtime/html-capture/venstudio-worker.ts here and apps/worker/venstudio-worker.ts in venstudio
 * (which vendors tools/ only); the test is skipped when neither exists or Node cannot load TypeScript.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const WORKER = [path.join(ROOT, "runtime/html-capture/venstudio-worker.ts"), path.join(ROOT, "../apps/worker/venstudio-worker.ts")].find((p) => existsSync(p));
let worker = null;
let why = WORKER ? null : "no copy of the worker next to the packs";
if (WORKER) {
  try {
    worker = await import(pathToFileURL(WORKER).href);
  } catch (err) {
    why = `the worker could not be loaded here (${String(err.message).slice(0, 120)})`;
  }
}

/** Enough of the DOM for a page that builds SVG and sets attributes, styles and text. */
class FakeNode {
  constructor(tag) {
    this.tagName = tag;
    this.attrs = {};
    this.children = [];
    this.style = {};
    this.textContent = "";
    this.className = "";
    const self = this;
    this.classList = {
      add: (c) => (self.className = `${self.className} ${c}`.trim()),
      toggle: (c, on) => (on === false ? (self.className = self.className.split(" ").filter((x) => x !== c).join(" ")) : self.classList.add(c)),
      contains: (c) => self.className.split(" ").includes(c),
    };
  }
  setAttribute(k, v) {
    this.attrs[k] = String(v);
    if (k === "class") this.className = String(v);
  }
  decode() {
    return Promise.resolve();
  }
  getAttribute(k) {
    return this.attrs[k] ?? null;
  }
  appendChild(n) {
    this.children.push(n);
    return n;
  }
  *walk() {
    yield this;
    for (const c of this.children) yield* c.walk();
  }
  querySelector(sel) {
    const cls = sel.replace(/^\./, "");
    for (const n of this.walk()) if (n !== this && n.className.split(" ").includes(cls)) return n;
    return null;
  }
  /** A path's points as a polyline (control points included): close enough for length and position. */
  points() {
    const nums = (this.attrs.d ?? "").match(/-?\d+(\.\d+)?/g)?.map(Number) ?? [];
    const pts = [];
    for (let i = 0; i + 1 < nums.length; i += 2) pts.push([nums[i], nums[i + 1]]);
    return pts;
  }
  getTotalLength() {
    const p = this.points();
    let l = 0;
    for (let i = 1; i < p.length; i++) l += Math.hypot(p[i][0] - p[i - 1][0], p[i][1] - p[i - 1][1]);
    return l;
  }
  getPointAtLength(at) {
    const p = this.points();
    let left = at;
    for (let i = 1; i < p.length; i++) {
      const seg = Math.hypot(p[i][0] - p[i - 1][0], p[i][1] - p[i - 1][1]);
      if (left <= seg && seg > 0) return { x: p[i - 1][0] + ((p[i][0] - p[i - 1][0]) * left) / seg, y: p[i - 1][1] + ((p[i][1] - p[i - 1][1]) * left) / seg };
      left -= seg;
    }
    const e = p[p.length - 1] ?? [0, 0];
    return { x: e[0], y: e[1] };
  }
}

function loadPage(packDir) {
  const render = path.join(packDir, "render");
  const html = readFileSync(path.join(render, "index.html"), "utf8");
  // Scripts in page order: files (<script src>) and inline blocks (an html-design page keeps its JS inline).
  const scripts = [...html.matchAll(/<script(?: src="([^"]+)")?>([\s\S]*?)<\/script>/g)].map((m) => (m[1] ? { file: m[1] } : { inline: m[2] }));
  const nodes = { stage: new FakeNode("main"), root: new FakeNode("div") };
  nodes.stage.appendChild(nodes.root);
  const document = {
    getElementById: (id) => nodes[id] ?? null,
    createElement: (t) => new FakeNode(t),
    createElementNS: (_ns, t) => new FakeNode(t),
    fonts: { load: async () => [], add: () => {}, ready: Promise.resolve() },
  };
  class FontFace {
    load() {
      return Promise.resolve(this);
    }
  }
  const ctx = { document, console, Math, Promise, Object, Array, Number, String, JSON, FontFace };
  ctx.window = ctx;
  vm.createContext(ctx);
  for (const s of scripts) {
    if (s.file) vm.runInContext(readFileSync(path.join(render, s.file), "utf8"), ctx, { filename: s.file });
    else if (s.inline.trim()) vm.runInContext(s.inline, ctx, { filename: "index.html (inline)" });
  }
  // Pages draw into #stage (or into #root inside it); walk the whole stage.
  return { ctx, root: nodes.stage, inner: nodes.root };
}

function htmlPacks() {
  const dir = path.join(ROOT, "packs");
  return readdirSync(dir)
    .filter((id) => existsSync(path.join(dir, id, "render/index.html")))
    .map((id) => ({ id, dir: path.join(dir, id), style: JSON.parse(readFileSync(path.join(dir, id, "style.json"), "utf8")) }))
    .filter((p) => p.style.renderer?.engine === "html-capture");
}

async function render(pack, mutate) {
  const raw = JSON.parse(readFileSync(path.join(pack.dir, "fixtures/payload.json"), "utf8"));
  if (mutate) mutate(raw);
  const spec = worker.parseRenderSpec(worker.withPlaceholderUuids(raw));
  const props = worker.buildHtmlCaptureProps(spec, { images: spec.shots.map((_, i) => `../in/shot-${i}.png`), font: null, drawsCaptions: pack.style.renderer.drawsCaptions === true });
  const { ctx, root: stage, inner } = loadPage(pack.dir);
  const got = await ctx.VENSTUDIO.init(JSON.parse(JSON.stringify(props)));
  const root = inner.children.length > 0 ? inner : stage;
  assert.deepEqual({ ...got }, { totalFrames: props.totalFrames, fps: props.fps, width: props.width, height: props.height }, `${pack.id}: init answers the job's size, fps and frame count`);
  const seen = new Map();
  for (let f = 0; f < props.totalFrames; f++) {
    ctx.VENSTUDIO.renderFrame(f);
    for (const n of root.walk()) {
      const values = [...Object.values(n.attrs), ...Object.values(n.style), n.textContent];
      for (const v of values) assert.ok(!/NaN|undefined|Infinity/.test(String(v)), `${pack.id}: frame ${f} wrote "${String(v).slice(0, 80)}" on <${n.tagName}>`);
    }
    if (f === props.totalFrames - 1 || props.timeline.startFrames.includes(f + 1)) seen.set(f, root);
  }
  return { ctx, root, props };
}

const texts = (root) => [...root.walk()].map((n) => n.textContent).filter(Boolean);

test("every html-capture page renders its fixture in a stand-in DOM: init answers the size, no frame throws or writes NaN", { skip: why ?? false }, async () => {
  const packs = htmlPacks();
  assert.ok(packs.length >= 1);
  for (const p of packs) await render(p);
});

test("line-graph draws from the payload: the count lands on the value, a scene without numbers shows none", { skip: why ?? false }, async () => {
  const pack = htmlPacks().find((p) => p.id === "line-graph");
  assert.ok(pack);
  const { ctx, root } = await render(pack);
  const g = ctx.VSGraph;
  assert.deepEqual({ ...g.sceneData({ elements: [{ kind: "bar", series: [1, 2, 4], value: 4000 }] }) }.kind, "graph");
  assert.equal(g.sceneData({ elements: [{ kind: "bar", series: [1, -2, 4] }] }).kind, "neutral", "a negative point cannot be drawn on this graph, and nothing is made up instead");
  assert.equal(g.sceneData({ elements: [{ kind: "counter", value: 12 }] }).kind, "count");
  assert.equal(g.sceneData({ elements: [{ kind: "heading", text: "Hello" }, { kind: "plate" }] }).kind, "neutral");
  assert.equal(g.fmt(4400, 0), "4,400");
  assert.equal(g.fmt(-1234.5, 1), "-1,234.5");
  const shown = texts(root);
  // The last frame of the whole video is the neutral scene; earlier scenes keep their final state.
  assert.ok(shown.includes("4,400"), `the graph lands on the element's value (shown: ${shown.join(" | ")})`);
  assert.ok(shown.includes("37"), "the counter lands on its value");
  assert.ok(shown.includes("Open late on Thursdays"));
  const neutral = root.children[2];
  assert.ok(!texts(neutral).some((t) => /\d/.test(t)), "the neutral scene shows no number");
});

test("minimal-line-art: one step per value, the neutral motif without data, the caption drawn as the one line", { skip: why ?? false }, async () => {
  const pack = htmlPacks().find((p) => p.id === "minimal-line-art");
  assert.ok(pack);
  assert.equal(pack.style.renderer.drawsCaptions, true);
  const { ctx, root, props } = await render(pack);
  const s = ctx.VSSteps;
  assert.deepEqual([...s.sceneSteps({ elements: [{ kind: "bar", series: [2, 4] }] }).heights], [0.5, 1]);
  assert.equal(s.sceneSteps({ elements: [{ kind: "bar", series: [2, 4, 1, 1, 1, 1, 1] }] }).fromData, false, "more than 6 values: the neutral motif");
  assert.equal(s.sceneSteps({ elements: [{ kind: "heading", text: "x" }] }).heights.length, 5);
  // The skill's own number: 5 steps reach the top at 2.2 s and last 3.8 s.
  assert.deepEqual({ ...s.timing(5) }, { step: 0.4, payoff: 2.2, natural: 3.8000000000000003 });
  const rects = (sceneIndex) => [...root.children[sceneIndex].walk()].filter((n) => n.tagName === "rect");
  assert.equal(rects(0).length, 5);
  assert.equal(rects(1).length, 3);
  const cap = root.children.find((n) => n.className === "cap");
  assert.equal(cap.textContent, props.captions[props.captions.length - 1].text);
  ctx.VENSTUDIO.renderFrame(0);
  assert.equal(cap.textContent, props.captions[0].text);
});
