# Handing a style over from Hermes to Muse

## Ringkasan untuk owner (Bahasa Indonesia)

- **Alurnya:** Hermes → repo `venstudio-styles` → Muse. Kalau sebuah gaya sudah jalan di Hermes dengan alatnya sendiri
  (three.js, Godot, Manim, Blender, library Python, dll.) dan owner suka hasil uji cobanya, Hermes membuka PR ke
  `venstudio-styles` berisi pack gaya itu (engine `command`) beserta **resep lingkungan** (`environment`) yang persis
  sama dengan yang Hermes pakai: versi dan sha256 setiap unduhan, lockfile npm, requirements pip dengan hash.
- **Tidak ada alat yang dibangun berdasarkan tebakan.** Alat baru hanya sampai ke worker lewat jalur ini.
- **CI membuktikan resepnya tanpa Hermes:** di runner Ubuntu yang bersih, sebagai user biasa (bukan root), worker yang
  di-vendor memasang resep itu dengan installer-nya sendiri, menjalankan probe, me-render fixture, lalu `check-video`
  mencocokkan hasilnya dengan `expect.json`. Resep yang gagal tidak bisa lolos CI, dan alasannya terlihat di PR.
- **Owner yang merge.** Itu satu-satunya titik kontrol. Setelah itu venstudio mem-vendor commit tersebut (CI-nya
  me-render lagi), owner merge, lalu worker Muse memperbarui diri lewat update bertanda tangan (Fase 0), memasang
  lingkungannya sendiri di sela job, menjalankan probe, dan baru melaporkan `env:<id>@<versi>` dan
  `pack:<id>@<versi>` setelah probe lolos. Instalasi yang gagal tampil di halaman Workers beserta alasannya dan dicoba
  lagi nanti; job lain tidak terganggu.
- **Resepnya deklaratif:** tidak ada shell bebas, tidak ada sudo/root, setiap unduhan wajib https + sha256, render
  dijalankan sebagai argv tetap dan tanpa jaringan (dipaksa lewat network namespace bila mesin mengizinkan; kalau
  tidak, setiap percobaan lewat proxy dicatat dan menggagalkan job).
- **Tidak boleh ada kredensial atau data pribadi** di dalam pack. Pack boleh tetap di `draft`, `lab` atau `trial`
  sampai owner memutuskan menaikkannya.

---

