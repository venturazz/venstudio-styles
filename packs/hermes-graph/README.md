# Line graph (Hermes /graph) (`hermes-graph`)

A smooth line draws itself while one big number counts up with its tip and lands on the final value. Hermes renders it with /graph.

**Credit.** The look is the `graph` skill of [claude-animation-skills](https://github.com/artemnovitckii/claude-animation-skills) by
[Artem Novitckii](https://novitckii.com), at commit `86f70106c9aeae1334184467da5776c533ada3bc`. MIT licence, Copyright (c) 2026 Artem Novitckii;
the repository's fonts are under the SIL Open Font License 1.1. Hermes has the repository installed and renders
with the skill itself; this pack holds only the contract and how the studio's plan maps to the skill's input.

**Research only.** Engine `hermes`: VenStudio's portal asks Hermes to render (`lib/studio/hermes-render.ts`), naming
the skill `/graph`. Hermes replies with a `/clip/` URL; the portal downloads it from the media host,
sniffs it and runs qc-video on it like any render. The owner scores it on Review. It is never published, and the
pack can never go above `trial`.

This is the Hermes research variant of `animated-line-graph` (the same skill adapted as an html-capture pack VenStudio renders itself). Studio offers it next to that pack's lab trial.

## Contract (from the skill's SKILL.md)

| | |
| --- | --- |
| What it makes | A minimal line graph: a smooth black line draws itself on white (or white on black) while one big number counts up with the tip and lands on the final value. |
| Skill | `/graph`, a **quick skill**: it renders from a small JSON spec in seconds (2D) or about 1.5 minutes (3D) |
| Formats | short, 1080x1920 at 30 fps; natural frame portrait (the skill renders 9:16 only) |
| Pacing | About 4 s per graph plus an optional hold. Contract: 3 to 6 s a shot, hard cuts, the hook within 1 s |
| On screen | A plain label, one big number, three gridlines, the line and its tip, optional axis labels. |
| Captions | required (caption-spec-v1, 8% safe area), burned by Hermes |
| Audio | the run's narration, -14 LUFS, true peak -1 dBTP; music: `none` |

Taste rules the skill sets, which the studio passes on:

- Never invent data: a shot without numbers in the script and notes gets no graph values; say the curve is illustrative or leave the number out.
- One number, one line: no callouts, growth chips or marketing words.
- The label is a plain noun, not a slogan.

## How the studio's plan maps to the skill

`hermes.input` in `style.json`, sent to Hermes with every render request:

> The run's skill brief gives one shot per clip, in order, each with its seconds and the skill's JSON spec (brief.shots[i].spec), written by Hermes from the approved script and the research notes following the skill's spec and taste rules (label, values (2 or more, oldest first), labels, final, prefix, suffix, decimals, dark); never invent data the script and notes do not give. Render each spec with the skill, fit each clip to the shot's seconds (hold the last frame when the shot is longer, play it faster when shorter), cut them together, add the run's narration as the audio and burn the run's captions in the caption band. No pictures are made for this workflow.

What Hermes hands back (`hermes.output`): One 1080x1920 H.264 MP4 at 30 fps with the narration, published under /clip/ on the media host. The studio then runs qc-video and the owner scores it on Review.

## Workflow

`hermes-skill` (style.json `workflow`, with `review: ["skill-brief"]`, so the owner always checks the brief, `hermes.voice: "run"`): idea → research → script → skill brief → voice → render (Hermes, research only) → quality check. Hermes turns the approved script into the input `/graph` expects (`hermes.input` above), checked by the portal before anything renders; the Hermes render request carries that brief. No pictures are generated. The run's voice stage records the narration and the skill uses it as the audio. Version 0.2.0 adds the workflow and rewrites `hermes.input` for the brief.

## Fixture

`fixtures/payload.json` shows the render request's shape (two 4 s shots, narration, captions, the skill). It is
never rendered in CI: there is no Hermes there.

## Provenance

- **skill**: https://github.com/artemnovitckii/claude-animation-skills at `86f70106c9ae`, `skills/graph/SKILL.md`. Licence: MIT; fonts SIL OFL 1.1. Learned: what it
  makes, pacing, on-screen elements, taste rules, formats and frame. Nothing copied: no code, frames, audio or examples.
- **owner-note**: venturazz/venstudio `docs/plans/style-system.md`: the first trial source, installed and working in
  Hermes by the owner's report. Licence: owner.

## Status

`trial` (0.2.0), the highest status a `hermes` pack may have. Its evidence is a `research-source` entry in `curation`
(the pinned skill and the owner's report that it works in Hermes); there is no CI render for a hermes pack and none is
claimed. Every run is a research trial: recorded on the portal's Styles page with its QC result, the owner's
presentation score and decision, never published.
