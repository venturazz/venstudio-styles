// Renders the job's frames: three.js projects a flat-shaded low-poly shape per scene (Projector, no WebGL), each frame
// becomes an SVG, and resvg (from the environment's download) rasterises it to <out>/000000.png and on. The worker then
// encodes the frames, burns the captions and adds the narration. Runs offline: it reads only the props, the job's
// inputs and the environment.
//
//   node render.mjs --props <props.json> --out <frames dir> --env <envDir> --in <inDir>
import { spawn } from "node:child_process";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { frameSvg, loadThree, sceneAt } from "./scene.mjs";

function arg(name) {
  const i = process.argv.indexOf(`--${name}`);
  if (i < 0 || !process.argv[i + 1]) throw new Error(`missing --${name}`);
  return process.argv[i + 1];
}

function run(cmd, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { stdio: ["ignore", "ignore", "pipe"] });
    let err = "";
    child.stderr.on("data", (d) => (err = (err + d).slice(-2000)));
    child.on("error", reject);
    child.on("close", (code) => (code === 0 ? resolve() : reject(new Error(`${path.basename(cmd)} exited ${code}: ${err.trim()}`))));
  });
}

const props = JSON.parse(await readFile(arg("props"), "utf8"));
const out = arg("out");
const envDir = arg("env");
const inDir = arg("in");
const resvg = path.join(envDir, "bin", "resvg");
const lib = await loadThree(envDir);
const svgDir = path.join(process.cwd(), "svg");
await mkdir(svgDir, { recursive: true });
await mkdir(out, { recursive: true });

const total = props.totalFrames;
const lanes = Math.max(1, Math.min(2, os.cpus().length));
let next = 0;
let done = 0;
async function lane() {
  for (;;) {
    const f = next++;
    if (f >= total) return;
    const shot = props.shots[sceneAt(props, f).index];
    const svg = path.join(svgDir, `${f}.svg`);
    await writeFile(svg, frameSvg(lib, props, f, { plate: shot?.image ?? null }));
    await run(resvg, ["--resources-dir", inDir, "-w", String(props.width), "-h", String(props.height), svg, path.join(out, `${String(f).padStart(6, "0")}.png`)]);
    await rm(svg);
    done++;
    if (done % props.fps === 0 || done === total) console.log(`frame ${done}/${total}`);
  }
}
await Promise.all(Array.from({ length: lanes }, lane));
await rm(svgDir, { recursive: true, force: true });
console.log(`rendered ${total} frames with three r${lib.THREE.REVISION}`);
