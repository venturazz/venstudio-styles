/**
 * The pack's entry point for the Remotion runtime. The runtime's bundle builder installs this directory as
 * src/packs/explainer-flat-vector/ and lists `composition` in the generated src/packs/index.ts, so imports of the
 * runtime's shared helpers are relative to that installed place ("../../props.ts").
 */
import type { PackComposition } from "../../compositions.ts";
import { FlatVectorExplainer } from "./FlatVectorExplainer.tsx";

export const composition: PackComposition = { id: "flat-vector-explainer", component: FlatVectorExplainer };
