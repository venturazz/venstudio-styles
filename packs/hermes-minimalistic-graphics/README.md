# Minimal steps line art (Hermes /minimalistic-graphics) (`hermes-minimalistic-graphics`)

Thin outlined steps rise one by one, a white dot hops up them and an orbit draws around it at the top, with one quiet lowercase line. Hermes renders it with /minimalistic-graphics.

**Credit.** The look is the `minimalistic-graphics` skill of [claude-animation-skills](https://github.com/artemnovitckii/claude-animation-skills) by
[Artem Novitckii](https://novitckii.com), at commit `86f70106c9aeae1334184467da5776c533ada3bc`. MIT licence, Copyright (c) 2026 Artem Novitckii;
the repository's fonts are under the SIL Open Font License 1.1. Hermes has the repository installed and renders
with the skill itself; this pack holds only the contract and how the studio's plan maps to the skill's input.

**Research only.** Engine `hermes`: VenStudio's portal asks Hermes to render (`lib/studio/hermes-render.ts`), naming
the skill `/minimalistic-graphics`. Hermes replies with a `/clip/` URL; the portal downloads it from the media host,
sniffs it and runs qc-video on it like any render. The owner scores it on Review. It is never published, and the
pack can never go above `trial`.

This is the Hermes research variant of `minimal-line-art` (the same skill adapted as an html-capture pack VenStudio renders itself). Studio offers it next to that pack's lab trial.

## Contract (from the skill's SKILL.md)

| | |
| --- | --- |
| What it makes | Minimal black-and-white line art: hairline steps rise one by one, a solid white dot hops up them, and at the top an orbit and a ring draw around it while the line of text swaps to its second line. |
| Skill | `/minimalistic-graphics`, a **quick skill**: it renders from a small JSON spec in seconds (2D) or about 1.5 minutes (3D) |
| Formats | short, 1080x1920 at 30 fps; natural frame portrait (the skill renders 9:16 only) |
| Pacing | 3.8 s with 5 steps; more steps hop faster and run a little longer. Contract: 3 to 6 s a shot, hard cuts, the hook within 1 s |
| On screen | One lowercase line at the top, the steps, the dot, its orbit, ring and sparks at the end. |
| Captions | required (caption-spec-v1, 8% safe area), burned by Hermes |
| Audio | the run's narration, -14 LUFS, true peak -1 dBTP; music: `none` |

Taste rules the skill sets, which the studio passes on:

- Quiet and plain: lowercase, no emojis, no bold, no exclamation marks.
- The idea is about steady progress (habits, compounding, patience).
- Pure black, hairline white strokes, one solid white dot, one line of text.

## How the studio's plan maps to the skill

`hermes.input` in `style.json`, sent to Hermes with every render request:

> One clip per storyboard shot, in shot order. For each shot, write the skill's JSON spec from the shot's onScreenText (else its description) and the run's topic, following the skill's spec and taste rules (lines (1 or 2 lowercase lines under about 30 characters), steps 3 to 7, light); never invent data the storyboard does not give. Render each spec with the skill, fit each clip to the shot's seconds (hold the last frame when the shot is longer, play it faster when shorter), cut them together, add the run's narration as the audio and burn the run's captions in the caption band. The shot pictures are not needed by this skill; ignore them.

What Hermes hands back (`hermes.output`): One 1080x1920 H.264 MP4 at 30 fps with the narration, published under /clip/ on the media host. The studio then runs qc-video and the owner scores it on Review.

## Fixture

`fixtures/payload.json` shows the render request's shape (two 4 s shots, narration, captions, the skill). It is
never rendered in CI: there is no Hermes there.

## Provenance

- **skill**: https://github.com/artemnovitckii/claude-animation-skills at `86f70106c9ae`, `skills/minimalistic-graphics/SKILL.md`. Licence: MIT; fonts SIL OFL 1.1. Learned: what it
  makes, pacing, on-screen elements, taste rules, formats and frame. Nothing copied: no code, frames, audio or examples.
- **owner-note**: venturazz/venstudio `docs/plans/style-system.md`: the first trial source, installed and working in
  Hermes by the owner's report. Licence: owner.

## Status

`trial` (0.1.0), the highest status a `hermes` pack may have. Its evidence is a `research-source` entry in `curation`
(the pinned skill and the owner's report that it works in Hermes); there is no CI render for a hermes pack and none is
claimed. Every run is a research trial: recorded on the portal's Styles page with its QC result, the owner's
presentation score and decision, never published.
