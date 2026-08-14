# Scene asset scripts

One-off Node tools that **generate, bake and audit** the scene assets in
`public/background/` — the homepage causeway, the `/projects` workshop and the
`/qualifications` corridor. Nothing here runs at build time or in the app: the
site ships the baked `.webp` / `.mp4` output, and these scripts exist so that
output is reproducible rather than a mystery binary.

They are kept because the README and CHANGELOG cite them by name as the
provenance of each asset. A claim like "the plate is graded at saturation 0.80"
is only checkable if the grade script is in the repo.

## Running them

**Always from the repo root** — every path inside is repo-relative:

```bash
node scripts/scene/detect-lights.mjs           # measures the lantern rig off the plate
node scripts/scene/bake-home-grade.mjs         # regrades the hero plate from its source
scripts/scene/bake-table-flames.sh             # full flame-warp bake for /projects
```

The ones that call the AI Gateway need credentials, so they take the env file
explicitly:

```bash
node --env-file=.env.local scripts/scene/gen-home-hero.mjs
```

## Contract

| | |
|:--|:--|
| **Working dir** | `./.scene-work` (gitignored, created on demand). Override with `SCRATCH=/some/path`. Raw clips and intermediate frames live here — never in `public/`, and never in `TMPDIR`: a graded master or a decoded rgb24 stream is the input to every stage after it, so a directory the OS may sweep turns "re-cut that loop at a different fade" into a full re-grade. The shell scripts take a named subdirectory (`projects-scene/`, `table-flames/`); filenames are fixed, so a rerun overwrites rather than accumulating. |
| **ffmpeg** | Resolved in this order, in all 11 scripts that run it: **`FFMPEG=/path/to/ffmpeg`** if set, otherwise the binary from the **`ffmpeg-static` devDependency**. `PATH` is never consulted — a system ffmpeg is neither required nor used, and there is none on the machine this scene was built on, so a PATH fallback would only mean *some* machines silently encoding with a different build. On a fresh checkout that means **`npm install` first**: without `node_modules`, the two shell scripts exit with `ffmpeg not found — run npm install, or set FFMPEG=…` and the `.mjs` throw on spawn. `ffprobe` is not used anywhere (`ffmpeg-static` does not ship one). |
| **Inputs** | Ungraded/source artwork lives in `assets/source/`, **not** `public/` — a build input should not be deployed and served. |
| **Outputs** | Only the finished asset is written into `public/background/`. |
| **Secrets** | Read from `process.env` only. Never hard-code a key here (see `CLAUDE.md` §1). |

## What's here

**Generate** (AI Gateway) — `gen-home-hero` · `gen-home-scene` ·
`gen-causeway-video` · `gen-projects-scene`

**Bake** (composite the shipped asset) — `bake-home-grade` ·
`bake-causeway-water` · `bake-scene-frames` · `bake-table-flames` ·
`bake-rug-seal` · `remask-causeway-posts` · `finish-home-hero` ·
`finish-projects-scene.sh` · `bake-table-flames.sh`

**Measure / detect** (derive geometry from the artwork rather than eyeballing
it) — `detect-lights` · `detect-table-flames` · `measure-flames` ·
`find-loop-point` · `close-loop`

**Audit** (prove a shipped asset actually does what the CHANGELOG says) —
`scene-verify` · `seam-check` · `swap-check` · `ghost-hunt` · `motion-check` ·
`hero-crop-audit`
