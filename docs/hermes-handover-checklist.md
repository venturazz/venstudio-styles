# Hermes handover checklist

Load this when handing a style over (full guide: docs/hermes-handover.md; format: FORMAT.md "Environments").

**Before you start**

- [ ] The style renders in Hermes with my own tools, without manual steps.
- [ ] The owner ran a trial of it and liked it.
- [ ] Every tool installs without root on Ubuntu x86-64 from pinned files (release asset, npm lockfile, PyPI wheels).
- [ ] It renders on 2 CPUs without a GPU; I measured seconds of render per second of video.

**The pack (`packs/<id>/`, PR to `main`)**

- [ ] `style.json`: `engine: "command"`, `minWorkerVersion: "0.12.0"`, `status: "draft"`, contract from my trials,
      `workflow`, `provenance` with every source's licence, `curation` empty or real only.
- [ ] `render/`: text files only; reads `{props}`, writes `{out}`; no network, seeded randomness only.
- [ ] `environment`: `id`, `version`, `platforms: ["linux-x64"]`, every host in `hosts`, `requires`, `steps`, `probe`,
      `render`, `licences`.
- [ ] Each download: https, `sha256` and `bytes` from the real file (hash source written in the licence `notes`).
- [ ] npm: `env/package.json` + `env/package-lock.json` (v3, integrity on every entry), no install scripts.
- [ ] pip: `env/requirements.txt`, every line `name==version --hash=sha256:...`, wheels only.
- [ ] argv arrays only; `argv[0]` is `node`, `python`, `ffmpeg` or `{envDir}/...`; placeholders from the closed set.
- [ ] The probe proves the tools load and work, in seconds, and prints a line its `stdout` regex matches.
- [ ] png-frames: exactly `{frames}` files `000000.png`... at the job's size (or one mp4 at `{out}`).
- [ ] `fixtures/payload.json` (`engine: "command"`, `scenePlan.template` = pack id) and `fixtures/expect.json`.
- [ ] `README.md` with `## Provenance` and `## Status`.

**Never**

- [ ] No credentials, tokens, keys, cookies, signed or private URLs, private data, uploads or real scripts.
- [ ] No invented hash, CI run or research-source entry.
- [ ] No `sudo`, shell strings, `bash -c`, `node -e`, `python -c`, PATH programs.

**Before opening the PR**

- [ ] `node tools/validate.mjs` and `node --test "tools/*.test.mjs"` pass.
- [ ] As a non-root user: `env-install`, `render-command` and `tools/check-video.mjs` pass (CONTRIBUTING.md).
- [ ] The PR says which tools and versions Hermes used, where each hash came from, and how long the fixture takes.
- [ ] After CI is green: the owner merges. The pack stays at draft, lab or trial until the owner promotes it.
