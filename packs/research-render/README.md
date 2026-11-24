# Hermes render, research only (`research-render`)

Hermes renders the whole video with its own tools (its CapCut workflow, `video_gen`, or whatever it has) from what
the studio planned: the skill brief Hermes wrote from the approved script, the narration on its media host, and this
pack's contract. No shot pictures are made for it (hermes-skill workflow). It replies with a `/clip/` URL on the media host; the portal downloads and checks the file, runs
qc-video on it like any render, and shows it on the same Review card.

**Owner decision: research and trials only, never published.** The rules that hold that line:

- the validator refuses any status above `trial` for engine `hermes` (FORMAT.md);
- a run whose renderer is `hermes` is always a trial run, whatever the pack's status (venstudio portal);
- New Video shows it only in the Trial section, labelled "Hermes render (research only)";
- publishing, when it exists, refuses runs rendered by Hermes.

No worker runs this engine: the portal asks Hermes directly (through its Hermes gate), so a worker never reports
`pack:research-render@...` and the pack needs no worker version.

## Contract

| | |
| --- | --- |
| Renderer | `hermes` (portal side) |
| Formats | short; natural frame portrait |
| Shot length | 2 to 4 s, 0.5 s cross-fades where the shots allow |
| Captions | required (caption-spec-v1, 8% safe area), drawn by Hermes |
| Audio | narrated, -14 LUFS, true peak -1 dBTP |

## Workflow

`hermes-skill` (style.json `workflow`, with `review: ["skill-brief"]`, so the owner always checks the brief): idea → research → script → skill brief → voice → render (Hermes, research only) → quality check. Hermes turns the approved script into a text brief for its own tools (shot list, on-screen text, timing), checked by the portal before anything renders; the Hermes render request carries that brief. No pictures are generated. The run's voice stage records the narration and the skill uses it as the audio. Version 0.2.0 adds the workflow; its runs no longer make pictures (the description says so too).

## Fixture

`fixtures/payload.json` shows the render request the portal builds (shots, narration, captions). It is never
rendered in CI: there is no Hermes there. That is also why this pack has no `ci-render` entry but a `research-source`
one (the owner decision that made Hermes a research renderer), and why it can never leave `trial`.

## Provenance

- **owner-note**: venturazz/venstudio `docs/plans/style-system.md`, renderer `hermes`. Licence: owner.

## Status

`trial` (0.2.0), the highest status an engine `hermes` pack may have. The `research-source` entry in `curation` is
its evidence for trial; there is no CI render for a hermes pack.
