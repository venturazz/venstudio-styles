# Skills

This repo is the source of truth for every VenStudio video style. A style pack (`packs/<id>/`) says what a video looks
like and how the studio's plan maps to the skill that makes it. The skill itself, the agent instructions and the code
an agent runs, lives here too, so Hermes and the Muse agent (Nyx) work from the same reviewed copy.

## Catatan untuk owner (Bahasa Indonesia)

- `skills/curated/` berisi skill yang sudah dikurasi (disetujui owner atau Hermes). `skills/candidate/` berisi skill
  yang sudah diimpor tetapi belum dikurasi. Status sebuah skill adalah foldernya: memindahkan folder = mengubah status.
- Skill dikurasi lewat PR: pindahkan folder ke `skills/curated/` dan tambahkan entri `curation` dengan `by: "hermes"`
  atau `by: "owner"`, `result: "approved"`, versi skill, tanggal, dan catatan apa yang dicek. Owner yang merge.
- Semua 11 skill dari claude-animation-skills sekarang ada di `candidate/`. Belum ada yang dikurasi.
- Dependensi: kode skill ada di foldernya, tetapi skill engine (`stick-figure`, `zach-d-films`) juga butuh `kit`
  bersama (fonts, `setup.sh`) dan yang dipasang `setup.sh`: Playwright + Chromium, Python venv, dan model sekitar 1 GB.
  Itu belum ada di repo ini dan belum di-pin dengan hash. Lihat "Delivery".

## Layout

```
skills/
  curated/<id>/      approved by the owner or Hermes (the last curation entry says who, for which version, and why)
  candidate/<id>/    imported, not curated yet
  kits/<id>/         shared files several skills use (claude-animation-skills' kit/)
```

Each skill folder holds `skill.json` and `files/`, the skill exactly as it is upstream (`files/SKILL.md` first). Each kit
folder holds `kit.json`, the upstream `LICENSE` and `files/`. The manifest pins the source (repository, full commit,
path, licence, copyright line) and the sha256 of every file in `files/`, so any change shows up in review.

`skill.json`:

| Field | Meaning |
| --- | --- |
| `format` | 1 |
| `id`, `name` | The folder name, and the command (`/<id>`) packs name in `hermes.skill` |
| `version` | Semver. Bump it with every change to `files/` |
| `status` | `candidate` or `curated`, the same as the folder it is in |
| `aliases` | Other commands for the same skill (usually empty) |
| `description` | From the SKILL.md front matter |
| `source` | `{ repo, commit, path, licence, copyright }` |
| `kit` | The kit in `skills/kits/` the skill expects at `../../kit`, or null |
| `entry` | `SKILL.md` |
| `requires` | What the machine needs: `ffmpeg`, `node`, `npm`, `python3`, `chromium` |
| `packs` | The packs made with this skill (each must name it in `hermes.skill`) |
| `curation` | Decisions, oldest first: `{ by: "owner" \| "hermes", result: "approved" \| "rejected", date, version, notes }` |
| `notes` | Free text |
| `files` | Every file in `files/` with its sha256 (`node tools/skills.mjs --digest skills/<status>/<id>`) |

`node tools/skills.mjs` checks all of it, and that every hermes pack's skill is here. CI runs it.

## Curating a skill

1. Hermes (or the owner) tries the skill: a trial run of its pack, or a render in Hermes.
2. A PR moves `skills/candidate/<id>` to `skills/curated/<id>`, sets `status: "curated"` and adds a curation entry with
   `result: "approved"` and the current `version`. The notes say what was checked (which runs, which scores).
3. The owner merges. A later entry with `result: "rejected"` (or a version bump without a new approval) fails the
   check until the skill goes back to `candidate/` or is approved again.

Changing a curated skill (fixing a step for Muse, say) is a version bump and a new approval.

## Importing a skill

Copy the upstream folder to `skills/candidate/<id>/files/` unchanged, write `skill.json` with the source commit, run
`node tools/skills.mjs --digest skills/candidate/<id>` for `files`, and open a PR. Only a source whose licence allows
redistribution (MIT here) may be imported; keep its copyright line.

## Delivery (next)

The plan, not built yet: venstudio vendors `skills/` with the packs, and the signed worker update delivers curated
skills to the workers that run agent tasks, laid out as upstream expects (`<root>/skills/<id>`, `<root>/kit`). A Muse
render then goes only to a worker that has the pack's skill. What a kit installs (Playwright and Chromium, the Python
packages, the models) needs a pinned recipe with sha256 for every download, the same rules as a pack `environment`
(FORMAT.md, "Environments"), before a worker installs it. Upstream `setup.sh` pins none of them, and the word aligner
model comes as `tar.bz2`, which the environment format does not unpack yet.
