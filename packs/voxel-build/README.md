# Voxel build (`voxel-build`)

A village assembles itself block by block: real voxel structures on grass, the build rising under a cutting plane, three
camera moves, a pixel pay-off word and a caption plate. The worker renders it from the run's scene spec — no pictures, no
Hermes, no network.

Engine `html-capture`, 1080x1920, short only. Version 0.3.0 replaced the old Hermes trial (kept as `voxel-build-skill`,
retired) with a renderer a worker actually runs.

## What the look locks, and what the request decides

Locked in `render/`:

- **The blocks are real.** 58 original block textures from the Pixel-Perfection kit, a 126-block map, 12 converted
  structures. Nothing is drawn as a flat rectangle pretending to be a cube.
- **The build is a cutting plane**, not per-block animation: the structure is whole from the first frame and a plane near
  the ground hides the rest, sweeping upward. Blocks land without any of them being able to drift between frames.
- **Cameras**: `push-in` (a slow dolly toward the face), `orbit` (a 63° arc), `crane` (rise and look down). Shots cut hard.
- **Type**: Pixelify Sans (SIL OFL 1.1) for the pay-off word and the caption plate in the lower third, inside the 8% safe
  area.
- **The rotation of structures**: well, farm, medium house, blacksmith, church, tavern, large house, library. A six-shot
  script gets six different buildings instead of six copies of one.

Open in the request:

- how many shots and how long each one is (`shots[i].seconds`),
- the motion per shot (`zoom-in`, `zoom-out`, `pan-left`, `orbit`, `crane`, `static` → mapped to the three cameras),
- the words: the caption text comes from `props.captions`, and the pay-off word is **derived** from that caption's last
  word, not written by the style.

## How the page works

`render/voxel.js` is the whole renderer. It exposes `window.VENSTUDIO = { init(props), renderFrame(f) }`, the contract the
worker drives (`runtime/html-capture/venstudio-worker.ts`): `init` builds one scene per shot and answers
`{ totalFrames, fps, width, height }`; `renderFrame(f)` draws exactly that frame and nothing else — no clock, no animation
loop, no `requestAnimationFrame`.

`render/page.js` is that file bundled with three.js and the kit into one classic script, because a pack page is loaded with
a bare `<script src>` and the repo's stand-in DOM test runs page scripts as classic scripts. The sources beside it are the
reviewable truth:

```bash
node tools/bundle-voxel-page.mjs          # rebuild page.js from voxel.js + the kit
node tools/bundle-voxel-page.mjs --check  # fail if page.js is older than a source
```

## No binaries in the pack

An html-capture pack holds text files only. So the art travels as data URLs: `render/assets/blob.js` (generated) carries
the 58 textures and the typeface, and `render/voxel.js` resolves every `THREE.TextureLoader` call through it. Regenerate
from the kit when the kit changes:

```bash
VOXEL_KIT=/opt/data/assets/mc node tools/embed-voxel-assets.mjs
```

`render/assets/vendor/three.module.js` is three.js r169 (MIT), vendored rather than fetched: the capture sandbox blocks the
network.

## Licences

- **Pixel-Perfection block textures** (the kit at `/opt/data/assets/mc/vendor`): **CC BY-SA 4.0** — attribution required,
  share-alike applies to the vendored art. Original block art; not Mojang's.
- **three.js** r169: MIT (Three.js Authors).
- **Pixelify Sans**: SIL Open Font License 1.1 (licence text next to the font source in
  `skills/kits/claude-animation-skills/files/fonts/OFL-pixelifysans.txt`).
- **Not affiliated with Mojang or Microsoft.** No Mojang texture, logo or character is used.

The taste rules (one build with one payoff, a build line under about 17 characters, portrait 1080x1920) came from the
`minecraft` skill of [claude-animation-skills](https://github.com/artemnovitckii/claude-animation-skills) by Artem
Novitckii at `86f70106c9ae`, MIT — credited, learned, not copied. The full record is in `style.json` `provenance`.

## Provenance

Every entry, with its licence and what exactly was taken, is in `style.json` `provenance`:

- **skill** — claude-animation-skills `skills/minecraft/SKILL.md` @ `86f70106c9ae`, MIT, Artem Novitckii: taste rules only.
- **repo** — Pixel-Perfection textures, 58 files vendored: CC BY-SA 4.0, attribution required, share-alike on the art.
- **repo** — three.js r169 vendored: MIT (Three.js Authors); `mcvoxel.js`/`mcrig.js` are the kit's builders.
- **owner-note** — `venturazz/venstudio-skills` `chains/voxel-build@1.0.0`: the chain where the look was proven (digest
  pinned, fixture checked), before it was vendored into this pack so a worker can render it without the host's copy.

## Fixture and CI

`fixtures/payload.json` is a three-shot, six-second request with captions; `fixtures/expect.json` says what a correct
render measures (1080x1920, 24 fps, 6 s ± 0.15). The `html-capture` job in CI renders it with the vendored worker in Chrome
Headless Shell and checks size, fps, duration and frame count. The stand-in DOM test (`tools/html-pages.test.mjs`) also
runs this page: with no WebGL it answers the job's shape and draws nothing, which is the honest thing for a WebGL page to
do in a DOM stub.

## Determinism

Grade A, measured on the chain this pack came from: a fixed structure, camera and time produce the same bytes. The chain's
`render/fixture.mjs` (in `venstudio-skills`) checks six frames against a reference hash and reports two identical runs as
stable. The one caveat found there: the first draw of the pay-off word at its final size can differ by a handful of pixels
(8 of 2,073,600, measured once per browser session) — glyph rasterisation, not the picture.

## Known gap

The pack asks the studio for no pictures, but `contract.assets.model` may only be `image-per-shot` or `plates-and-diagrams`
today, so Studio's planner can still plan stills this renderer ignores. The render is unaffected; the plan is wasteful.
A `none` asset model is the fix and it needs a portal change, not a pack change.

## Status

`draft` until the first CI render of this pack passes; then `lab`, with the `ci-render` curation entry. `trial`/`proven`
would need real runs and the owner's review.