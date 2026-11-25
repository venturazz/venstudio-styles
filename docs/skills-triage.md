# Which Hermes video skills can reach a worker

A triage of the video skills in the Hermes profile (`skills/creative`, `skills/media`) against what a Muse worker can
actually run, so the owner can see which of them can become a pack, which stay research only, and what the first
conversions should be. Written after auditing the library on 24 November 2026.

## Ringkasan untuk owner (Bahasa Indonesia)

- **Masalahnya bukan skill-nya, tapi enginenya.** Dari 23 pack sebelum PR ini, 11 ber-engine `hermes` — dan `hermes`
  secara aturan owner tidak boleh naik di atas `trial`. Jadi separuh library tidak akan pernah bisa jadi `proven` atau
  `listed`, sebanyak apa pun video bagus yang dihasilkannya. Hanya `command`, `html-capture`, `remotion-2d` dan
  `ffmpeg-stills` yang bisa dirender worker.
- **Skill kita yang sudah teruji justru yang paling mudah dipindah.** Yang benar-benar dipakai produksi di mesin ini:
  Dafiology/ChikooTale (20+ episode), Godot sprite film (Malin, Hedge), low-poly station (15 klip), Roblox kit (12
  klip), three.js (13 klip), POV page (2 klip). Semuanya CPU-only — tidak ada yang butuh GPU.
- **PR ini mengerjakan satu di antaranya sampai selesai** sebagai bukti: `packs/full-frame`, engine `command`,
  Pillow + font DejaVu yang di-pin sha256, fixture 12 detik yang benar-benar dirender di sini (360 frame, mp4 lolos
  `check-video`). Sisanya masuk antrean konversi di bawah, sudah diperiksa engine-nya satu per satu.
- **Yang tidak bisa:** semua yang butuh model (gambar/video provider, TTS berbayar) tetap `hermes`; Godot butuh
  X server + library sistem (keputusan owner). Dari 11 skill claude-animation-skills, 4 memakai GSAP (lisensinya belum
  disetujui) dan 4 memakai three.js (bisa, asal three di-vendor dan font-nya di-base64 — worker sudah menyalakan
  SwiftShader); `/minecraft` termasuk yang three.js, jadi **bukan** terkena blokir GSAP.

## What "teruji" means in this document

A skill counts as tested when there is a real render from it on this machine — not a description of one. Evidence
below is counted from the artifacts on disk (`mp4` files and their folders), so the numbers are checkable:

| Evidence on this box | Skill / engine it came from |
| --- | --- |
| `/opt/data/ep01_robotfist` 20 mp4 (EP21–EP23, 15–19 Nov), `/opt/data/ep01_mrfeast` 2 mp4, `/opt/data/dafiology` 27 mp4 | ChikooTale engine, PIL frames → `skills/creative/flat-vector-explainer-video`, `stickman-chikoomollian` |
| `/opt/data/godot_film` 19 mp4, `/opt/data/godot_hedge` 11 mp4, `/opt/data/shorts/hedge_godot*` | `godot-sprite-film`, `sprite-video-production` |
| `/opt/data/lowpoly_kunti` 15 mp4 | `low-poly-station-short` |
| `/opt/data/three_spike` 13 mp4 | `threejs-3d-short` |
| `/opt/data/robloxkit-remotion` 12 mp4, `/opt/data/robloxkit` 12 mp4 | `roblox-kit-remotion`, `roblox-kit-threejs` |
| `/opt/data/povquake` 2 mp4 (plus its frame dumps) | `pov-html-engine-capture` |
| `/opt/data/cartoon3d` 27 mp4 | `cartoon-3d-short`, `godot-toon-3d-short` |

Everything else in `skills/creative` and `skills/media` is either a technique library (no render of its own) or an
analysis tool. Those are not style packs at all and should not be given one.

## The library as it stands

