# PS1 low-poly 3D (Hermes /low-poly) (`hermes-low-poly`)

PS1/N64-era low-poly 3D: chunky pixels, wobbly vertices, dithering, flat warm light and small yellow captions. Hermes renders it with /low-poly.

**Credit.** The look is the `low-poly` skill of [claude-animation-skills](https://github.com/artemnovitckii/claude-animation-skills) by
[Artem Novitckii](https://novitckii.com), at commit `86f70106c9aeae1334184467da5776c533ada3bc`. MIT licence, Copyright (c) 2026 Artem Novitckii;
the repository's fonts are under the SIL Open Font License 1.1. Hermes has the repository installed and renders
with the skill itself; this pack holds only the contract and how the studio's plan maps to the skill's input.

**Research only.** Engine `hermes`: VenStudio's portal asks Hermes to render (`lib/studio/hermes-render.ts`), naming
the skill `/low-poly`. Hermes replies with a `/clip/` URL; the portal downloads it from the media host,
sniffs it and runs qc-video on it like any render. The owner scores it on Review. It is never published, and the
pack can never go above `trial`.

## Contract (from the skill's SKILL.md)

| | |
| --- | --- |
| What it makes | A low-poly 3D scene in the PS1 look. The built-in scene is a train platform: a dog waits, a train brakes in and pulls away, and he is still there in the snow. |
| Skill | `/low-poly`, a **quick skill**: it renders from a small JSON spec in seconds (2D) or about 1.5 minutes (3D) |
| Formats | short, 1080x1920 at 30 fps; natural frame portrait (the skill renders 9:16 only) |
| Pacing | About 4 s (line one from 0.3 s, line two from 2.6 s); WebGL, about 1.5 minutes a render. Contract: 3 to 6 s a shot, hard cuts, the hook within 1.5 s |
| On screen | A wide lens close to the subject, a pixel-font sign, a small yellow caption with a thin black outline about two thirds down. |
| Captions | required (caption-spec-v1, 8% safe area), burned by Hermes |
| Audio | the run's narration, -14 LUFS, true peak -1 dBTP; music: `none` |

Taste rules the skill sets, which the studio passes on:

- True, slightly sad or strange stories suit it: animals, history, odd facts. Check the facts of the story.
- Render at 360x640 shown 3x with nearest-neighbour scaling; few-box models, code-drawn textures.
- Not affiliated with any channel.

## How the studio's plan maps to the skill

`hermes.input` in `style.json`, sent to Hermes with every render request:

> One clip per storyboard shot, in shot order. For each shot, write the skill's JSON spec from the shot's onScreenText (else its description) and the run's topic, following the skill's spec and taste rules (lines (two lowercase captions without full stops), sign, prev, next (pixel-font station names), snow); never invent data the storyboard does not give. Render each spec with the skill, fit each clip to the shot's seconds (hold the last frame when the shot is longer, play it faster when shorter), cut them together, add the run's narration as the audio and burn the run's captions in the caption band. The shot pictures are not needed by this skill; ignore them.

What Hermes hands back (`hermes.output`): One 1080x1920 H.264 MP4 at 30 fps with the narration, published under /clip/ on the media host. The studio then runs qc-video and the owner scores it on Review.

## Fixture

`fixtures/payload.json` shows the render request's shape (two 4 s shots, narration, captions, the skill). It is
never rendered in CI: there is no Hermes there.

## Provenance

- **skill**: https://github.com/artemnovitckii/claude-animation-skills at `86f70106c9ae`, `skills/low-poly/SKILL.md`. Licence: MIT; fonts SIL OFL 1.1. Learned: what it
  makes, pacing, on-screen elements, taste rules, formats and frame. Nothing copied: no code, frames, audio or examples.
- **owner-note**: venturazz/venstudio `docs/plans/style-system.md`: the first trial source, installed and working in
  Hermes by the owner's report. Licence: owner.

## Status

`trial` (0.1.0), the highest status a `hermes` pack may have. Its evidence is a `research-source` entry in `curation`
(the pinned skill and the owner's report that it works in Hermes); there is no CI render for a hermes pack and none is
claimed. Every run is a research trial: recorded on the portal's Styles page with its QC result, the owner's
presentation score and decision, never published.
