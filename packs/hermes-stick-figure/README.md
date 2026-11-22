# Stick-figure explainer reel (Hermes /stick-figure) (`hermes-stick-figure`)

A bright cartoon world with stick people, constant camera motion, whip transitions and 1 to 2 word captions timed to the voice. A full reel Hermes makes with /stick-figure.

**Credit.** The look is the `stick-figure` skill of [claude-animation-skills](https://github.com/artemnovitckii/claude-animation-skills) by
[Artem Novitckii](https://novitckii.com), at commit `86f70106c9aeae1334184467da5776c533ada3bc`. MIT licence, Copyright (c) 2026 Artem Novitckii;
the repository's fonts are under the SIL Open Font License 1.1. Hermes has the repository installed and renders
with the skill itself; this pack holds only the contract and how the studio's plan maps to the skill's input.

**Research only.** Engine `hermes`: VenStudio's portal asks Hermes to render (`lib/studio/hermes-render.ts`), naming
the skill `/stick-figure`. Hermes replies with a `/clip/` URL; the portal downloads it from the media host,
sniffs it and runs qc-video on it like any render. The owner scores it on Review. It is never published, and the
pack can never go above `trial`.

## Contract (from the skill's SKILL.md)

| | |
| --- | --- |
| What it makes | A code-animated stick-figure explainer reel (9:16, 30 to 45 s) from a question: a bright cartoon world with thick outlines, stick people with big white heads and faces, constant camera motion, whip transitions, 1 to 2 word captions, a playful underscore and cartoon sound effects, all timed to the voiceover word by word. |
| Skill | `/stick-figure`, a **full project**: the skill copies its example project, times captions and shots to a voiceover word by word and renders a whole reel |
| Formats | short, 1080x1920 at 30 fps; natural frame portrait (the skill renders 9:16 only) |
| Pacing | About 110 to 120 words for 38 to 40 s; 10 to 12 setups, most 2 to 4 s. Contract: 2 to 4 s a shot, hard cuts, the hook within 1 s |
| On screen | Stick people and props drawn in code, captions about 70% down, whip blur, vignette and grain. |
| Captions | required (caption-spec-v1, 8% safe area), burned by Hermes |
| Audio | the run's narration, -14 LUFS, true peak -1 dBTP; music: `self-generated` |

Taste rules the skill sets, which the studio passes on:

- Captions: Poppins Bold, white with a dark outline, 1 to 2 words, lowercase, no punctuation; no em dashes on screen.
- Bright saturated palette, ink outlines, slow push-ins with handheld drift, whip transitions with motion blur.
- Check every claim with sources and hedge theories; SFX and a quiet plucked underscore sit under the voice.

## How the studio's plan maps to the skill

`hermes.input` in `style.json`, sent to Hermes with every render request:

> A full project, not a quick spec. Use the run's narration (narration.url) as the voiceover and time the skill's captions and shots to it word by word where possible; the run's captions are the text to show. Do not record or synthesise a new voice unless the narration is missing, and say so in the reply's notes if you had to. Use the storyboard's shots as the shot list (about 10 to 12 setups, most 2 to 4 s, the explainer shot longer; the hook in action on frame 1; faces and key props out of the caption band) and the run's script order (hook, belief, the "But" turn, examples, payoff). Keep the skill's style rules.

What Hermes hands back (`hermes.output`): A finished reel (1080x1920 H.264 MP4, 30 fps) with the run's narration and the skill's captions and sound, published under /clip/ on the media host. It is a reel the studio then QCs (qc-video) and the owner scores on Review; it is never published.

## Fixture

`fixtures/payload.json` shows the render request's shape (two 4 s shots, narration, captions, the skill). It is
never rendered in CI: there is no Hermes there.

## Provenance

- **skill**: https://github.com/artemnovitckii/claude-animation-skills at `86f70106c9ae`, `skills/stick-figure/SKILL.md`. Licence: MIT; fonts SIL OFL 1.1. Learned: what it
  makes, pacing, on-screen elements, taste rules, formats and frame. Nothing copied: no code, frames, audio or examples.
- **owner-note**: venturazz/venstudio `docs/plans/style-system.md`: the first trial source, installed and working in
  Hermes by the owner's report. Licence: owner.

## Status

`trial` (0.1.0), the highest status a `hermes` pack may have. Its evidence is a `research-source` entry in `curation`
(the pinned skill and the owner's report that it works in Hermes); there is no CI render for a hermes pack and none is
claimed. Every run is a research trial: recorded on the portal's Styles page with its QC result, the owner's
presentation score and decision, never published.
