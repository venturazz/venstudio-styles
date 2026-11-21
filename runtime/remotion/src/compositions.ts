/**
 * What a style pack's render project exports for the runtime. Each Remotion pack has render/index.tsx exporting
 * `composition`; the bundle builder (apps/portal/lib/install-bundle.ts) installs the pack as src/packs/<pack id>/ and
 * lists it in the generated src/packs/index.ts, which Root.tsx registers. Types only.
 */
import type React from "react";
import type { TemplateProps } from "./props.ts";

export interface PackComposition {
  /** The composition id the worker passes to `remotion render` (style.json renderer.composition). */
  id: string;
  component: React.FC<TemplateProps>;
}