This document is written for **Hermes**, who opens the pull request. The checklist to load while working is
[hermes-handover-checklist.md](hermes-handover-checklist.md). The format is FORMAT.md ("Environments" and "Engine
command"); CONTRIBUTING.md has the flow and who may change what. The first pack made this way is
`packs/low-poly-shapes` (three.js 0.183.2 from npm, resvg 0.44.0 from its GitHub release): copy its shape.

## When to hand a style over

Hand a style over when all of these are true:

- It renders in Hermes with your own tools, from a script and plan like the studio's, without manual steps.
- The owner ran a trial of it (a research run of a hermes pack, or a clip you showed) and said they liked it.
- Every tool it needs can be installed **without root** on Ubuntu x86-64 from pinned files: a release archive or
  binary over https, npm packages from a lockfile, Python wheels from PyPI with hashes. If a tool needs a system
  package (`apt install`), name its library in `requires` (checked, never installed) and say so in the PR; the owner
  decides whether workers get it.
- It renders on a CPU in reasonable time: Muse has 2 vCPU, about 8 GB RAM, no GPU, outbound HTTPS only, and only
  `/home/hatch` persists. Measure it: `secondsPerVideoSecond` is the render's time limit.

Do not hand over a style that only works with a GPU, a desktop session, a licence key, a paid API or anything you
cannot pin. Keep it as a hermes research pack instead and tell the owner why.

## What the pull request contains

One directory, `packs/<id>/`, targeting `main`:

| File | What it is |
| --- | --- |
| `style.json` | The manifest: `renderer.engine: "command"`, `minWorkerVersion: "0.12.0"`, the `contract` (pacing, elements, motion tokens, captions, audio, assets) measured from your trials, `portal`, `workflow` (usually `image-sequence` with `plates-and-diagrams`), `provenance`, an empty or real `curation`, and the `environment`. `status: "draft"`. |
| `render/` | The render project: the scripts and scene files your render runs, text only. It reads `{props}` and writes `{out}`. No binaries (they are downloads in the recipe), no network, no clock or randomness that is not seeded from the props. |
| `env/` | `package.json` and `package-lock.json` for an npm step; `requirements.txt` with hashes for a pip step. |
| `environment` | The recipe **captured from what you actually ran**: the same versions and the same files. See below. |
| `fixtures/payload.json` | A render-video payload with `engine: "command"` and `scenePlan.template` equal to the pack id. Start from `packs/low-poly-shapes/fixtures/payload.json`. |
| `fixtures/expect.json` | What the render must measure: format, size, fps, duration, tolerance, QC gates. |
| `README.md` | What the look is, how it moves, and the sections `## Provenance` and `## Status`. |

The render's contract with the worker:

- argv placeholders: `{props}`, `{out}`, `{width}`, `{height}`, `{fps}`, `{frames}`, `{packDir}`, `{envDir}`,
  `{inDir}`, `{workDir}`. `argv[0]` is `node`, `python` (the recipe's venv), `ffmpeg` or `{envDir}/<binary>`.
- `{props}` is a JSON file: `width`, `height`, `fps`, `durationSec`, `totalFrames`, `shots` (`image` is a file name
  in `{inDir}`), `timeline`, `scenes` (with `start`, `startFrame`, `frames`, `elements`, `tokens`), `captionStyle`,
  `captions` only when your render draws them.
- `output: "png-frames"`: write exactly `{frames}` PNGs named `000000.png`, `000001.png`, ... into `{out}`, each at the
  job's size. `output: "mp4-muted"`: write one video file at `{out}`. The worker encodes, burns the captions
  (`captions: "worker"`), adds the narration and the mix, and runs QC. Print `frame N/M` lines if you want progress.
- The probe is a fixed argv too; make it fast (seconds), make it prove the real tools load and work, and print one
  line its `stdout` regular expression matches.

## Capturing exact versions and sha256

Record what Hermes really used, not what you think it used:

- **Release downloads.** Use the release asset Hermes installed. Take the sha256 and size from the file itself
  (`sha256sum file; stat -c %s file`), and cross-check with the GitHub API where it publishes one
  (`gh api repos/<owner>/<repo>/releases/tags/<tag> --jq '.assets[] | {name, size, digest}'`; older assets have no
  `digest`, then download through the API and hash it). Put the hash's source in the licence entry's `notes`.
- **npm.** Install with npm in an empty folder with only your dependencies (`npm install --save-exact <pkg>@<version>`),
  and ship the resulting `package.json` and `package-lock.json` (v3). Every entry carries `resolved` and `integrity`;
  `npm ci` refuses any tarball that does not match. Only production dependencies are installed.
- **pip.** Write `requirements.in` with exact pins, then `pip-compile --generate-hashes` (pip-tools) or
  `pip download --only-binary=:all: --no-deps` plus `pip hash` for each wheel. Every line is `name==version
  --hash=sha256:...`; wheels only, no options, no index other than PyPI. Note the Python version you used in `python`.
- **System libraries.** `ldd` the binaries you download and list any library they need that a minimal Ubuntu might
  lack in `requires` (`{ "tool": "lib", "name": "libfoo.so.1" }`), and the glibc version they need
  (`objdump -T <bin> | grep -o 'GLIBC_[0-9.]*' | sort -V | tail -1`).
- **Never invent a hash.** If you cannot get one in your environment, say so in the PR and leave the pack failing;
  do not copy a hash from memory or from an unrelated source.

## What CI checks

- `tools/validate.mjs`: the whole recipe (https only, exact hosts, sha256 and size on every download, size caps,
  relative paths without `..`, argv arrays with placeholders from the closed set, no shell or sudo or inline code, npm
  lockfile with integrity and no install scripts, pip lines with hashes and no options, a probe, licences), the
  render/ and env/ files, the fixture and the README.
- Job `environments`: on a clean Ubuntu runner, as a non-root user, the vendored worker runs `env-install` (the same
  installer a Muse worker runs), then the probe, then `render-command` with your fixture, then
  `tools/check-video.mjs` against `expect.json` (size, fps, duration, exact frame count). Downloads are cached by
  sha256 between runs.
- After the owner merges, venstudio's CI installs and renders the pack again through the real worker.

## Common rejections

- A download without `sha256` or `bytes`, over http, or from a host not in `hosts` (redirect hosts count too).
- A shell string instead of an argv, `bash -c`, `sudo`, `node -e`, `python -c`, or a program from the machine's PATH.
- A placeholder outside the closed set (`{home}`, `{token}`, ...), or an absolute path or `..` anywhere.
- `npm install` instead of a lockfile; a lockfile without `integrity`; install scripts without a reason.
- `pip` lines without `--hash`, with `-i`, `--extra-index-url`, `-e` or a URL; an sdist that needs a compiler.
- A render that reaches the network (fonts, CDNs, models, telemetry): vendor the file into the pack or the recipe.
- A render that is not deterministic, or whose frame count is not `{frames}`.
- A fixture that takes many minutes on CI's 4 CPUs (Muse has 2): shorten the fixture or simplify the render.
- Missing licences, or a licence that does not allow redistribution by download in a pack.
- A `ci-render` or `research-source` entry for a run that did not happen.

## Never in a pack

No credentials, tokens, API keys, cookies, signed URLs or private repository URLs; no owner or viewer data, uploads,
scripts of real videos, voices or faces; nothing copied from a source's frames or audio. The pack and everything it
downloads are public to every worker. If a tool needs a secret to install or run, it cannot be handed over.

## Status after merge

A handed-over pack starts at `draft`. It may move to `lab` with the `ci-render` entry of a real passing CI run, then to
`trial` for trial videos. It stays at `lab` or `trial` as long as the owner wants; only the owner promotes it to
`proven` or `listed`, through the record the portal's Styles page gives. Bump the pack's `version` with every change,
and the environment's `version` whenever a step changes.
