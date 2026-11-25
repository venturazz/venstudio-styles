# A style, or a script?

A skill is written for the video it was made with: these shots, this copy, this long. A worker cannot use that. A
worker gets a request — another topic, another beat count, another language — and has to render *that* in the style.
So every pack has to answer one question honestly:

> If I change the request, does the video change with it?

A pack that says no is a script wearing a style's clothes. It renders once, looks great, and cannot render anything
else.

## Three layers

| Layer | What is in it | Where it lives |
| --- | --- | --- |
| **The look** (locked) | palette, type, camera grammar, element vocabulary, motion tokens, pacing ranges, caption rules | `style.json` `contract` + `render/` |
| **The request** (open) | topic, story beats, how many scenes, each scene's seconds, language, cast, captions, aspect, voice | `props` at render time |
| **The seam** | `props` schema: the one thing the render may read | `render/` reads `props`, nothing else |

The rule that follows: **every visible word and every second of the output comes from `props`.** A word in the code is
a word the request cannot change. A frame count in the code is a length the request cannot change.

Two traps that look innocent:

- A default. `text = sc.get("heading") or "It cost $100,000,000"` renders the fixture's line whenever the request has
  none. Fix: `or ""`, and let the plate carry the scene.
- A safe loop. `for i in range(3)` because the pack "always" has three scenes. Fix: `for sc in props["scenes"]`.

## How to check

```
node tools/style-check.mjs          # every pack
node tools/style-check.mjs full-frame
node tools/style-check.mjs --json
```

It asks six questions. `fail` means the pack cannot be shown to follow a request; `warn` means a person should look;
`?` means the pack is not *proven* pinned, but nothing here proves it adapts either.

| Code | Level | Question |
| --- | --- | --- |
| `copy-in-code` | fail | Is a line from the fixture also in `render/`? Then that line is not read from the request. |
| `no-input` | fail | Does `render/` read the payload at all (`props`, `argv`, `__PAYLOAD__`)? |
| `one-fixture` | fail | Is there a second fixture with another shape? Without one, adaptation is unproven. |
| `same-shape` | fail | Do the two fixtures have the same scene count *and* length? Then they prove nothing. |
| `pinned-shot-seconds` | fail | Is `contract.pacing.shotSeconds` one value instead of a range? Then the engine has no room. |
| `pinned-count`, `pinned-length`, `pinned-cuts`, `brief-unbound` | warn | A literal loop count, a literal length, one cut rate, or a Hermes brief that names no request field. |

## The second fixture

The convention, so the check has something to read:

- `fixtures/payload.json` — the CI fixture: the one `fixtures/expect.json` describes and CI renders.
- `fixtures/payload-alt.json` — the proof of adaptation: another topic, another scene count, another length, and (for a
  narrated pack) another language.

The alt fixture is not rendered in CI. It exists so that a person — or the next tool — can render the same pack twice
and see two different videos. When you touch a pack, render both and compare the frame count to the payload's
`durationSec × fps`: if they match for both, the length follows the request.

`packs/full-frame/fixtures/payload-alt.json` is the worked example: 5 scenes and 21 s in Indonesian, against the CI
fixture's 3 scenes and 12 s in English. The renderer writes `totalFrames` frames and draws each scene's copy from the
payload, so the second run is 630 frames of a different film — same look, different video.

It also paid for itself on the first render: the hook is request copy, but its size was fixed at 58 px, so
*Enam pagi, setiap hari* ran off the right edge. The size was the script. `fit_font` over 58..28 px and one break by
words fixed it. Nothing in the CI fixture would have found that — its own line is short enough to fit.

## Hermes packs: where a style quietly becomes a script

The engine `hermes` packs have no render code. The skill *is* the engine, and its text is upstream (MIT, pinned by
commit): it says "write a spec with one line of build and one payoff", and an agent that follows that literally makes
the example the skill was written with. What this repo owns is `hermes.input` — the brief.

So for a Hermes pack the rule is about the brief, not the code:

1. Every field the request can change is named in `hermes.input` (`topic`, `beats`, `scenes`, `seconds`,
   `language`). `style-check` warns (`brief-unbound`) when it names none.
2. The brief that reaches the skill carries the run's script and nothing else. The skill's own example is not pasted
   into it, and the prompt says the script below is the only story.
3. The pack's `fixtures/payload.json` is a request like any other: if the rendered result is the skill's example
   instead of the fixture's story, that is the same bug as `copy-in-code`, one layer up.

## When a pack fails

| Code | Fix |
| --- | --- |
| `copy-in-code` | read the string from `props`; if the look needs a placeholder, use `""` |
| `no-input` | read `props`; a render that draws a fixed picture is a still, not a style |
| `one-fixture` | add `fixtures/payload-alt.json` with another shape |
| `same-shape` | change the alt fixture's scene count and `durationSec`, not only its words |
| `pinned-shot-seconds` | widen the range to what the look actually tolerates |
| `pinned-count` / `pinned-length` | `len(scenes)`, `props["totalFrames"]`, `props["durationSec"] × fps` |

## Why this matters more than it sounds

The portal's contract is "a style plus a request". A script-shaped pack breaks it silently: it renders, the run passes
QC, and the video is about the wrong thing — or about the same thing as last time. Warnings are cheap now; a wasted
Muse trial and an owner review are not.