# 3D cartoon what-if short (Hermes /zach-d-films) (`hermes-zach-d-films`)

A 3D cartoon what-if explainer in three.js: procedural people and props, a blue studio sky, slow-motion impacts, a red force ripple and 1 to 3 word captions. Hermes makes it with /zach-d-films (alias /zach-3d-films).

**Credit.** The look is the `zach-d-films` skill of [claude-animation-skills](https://github.com/artemnovitckii/claude-animation-skills) by
[Artem Novitckii](https://novitckii.com), at commit `86f70106c9aeae1334184467da5776c533ada3bc`. MIT licence, Copyright (c) 2026 Artem Novitckii;
the repository's fonts are under the SIL Open Font License 1.1. Hermes has the repository installed and renders
with the skill itself; this pack holds only the contract and how the studio's plan maps to the skill's input.

**Research only.** Engine `hermes`: VenStudio's portal asks Hermes to render (`lib/studio/hermes-render.ts`), naming
the skill `/zach-d-films` (alias `/zach-3d-films`, the same skill under the reel's name). Hermes replies with a `/clip/` URL; the portal downloads it from the media host,
sniffs it and runs qc-video on it like any render. The owner scores it on Review. It is never published, and the
pack can never go above `trial`.

## Contract (from the skill's SKILL.md)

| | |
| --- | --- |
| What it makes | A 3D cartoon "what if" explainer short (9:16) entirely in code with three.js: procedural cartoon people, props and effects, a blue studio sky, slow-motion impacts, a red force-ripple overlay, quick whip cuts and 1 to 3 word captions timed to the voiceover. /zach-3d-films is the same skill under the reel's name. |
| Skill | `/zach-d-films` (alias `/zach-3d-films`, the same skill under the reel's name), a **full project**: the skill copies its example project, times captions and shots to a voiceover word by word and renders a whole reel |
| Formats | short, 1080x1920 at 30 fps; natural frame portrait (the skill renders 9:16 only) |
| Pacing | About 2.5 words a second (70 to 90 words for 30 s); a shot every 2 to 4 s; WebGL renders at 0.2 to 0.5 s a frame. Contract: 2 to 4 s a shot, hard cuts, the hook within 1 s |
| On screen | Procedural 3D people and props with soft shadows, depth of field, bloom and light grain; captions in the lower third. |
| Captions | required (caption-spec-v1, 8% safe area), burned by Hermes |
| Audio | the run's narration, -14 LUFS, true peak -1 dBTP; music: `none` |

Taste rules the skill sets, which the studio passes on:

- The format: an "If you..." hook, a misconception, a "But" twist, building examples, the mechanism and a payoff; check the facts.
- Slow motion on the impact, a short shake, sparks, bloom; the red ripple shows force spreading; quick cuts on caption beats, one dip to black on the "But" turn.
- Not affiliated with Zack D. Films; captions white, bold, 1 to 3 words.

## How the studio's plan maps to the skill

`hermes.input` in `style.json`, sent to Hermes with every render request:

> A full project, not a quick spec. The run's skill brief (brief.text) is the project brief Hermes wrote from the approved script: the voiceover text (the run's approved narration script, one sentence per entry for script.json), the shot list (a shot every 2 to 4 s (8 to 10 for 30 s), cutting on caption beats, the mechanism shot longest) and the script order (hook, belief, the "But" turn, examples, payoff). The run has no voice stage: record the voiceover from that narration text with the free Kokoro voice the skill uses (stick-figure engine/tools/tts_kokoro.py), then words.py and captions.py for the caption timing, and time the shots, captions and sound to it as the skill does. Name the voice backend you used in the reply's voice field. Keep the skill's style rules.

What Hermes hands back (`hermes.output`): A finished reel (1080x1920 H.264 MP4, 30 fps) with the voice the skill recorded from the run's narration script and the skill's captions and sound, published under /clip/ on the media host. It is a reel the studio then QCs (qc-video) and the owner scores on Review; it is never published.

## Workflow

`hermes-skill` (style.json `workflow`, `hermes.voice: "skill"`): idea → research → script → skill brief → render (Hermes, research only) → quality check. Hermes turns the approved script into the input `/zach-d-films` expects (`hermes.input` above), checked by the portal before anything renders; the Hermes render request carries that brief. No pictures are generated. The skill makes its own voice and timing, so the run has no voice stage: the narration script goes to the skill as text, and the video's provenance records the voice backend Hermes names; that backend's provider terms are checked like any voice. Version 0.2.0 adds the workflow and rewrites `hermes.input` for the brief.

## Fixture

`fixtures/payload.json` shows the render request's shape (two 4 s shots, narration, captions, the skill). It is
never rendered in CI: there is no Hermes there.

## Provenance

- **skill**: https://github.com/artemnovitckii/claude-animation-skills at `86f70106c9ae`, `skills/zach-d-films/SKILL.md`. Licence: MIT; fonts SIL OFL 1.1. Learned: what it
  makes, pacing, on-screen elements, taste rules, formats and frame. Nothing copied: no code, frames, audio or examples.
- **owner-note**: venturazz/venstudio `docs/plans/style-system.md`: the first trial source, installed and working in
  Hermes by the owner's report. Licence: owner.

## Status

`trial` (0.2.0), the highest status a `hermes` pack may have. Its evidence is a `research-source` entry in `curation`
(the pinned skill and the owner's report that it works in Hermes); there is no CI render for a hermes pack and none is
claimed. Every run is a research trial: recorded on the portal's Styles page with its QC result, the owner's
presentation score and decision, never published.
