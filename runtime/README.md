# Vendored Remotion runtime

`runtime/remotion/` is a copy of venstudio's `apps/render-remotion` runtime files (the list is `RUNTIME_FILES` in
`tools/assemble-remotion.mjs`, the same as `REMOTION_RUNTIME_FILES` in venstudio `apps/portal/lib/install-bundle.ts`).
It is here only so this repo's CI can typecheck and render the Remotion packs without the venstudio code.

The source of truth is venstudio. Copied from venstudio branch `feat/style-registry` (Phase 1 of the style system).
To refresh it, copy those files from a venstudio checkout; `scripts/sync-styles.mjs` in venstudio warns when the two
copies differ.
