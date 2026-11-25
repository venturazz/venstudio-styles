import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { checkPack } from "./style-check.mjs";

const has = (issues, code) => issues.some((i) => i.code === code);

/** A pack built in a temp dir: style.json shaped enough for the check, a fixture pair, and a render. */
function pack({ style = {}, payloads = [["payload.json", 2, 8]], render = "import json\nprops = json.load(open('p'))\n" } = {}) {
  const dir = mkdtempSync(join(tmpdir(), "style-check-"));
  mkdirSync(join(dir, "fixtures"));
  writeFileSync(join(dir, "style.json"), JSON.stringify({
    id: "demo", status: "draft", family: "explainer",
    renderer: { engine: "command" },
    contract: { pacing: { shotSeconds: [2, 4], cutsPerMinute: [15, 30] } },
    ...style,
  }));
  for (const [name, scenes, seconds] of payloads) {
    writeFileSync(join(dir, "fixtures", name), JSON.stringify({
      durationSec: seconds,
      scenes: Array.from({ length: scenes }, (_, i) => ({ shotRef: `shot-0${i}`, seconds: seconds / scenes })),
    }));
  }
  if (render !== null) {
    mkdirSync(join(dir, "render"));
    writeFileSync(join(dir, "render", "frames.py"), render);
  }
  return dir;
}

test("a pack that reads props and carries two differently shaped fixtures is a style", () => {
  const r = checkPack(pack({ payloads: [["payload.json", 2, 8], ["payload-alt.json", 5, 21]] }));
  assert.deepEqual(r.issues.filter((i) => i.level === "fail"), []);
});

test("copy that also sits in the render is a script, not a request", () => {
  const dir = pack({ render: 'props = 1\nHEADING = "The machine was bought with the prize money."\n' });
  writeFileSync(join(dir, "fixtures", "payload.json"), JSON.stringify({
    durationSec: 8, scenes: [{ shotRef: "s1", seconds: 8, elements: [{ kind: "heading", text: "The machine was bought with the prize money." }] }],
  }));
  writeFileSync(join(dir, "fixtures", "payload-alt.json"), JSON.stringify({ durationSec: 21, scenes: [{}, {}, {}] }));
  assert.ok(has(checkPack(dir).issues, "copy-in-code"));
});

test("one fixture proves nothing; the same shape twice proves nothing either", () => {
  assert.ok(has(checkPack(pack({ payloads: [["payload.json", 3, 12]] })).issues, "one-fixture"));
  assert.ok(has(checkPack(pack({ payloads: [["payload.json", 3, 12], ["payload-alt.json", 3, 12]] })).issues, "same-shape"));
});

test("a render that never reads the payload, or a contract with no room, fails", () => {
  assert.ok(has(checkPack(pack({ render: "print('hello')\n" })).issues, "no-input"));
  const r = checkPack(pack({ style: { contract: { pacing: { shotSeconds: [4, 4], cutsPerMinute: [20, 20] } } } }));
  assert.ok(has(r.issues, "pinned-shot-seconds"));
  assert.ok(has(r.issues, "pinned-cuts"));
});

test("a Hermes pack is checked at its brief, since it has no render of its own", () => {
  const dir = pack({ render: null, style: { renderer: { engine: "hermes" }, hermes: { skill: "/x", input: { mode: "spec" } } } });
  assert.ok(has(checkPack(dir).issues, "brief-unbound"));
});