# Minimal line art (`minimal-line-art`)

Quiet black and white motion graphics for a short: thin outlined steps rise one by one, a solid white dot arrives,
hops up them with a little squash and stretch, and at the top a dotted orbit and a ring draw around it, sparks burst
out and the steps dim. One quiet lowercase line of text sits above: the narration's caption.

**Credit.** This pack adapts the `minimalistic-graphics` skill of
[claude-animation-skills](https://github.com/artemnovitckii/claude-animation-skills) by Artem Novitckii, at commit
`86f70106c9aeae1334184467da5776c533ada3bc`. MIT licence, Copyright (c) 2026 Artem Novitckii: the full notice is in
`render/LICENSE`. The font (Poppins 400) comes from the same repository's `kit/fonts` and is under the SIL Open Font
License 1.1 (`render/fonts/OFL-poppins.txt`).

## Contract (from the skill's SKILL.md)

| | |
| --- | --- |
| Renderer | `html-capture`, worker 0.10.0 or later; the page draws the captions (`drawsCaptions: true`) as the skill's one line at the top, lowercased |
| Formats | short (1080x1920, the skill's frame). Long is **not** supported: the motif was measured on a portrait frame; a landscape job is scaled to fit, which is not a designed look |
| Shot length | 3 to 6 s per scene, hard cuts. The motif lasts payoff + 1.6 s (3.8 s with 5 steps, the skill's formula); a shorter scene plays it faster, a longer one holds the end |
| On screen | steps and the dot only. A `bar` or `counter` element with a `series` of 2 to 6 values (all 0 or above) gives one step per value, each as tall as its value. Otherwise the skill's 5 even steps. **No number is ever drawn**, and headings are not drawn: the style has one line of text |
| Taste | quiet and plain: lowercase, no emojis, no bold, no exclamation marks; the idea should be about steady progress (habits, compounding, patience) |
| Captions | required (caption-spec-v1), drawn by the page at the top in Poppins, at most three lines |
| Audio | narrated, -14 LUFS; music self-made or licensed. The skill itself has no audio |
| Assets | the shot pictures are planned like any plates-and-diagrams style but **not drawn**: the look is pure black |

## Render project

`render/index.html`, `render/steps.js`, `render/steps.css`, `render/motion.js`, `render/fonts/fonts.css` (Poppins as
a `data:` URL, because an html-capture pack carries text files only), the OFL text and the MIT licence.

**Plain JavaScript, not GSAP.** The skill drives a paused GSAP timeline. This pack keeps that timeline tween for
tween in `motion.js`, a small frame-driven timeline with GSAP's ease curves (power1-3, back.out), because (1) every
tween animates one number (a position, a scale, a dash offset, an opacity), which a pure function of the frame number
does exactly, (2) GSAP's "Standard No-Charge License" is not MIT and forbids use in no-code visual animation builders
that compete with Webflow, which the owner should review before any pack ships GSAP
(https://gsap.com/community/standard-license/), and (3) a page without a library can be checked without a browser
(`tools/html-pages.test.mjs`). Nothing is loaded from the network; HyperFrames is not used.

## Fixture

`fixtures/payload.json` is an 8 s portrait job of two 4 s scenes written for this pack: the neutral 5-step motif and
a three-value series, with two captions. `fixtures/expect.json` says it must measure 1080x1920 at 30 fps for 8 s
(240 frames) and pass G-technical. None of the skill's example lines is used.

## Provenance

- **repo**: https://github.com/artemnovitckii/claude-animation-skills at `86f70106c9ae`, `skills/minimalistic-graphics`
  (SKILL.md, template.html, build.py). Licence: MIT (Copyright (c) 2026 Artem Novitckii); font SIL OFL 1.1. Adapted:
  motif, geometry, timing formula, eases, colours, font. Changed: captions are the line of text, series set the steps,
  one motif per scene, no light variant, no GSAP, embedded font. Not copied: the example lines or demo output.
- **owner-note**: venturazz/venstudio `docs/plans/style-system.md`, Phase 3. Licence: owner.

## Status

`draft`: written and checked by the validator and the stand-in DOM test, not yet rendered by CI. When this repo's CI
and venstudio's CI have rendered the fixture, a PR adds the `ci-render` entry to `curation` and sets `trial`.
