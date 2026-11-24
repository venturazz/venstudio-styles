# Dafiology full-frame (one plate a scene, camera grammar)

One full-frame plate a scene, held and moved by the camera grammar the ChikooTale engine measured over three published
short episodes: a push that settles instead of crawling (16 % at most, snapped in), a 2.6 / 3.4 px breath so a still
page never reads as dead, focus drift for the scenes that carry a `drift` token, and hard cuts. Over that, three pieces
of furniture, all of them small and out of the subject's way: a readout chip at the top right whose colour is its own
number (green above 55 %, amber above 30 %, red below), a callout tag under it at the top left that fades in and out
with the scene, and the hook burned across the middle for the first 1.6 s, then gone.

The worker burns the run's captions in the caption band and adds the narration afterwards, so nothing here competes
with the subtitle: the chip whispers a value, the tag names the beat, the hook promises the video.

- **Engine `command`.** The worker runs `render/frames.py` with the venv its `environment` installs, and nothing else.
- **Pillow 11.3.0** (PyPI, wheels for cp311–cp314, `--require-hashes --only-binary=:all: --no-deps`) draws every frame
  (`<out>/000000.png` … at the job's size).
- **DejaVu Sans Bold 2.37** (the upstream release zip, sha256 and size pinned) is the only font; it is unpacked into
  the environment so the render never depends on a system font.

The probe prints `ok pillow 11.3.0 dejavu-2.37` only after it has loaded the font and measured a string, so a Pillow
that imports but cannot shape text fails the install instead of a job.

## What this version leaves to the skill

The engine it comes from also placed keyed actor sprites on the plate, mixed a story sound design, drew an end card
and drove a damage meter from story cues. Those need the story module, the rig and the sound library, which are
Hermes-side inputs, not a style: 0.1.0 moves plates, tags them and reads out a value. The four things it does keep are
the ones that made the look recognisable in a thumbnail.

## Provenance

- The camera grammar, the chip, the tag and the hook are taken from `/opt/data/ep01_robotfist/engine.py` (Hermes,
  ChikooTale), which rendered EP21–EP23 between 15 and 19 November 2026 at 720×1280. Written for venturazz; the code
  here is a port of its frame loop, not a copy of the episode builder.
- DejaVu fonts 2.37, `dejavu-fonts-ttf-2.37.zip` from the upstream GitHub release: sha256
  `7576310b219e04159d35ff61dd4a4ec4cdba4f35c00e002a136f00e96a908b0a`, 5 522 795 bytes, measured from the asset
  itself. Bitstream Vera Fonts Copyright; the DejaVu changes are in the public domain, and `LICENSE` is unpacked with
  the fonts.
- Pillow 11.3.0, MIT-CMU. The eight hashes in `env/requirements.txt` are the digests PyPI reports for the cp311, cp312, cp313
  and cp314 manylinux x86-64 wheels, so the install works on whichever of those the worker's `python3` is
  (the first CI run proved this: the runner's python3 is 3.14, which the first six hashes did not cover).

## Status

`draft`. Nothing has run in CI or on a worker yet: the fixture renders here (360 frames, 1 m 14 s on 4 ARM cores,
about 6 s per second of video), and the recipe, probe and render argv are the shape `three-low-poly` proved. A CI run
of job `environments` adds the `ci-render` entry and moves it to `lab`; a Muse trial after that is what could make it
`trial`.

Two things to look at before that trial:

- **Peak disk.** PNG frames of photo plates are about 2.2 MB each at 1080×1920: ~66 MB per second of video, so a 12 s
  fixture is 724 MB and a 45 s short would be ~3 GB. If Muse's free disk makes that tight, the next version writes
  `mp4-muted` instead (`output: "mp4-muted"`, H.264 in the render), which needs an ffmpeg the recipe can pin.
- **Push and drift are the whole motion.** A scene with neither token is a still for its full length; the planner must
  not hand this pack a long, static scene and expect it to hold attention.