- 24 packs: 21 `trial`, 2 `lab`, 1 `draft`; **0 `proven`, 0 `listed`**.
- By engine: 11 `hermes`, 6 `ffmpeg-stills`, 4 `html-capture`, 1 `remotion-2d`, 2 `command`.
- 11 skills in `skills/candidate/` (the claude-animation-skills import), 0 in `skills/curated/`.

The consequence is arithmetic: an `hermes` pack is capped at `trial` by `tools/validate.mjs`, so the 11 packs that
carry the imported skills can never be promoted, and no imported skill can be curated on the strength of its own pack.
Adding more `hermes` packs, however good the videos look, does not change that. The only way up is a worker engine.

## Triage: what each video skill should become

Engine names are the ones the worker can run today. "Deterministic half" is the part that moves into `render/`; the
rest becomes input the studio supplies (stills, script, timings).

| Skill | What it emits | Tested here | Worker engine it fits | Next step |
| --- | --- | --- | --- | --- |
| `flat-vector-explainer-video` | Dafiology full-frame: plate, push, HUD readout, tag, hook | yes (20+ eps) | `command` (PIL) | **done in this PR** as `full-frame` (label: Puppet) |
| `stickman-chikoomollian` | same engine, stick-figure cast | yes (same runs) | `command` (PIL) | second pack, reusing `dafiology-pillow` |
| `pov-html-engine-capture` | one HTML page, `renderFrame(i)` at 9:16 | yes (2 clips) | `html-capture` | port `povquake/index.html` as `render/index.html` |
| `low-poly-station-short` | per-shot spec → 3D plate + painted HUD, headless Chromium | yes (15 clips) | `html-capture` | page already exists (`lowpoly_kunti/engine`), needs `window.VENSTUDIO` |
| `threejs-3d-short` | data program + `renderFrame(i)`, no GPU | yes (13 clips) | `html-capture` | same shape as above; vendor three as text `.js` |
| `roblox-kit-remotion` | Remotion + R3F compositions | yes (12 clips) | `remotion-2d` | the only heap of work: `src/packs/<id>/`, runtime already vendored |
| `roblox-kit-threejs` / `roblox-kit-hybrid` | three.js kit scenes | yes (12 clips) | `html-capture` | after `threejs-3d-short` |
| `godot-sprite-film` | Godot `--write-movie` + narration | yes (30 clips) | `command` + X | proved on this host with the arm64 build; CI needs the x64 build pinned |
| `godot-toon-3d-short` | Godot toon 3D | yes (27 clips incl. cartoon3d) | `command` + X | same environment, heavier scenes |
| `sprite-video-production` | sprite sheets → Godot film + short | yes | `hermes` (it drives Godot + models) | keep research; its render half is `godot-sprite-film` |
| `cartoon-3d-short` | image-per-shot + ffmpeg moves | yes (27 clips) | `ffmpeg-stills` (already) | already covered by 6 stills packs; no new pack |
| `narrated-video-from-images` | stills + narration | yes | `ffmpeg-stills` | already the 6 stills packs |
| `long-form-narrated-video`, `agnes-character-video-shorts`, `ai-video-generation`, `restyle-film-cast` | provider images/video + voice | partly | `hermes` only | research: paid or model-in-loop, never in a pack |
| `manim-video` | Manim CE scenes | no recent render | `command` with cairo/pango, else `hermes` | text-only scope, or name the libs and let the owner decide |
| `ascii-video` | ffmpeg + Python ASCII frames | not counted | `command` | cheap second `command` pack; needs numpy too |
| `claude-animation-skills` — the four three.js templates (`/minecraft`, `/low-poly`, `/map-route`, `/breakdown`) | one page, spec JSON in, `renderFrame(i)`, WebGL | upstream only, never rendered here | `html-capture` | three vendored as text `.js`, the `.woff2` font as base64 in a `.css`, WebGL on SwiftShader (the worker enables it). Cheapest of the imports: `voxel-build` (formerly `hermes-minecraft`) already carries the spec |
| `claude-animation-skills` — the four GSAP templates (`/dan-koe`, `/graph`, `/minimalistic-graphics`, `/kurzgesagt`) | a paused GSAP timeline seeked per frame | upstream only | `html-capture` | **blocked: GSAP licence** (owner decision) |
| `p5js` | a sketch page drawing frame N | partly | `html-capture` | same shape as the three.js route, after it |
| `video-forensics`, `short-form-video-qa`, `video-continuity-rhythm`, `look-match-study`, `songsee`, `audio-stem-separation`, `gif-search` | analysis / QC / assets, no look | n/a | none | not packs; they are tools a run or the owner uses |
| `viral-video-engagement`, `anime-short-story-order`, `songwriting-and-ai-music`, `humanizer`, `avoid-ai-writing` | writing rules, no render | n/a | none | keep as skills; they inform briefs, not pixels |

