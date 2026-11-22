# Vendored Remotion runtime

`runtime/remotion/` is a copy of venstudio's `apps/render-remotion` runtime files (the list is `RUNTIME_FILES` in
`tools/assemble-remotion.mjs`, the same as `REMOTION_RUNTIME_FILES` in venstudio `apps/portal/lib/install-bundle.ts`).
It is here only so this repo's CI can typecheck and render the Remotion packs without the venstudio code.

The source of truth is venstudio. Copied from venstudio branch `feat/style-registry` (Phase 1 of the style system).
To refresh it, copy those files from a venstudio checkout; `scripts/sync-styles.mjs` in venstudio warns when the two
copies differ.

# Vendored html-capture runtime

`runtime/html-capture/venstudio-worker.ts` is a byte-for-byte copy of venstudio's `apps/worker/venstudio-worker.ts`
(worker 0.11.0, branch `feat/html-design`: page mode for html-design packs and preview-frames). CI uses only its `capture-html` command, which renders an html-capture
pack's fixture exactly as a worker draws it: the same loopback server, request blocking, virtual clock, Chromium
flags and ffmpeg encode. It needs Node 22.18 or later (type stripping) and no packages; the browser is the Chrome
Headless Shell of the assembled Remotion project (`npx remotion browser ensure`).

The source of truth is venstudio; `scripts/sync-styles.mjs` there warns when this copy differs from its worker.
