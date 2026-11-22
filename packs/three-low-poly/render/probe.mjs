// The environment's probe: three.js loads from the npm step, its Projector draws one frame of a tiny scene, and the
// downloaded resvg rasterises it to a PNG of the right size. Prints "ok three r<rev> resvg <version>" on success.
//
//   node probe.mjs --env <envDir> --work <scratch dir>
import { spawnSync } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { frameSvg, loadThree } from "./scene.mjs";

function arg(name) {
  const i = process.argv.indexOf(`--${name}`);
  if (i < 0 || !process.argv[i + 1]) throw new Error(`missing --${name}`);
  return process.argv[i + 1];
}

const envDir = arg("env");
const work = arg("work");
await mkdir(work, { recursive: true });
const lib = await loadThree(envDir);
const props = { width: 64, height: 96, fps: 1, totalFrames: 1, scenes: [{ start: 0, seconds: 1, tokens: ["drift"] }], shots: [] };
const svg = frameSvg(lib, props, 0);
if (!svg.includes("<polygon")) throw new Error("three.js projected no face");
const svgFile = path.join(work, "probe.svg");
const pngFile = path.join(work, "probe.png");
await writeFile(svgFile, svg);
const resvg = path.join(envDir, "bin", "resvg");
const r = spawnSync(resvg, ["-w", "64", "-h", "96", svgFile, pngFile], { encoding: "utf8", timeout: 30_000 });
if (r.status !== 0) throw new Error(`resvg failed: ${r.error?.message ?? r.stderr}`);
const png = await readFile(pngFile);
if (png.readUInt32BE(0) !== 0x89504e47 || png.readUInt32BE(16) !== 64 || png.readUInt32BE(20) !== 96) throw new Error("resvg wrote no 64x96 PNG");
const v = spawnSync(resvg, ["--version"], { encoding: "utf8", timeout: 10_000 });
console.log(`ok three r${lib.THREE.REVISION} resvg ${String(v.stdout).trim()}`);