## The three conversion queues, in order of value

**Queue A — `html-capture` (cheapest, highest return).** `pov-html-engine-capture`, `low-poly-station-short`,
`threejs-3d-short`, then the two Roblox three.js kits; then the four three.js templates of the import, `/minecraft`
first: `voxel-build` (formerly `hermes-minecraft`) already describes the spec it needs, and the page exists. These already are "one page + `renderFrame(i)`" on a headless
Chromium with SwiftShader; the worker has exactly that page server, virtual clock and caption burn. Each needs: the page
moved into `render/`, a `VENSTUDIO.init(props)` that reads the scene plan, `renderFrame(f)`, fonts vendored as base64 in
a `.css` (no `.woff2`: html-capture takes text files only), three vendored as `render/vendor/three/three.min.js` plus
its MIT `LICENSE`, a fixture payload and `drawsCaptions`.

**Queue B — `command` (a new tool only the worker's recipe can supply).** Dafiology in this PR. Next: `stickman`, which
reuses the same environment, then `ascii-video` (adds numpy to the requirements file).

**Queue C — `remotion-2d`.** `roblox-kit-remotion` is the only proven look on the Remotion path, and the runtime
(`runtime/remotion`) is vendored. It is the biggest port and the least urgent: the same story already renders on the
three.js kit.

**Godot (deferred).** A `command` pack could run Godot headless, but `--write-movie` needs an X server, and the worker
installs no system packages by design: it would take `Xvfb`, `libGL`, `libX11` in `requires` and a pinned Godot
linux-x64 build. That is an owner decision, not a handover.

## What this PR does, and what it does not

- Adds `packs/full-frame` (engine `command`, `lab`): the frame loop of the engine that rendered EP21–EP23,
  plates only, with the chip, the tag and the hook. Environment `dafiology-pillow` pins Pillow 11.3.0 (six wheel
  hashes) and DejaVu 2.37 (sha256 + byte size); probe proves text shaping; render argv is the shape `low-poly-shapes`
  proved.
- Adds this document and the two pack-id lines its tests expect.
- Claims exactly one thing beyond the code: CI run 45314894968 installed the environment on a clean runner, rendered
  the fixture and passed `check-video`, which is the `ci-render` entry that takes the pack to `lab`. No Muse trial, no
  `owner-review`: nothing here has run on a worker.
- Does **not** touch the 11 `hermes` packs: changing their engine needs the converted page first, and GSAP's licence is
  the owner's call.

## Adding the next one

1. Pick the skill and write down its **deterministic half**: what reads a plan and draws frame N.
2. Decide the engine from `references/engine-fit.md` of `venstudio-style-pack-handover`: page + frame number →
   `html-capture`; code that draws frames with a library the worker cannot have → `command` + an `environment`.
3. Keep the contract as tight as the render can reach: a looser contract lets the planner produce renders the code
   cannot honour, a tighter one fails QC.
4. Measure `secondsPerVideoSecond` on the target hardware, and the peak disk (this pack: ~66 MB per second of video at
   1080×1920, because PNG frames of photo plates are ~2.2 MB each).
5. Render the fixture locally first, `check-video` it, then let CI install the environment as a non-root user.
## The conversion queue after 25 November

`voxel-build` (Minecraft) and `blocky-story` (Roblox) now render on a worker with `html-capture` and have CI render
evidence; the rest of the library is queued in the order below. The pattern is the same one those two established, so the
cost per look is mostly the asset adapter, not the engine:

| Skill | Style id | Engine | State | What is missing |
| --- | --- | --- | --- | --- |
| `roblox-kit-threejs` / `-remotion` / `-hybrid` | `blocky-story` | `html-capture` | pack `draft`, fixture renders on this host | CI render, then `lab`; the three kit exports still live only on this box |
| `threejs-3d-short` | `3d-film` | `html-capture` | next | its page needs the `VENSTUDIO` contract and the scene spec folded into props; 13 clips of evidence exist |
| `pov-html-engine-capture` | `pov-short` | `html-capture` | next | same adapter as above; the page already draws one frame per request |
| `low-poly-station-short` | `transit-station` | `command` | queue | a Python renderer with a 15-clip history: needs a pinned environment (numpy/pillow) and a fixture |
| `godot-sprite-film` | `sprite-film` | `command` | next, unblocked | **Correction: it was proved on this host.** Godot 4.3 stable arm64 + a user-space Xvfb on `:77` + Mesa llvmpipe (`/opt/data/local/godot_env.sh`) rendered a 227 s 1920x1080 film (`/opt/data/godot_film/film/malin_kundang_godot.mp4`). What is missing is packaging: a pinned environment recipe (arm64 here, x64 with sha256 for CI) and a fixture |
| `godot-toon-3d-short`, `sprite-video-production` | `toon-3d` | `command` | queue, after `sprite-film` | the same Godot environment; nothing new to install, but 3D scenes cost far more per frame |
| `stickman-chikoomollian` | `stickman-story` | `command` | queue | renders with the same environment `full-frame` already installs; the engine (`ep01_robotfist/engine.py`) is story-agnostic |
| `ascii-video` | `ascii-short` | `command` | queue | needs `numpy` in the environment recipe |
| `manim-video` | `math-motion` | `command` | queue | needs cairo/pango, or scope it to text-only scenes |
| `flat-vector-explainer-video`, `narrated-video-from-images`, `photoreal-cutout-puppet` | `explainer-flat-vector`, `documentary`, `full-frame` | — | done | already worker packs |
| `cartoon-3d-short`, `agnes-character-video-shorts`, `long-form-narrated-video`, `ai-video-generation` | `cartoon-3d`, `character-short`, `narrated-long`, `generated-video` | `hermes` | stays research | a paid image/video model is in the path; no worker engine can absorb it without a bill |
| `real-voxel-game-assets` | — | — | asset pipeline | feeds `voxel-build`; never a look on its own |
| `restyle-film-cast`, `cast-2d-billboards`, `look-match-study`, `short-form-video-qa`, `video-forensics`, `video-continuity-rhythm`, `songsee`, `viral-video-engagement`, `humanizer`, `avoid-ai-writing` | — | — | technique, not a look | no style name, by design |

Two rules the queue keeps:

- **One look, one style.** Three Roblox kits became one pack; the Godot sprite and toon skills stay two, because they look
  different (flat sprites vs 3D scenes), not because they use different tools.
- **Do not call a host incapable without trying its own binary.** Godot was written off here as "x64 only"; the arm64 build
  had been rendering on this box for weeks. Blender is the one that is genuinely x86-only — Godot is not. Look for an
  existing binary and an existing render before declaring a blocker.

- **No status without evidence.** A pack enters as `draft`, becomes `lab` only when CI renders its fixture, and `trial`
  when a run exists in Studio. The `curation` array names the run; `tools/validate.mjs` refuses the claim without it.
