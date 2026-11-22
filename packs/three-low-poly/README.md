# Low-poly 3D shapes (three.js, command)

One flat-shaded low-poly shape per scene (an icosahedron, an octahedron, a dodecahedron, in turn) turns slowly in the
upper middle of a portrait frame, over the run's plate dimmed to a texture and a two-tone gradient. Motion tokens:
`pop` scales the shape in with a small overshoot, `drift` turns it faster, `push` moves the camera closer over the
scene. Cuts are hard. The worker burns the run's captions in the caption band and adds the narration afterwards.

It is the first pack of engine `command`: the worker runs `render/render.mjs` with the tools the pack's
`environment` installs, and nothing else.

- **three.js 0.183.2** (npm, from `env/package-lock.json`, sha512 integrity) builds the scene and projects it on the
  CPU with its `Projector` (the projection its SVGRenderer uses). No WebGL and no browser.
- **resvg 0.44.0** (the GitHub release binary, sha256 pinned) rasterises each frame's SVG to
  `<out>/000000.png` and on.
- The worker encodes the PNG frames (H.264, yuv420p), burns the captions, mixes the narration, probes and uploads,
  as for every renderer.

The probe (`render/probe.mjs`) loads three.js, projects one tiny frame and rasterises it with resvg; the worker
reports `env:three-svg@1.0.0` and `pack:three-low-poly@0.1.0` only after it prints `ok three r183 resvg 0.44.0`.

## Provenance

- three.js (MIT), used as a library from the environment; nothing of it is vendored here. The lockfile's integrity
  for three 0.183.2 is the one in google/model-viewer's `package-lock.json` at commit 5cc277a; `npm ci` refuses any
  tarball that does not match it.
- resvg (MPL-2.0), the unmodified release binary for linux-x86_64; its sha256 and size were computed from the asset
  downloaded through the authenticated GitHub API.
- The look and the scripts are written for this repository (owner decision: the first proof of the Hermes handover
  channel). Kiro wrote it in Hermes's place to prove the channel; it is not a style Hermes trialled.

## Status

`draft`. The recipe, the probe and the fixture render run in this repo's CI (job `environments`): the vendored worker
installs the environment as a non-root user, runs the probe, renders `fixtures/payload.json` and checks it against
`fixtures/expect.json`. Once that run passes, a PR adds its `ci-render` entry to `curation` and sets `status: "lab"`.
No CI run has happened for it yet, so none is claimed.
