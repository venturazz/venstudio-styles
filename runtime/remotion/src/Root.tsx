/**
 * One composition per installed style pack. The id is what the worker passes to `remotion render`; the worker maps
 * the scene plan's template (the pack id) to it from src/packs/packs.json, which the bundle builder writes next to
 * the generated src/packs/index.ts. The runtime itself carries no look: every composition comes from a pack.
 */
import React from "react";
import { Composition, type CalculateMetadataFunction } from "remotion";
import { PACK_COMPOSITIONS } from "./packs/index.ts";
import { SAMPLE_PROPS, timelineFor, type TemplateProps } from "./props.ts";

/** Size, frame rate and length come from the job's props, so one composition serves short and long formats. */
export const metadataFromProps: CalculateMetadataFunction<TemplateProps> = ({ props }) => {
  const timeline = props.timeline ?? timelineFor(props.shots.map((s) => s.seconds), props.transitionSec, props.fps);
  return { durationInFrames: timeline.totalFrames, width: props.width, height: props.height, fps: props.fps };
};

const sample = timelineFor(SAMPLE_PROPS.shots.map((s) => s.seconds), SAMPLE_PROPS.transitionSec, SAMPLE_PROPS.fps);

export const RemotionRoot: React.FC = () => (
  <>
    {PACK_COMPOSITIONS.map((c) => (
      <Composition
        key={c.id}
        id={c.id}
        component={c.component}
        defaultProps={SAMPLE_PROPS}
        calculateMetadata={metadataFromProps}
        width={SAMPLE_PROPS.width}
        height={SAMPLE_PROPS.height}
        fps={SAMPLE_PROPS.fps}
        durationInFrames={sample.totalFrames}
      />
    ))}
  </>
);
