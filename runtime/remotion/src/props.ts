/**
 * The props a VenStudio worker hands to a template, and the timeline arithmetic templates share. Pure, no React, so
 * `node --test` can check it without Remotion installed.
 *
 * The worker builds these props from the render-video payload (`buildRemotionProps` in
 * apps/worker/venstudio-worker.ts). Types are `type` aliases, not interfaces, because Remotion wants props that are
 * assignable to Record<string, unknown>.
 */

/** One thing on screen. `value` and `series` exist only when the storyboard declared them: never assume them. */
export type SceneElement = {
  kind: string;
  text?: string;
  value?: number;
  series?: number[];
};

export type SceneLayer = { id: string; frames: number; fps: number };

/** Same shape as `Scene` in apps/portal/lib/studio/scene-plan.ts. */
export type Scene = {
  shotRef: string;
  seconds: number;
  beatRole: string;
  elements: SceneElement[];
  tokens: string[];
  camera: boolean;
  layers: SceneLayer[];
};

export type Caption = { start: number; end: number; text: string };

/**
 * Caption geometry from the portal, already scaled to the frame (worker 0.7.0+). Same shape as `CaptionSpec` in
 * apps/portal/lib/studio/caption-spec.ts. Absent: the template keeps its own look.
 */
export type CaptionStyle = {
  fontAssetId: string | null;
  fontSizePx: number;
  minFontSizePx: number;
  maxFontSizePx: number;
  lineSpacingPx: number;
  outlinePx: number;
  shadowPx: number;
  marginXPx: number;
  marginBottomPx: number;
  maxWidthPx: number;
  narrowFace: boolean;
  safeAreaPct: number;
};

/** Where each scene sits, in whole frames. Same numbers as the worker's xfadeTimeline. */
export type Timeline = {
  fadeFrames: number;
  startFrames: number[];
  frames: number[];
  totalFrames: number;
};

export type TemplateProps = {
  template: string;
  width: number;
  height: number;
  fps: number;
  transitionSec: number;
  durationSec: number;
  /** One per scene, same order. `image` is a file name in the render's public dir, or null for none. */
  shots: Array<{ shotRef: string; seconds: number; image: string | null }>;
  scenes: Scene[];
  captions: Caption[];
  /** Narration file in the public dir. The worker renders muted and adds the narration itself, so it sends null. */
  narration: string | null;
  /** Font file in the public dir for headings and captions, or null for the system font. */
  font: string | null;
  /** Precomputed by the worker. Templates compute it from `shots` when it is absent (Studio preview). */
  timeline?: Timeline;
  /** Caption geometry to draw with. Absent or null: the template's own caption look. */
  captionStyle?: CaptionStyle | null;
};

const round3 = (n: number) => Math.round(n * 1000) / 1000;

/** Shot starts after the fade overlaps. Mirror of planCrossFades (portal) without its refusals. */
export function shotStarts(seconds: readonly number[], transitionSec: number): { starts: number[]; totalSec: number } {
  const n = seconds.length;
  if (n === 0) return { starts: [], totalSec: 0 };
  const d = n < 2 ? 0 : Math.max(0, transitionSec);
  const starts: number[] = [0];
  for (let i = 1; i < n; i++) starts.push(round3(starts[i - 1] + seconds[i - 1] - d));
  return { starts, totalSec: round3(starts[n - 1] + seconds[n - 1]) };
}

/** Boundaries snapped to frames once, on the shared timeline, so rounding never accumulates from scene to scene. */
export function timelineFor(seconds: readonly number[], transitionSec: number, fps: number): Timeline {
  const { starts, totalSec } = shotStarts(seconds, transitionSec);
  const n = starts.length;
  const fadeFrames = n < 2 ? 0 : Math.round(Math.max(0, transitionSec) * fps);
  const startFrames = starts.map((s) => Math.round(s * fps));
  const totalFrames = Math.max(1, Math.round(totalSec * fps));
  const frames = startFrames.map((f, i) => Math.max(1, (i < n - 1 ? startFrames[i + 1] + fadeFrames : totalFrames) - f));
  return { fadeFrames, startFrames, frames, totalFrames };
}

export type TransitionName = "none" | "fade" | "slideup" | "wipeleft" | "circleopen";
const TRANSITION_CYCLE: readonly TransitionName[] = ["fade", "slideup", "fade", "wipeleft", "fade", "circleopen"];

/** Transition into scene `index`, fixed by position. Mirror of transitionFor in render-engine.ts. */
export function transitionFor(index: number): TransitionName {
  if (index <= 0) return "none";
  return TRANSITION_CYCLE[(index - 1) % TRANSITION_CYCLE.length];
}

/**
 * The frame a layer shows at composition frame `frame`, on the layer's own clock. A layer of 1 frame never changes;
 * a layer at 10 fps in a 30 fps video holds each of its frames for three video frames.
 */
export function layerFrame(frame: number, fps: number, layer: SceneLayer | undefined): number {
  if (!layer) return frame;
  if (layer.frames <= 1) return 0;
  if (!(layer.fps > 0) || layer.fps >= fps) return frame;
  const step = fps / layer.fps;
  return Math.floor(frame / step) * step;
}

/** Plot heights in 0..1 for a declared series. Negative values sit on the baseline. Empty when there is no series. */
export function barHeights(series: readonly number[] | undefined): number[] {
  if (!series || series.length === 0) return [];
  const max = Math.max(...series.map((v) => Math.abs(v)));
  if (!(max > 0)) return series.map(() => 0);
  return series.map((v) => Math.max(0, v) / max);
}

/** Needle position in 0..1 for a declared gauge series (its last value), or null when the gauge has no data. */
export function gaugeFraction(series: readonly number[] | undefined): number | null {
  if (!series || series.length === 0) return null;
  const last = series[series.length - 1];
  if (series.every((v) => v >= 0 && v <= 1)) return last;
  const max = Math.max(...series.map((v) => Math.abs(v)));
  return max > 0 ? Math.max(0, Math.min(1, last / max)) : 0;
}

/** A number as the counter shows it on its way to `target`: as many decimals as the target has, at most two. */
export function formatCount(current: number, target: number): string {
  const decimals = Number.isInteger(target) ? 0 : Math.min(2, (String(target).split(".")[1] ?? "").length);
  const fixed = current.toFixed(decimals);
  const [int, frac] = fixed.split(".");
  const grouped = int.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return frac ? `${grouped}.${frac}` : grouped;
}

/** How the caption box is laid out, in pixels. Pure, so node --test can check it without React. */
export type CaptionLayout = {
  /** Box styling: the template's own dark card, or bare outlined text when a style is given. */
  boxed: boolean;
  fontSize: number;
  lineHeight: number;
  maxWidth: number;
  paddingBottom: number;
  /** Outline width drawn behind the fill (a CSS stroke is centred on the edge, so this is twice the outline). */
  strokeWidth: number;
  textShadow: string | null;
};

/**
 * The caption box for a frame. With a style: its size, line spacing, wrap width, bottom margin, outline and shadow,
 * exactly. Without one: the look the template had before styles existed.
 */
export function captionLayout(style: CaptionStyle | null | undefined, width: number, height: number): CaptionLayout {
  if (!style) {
    const u = Math.min(width, height) / 100;
    const portrait = height >= width;
    const fontSize = u * (portrait ? 4.2 : 3.6);
    return { boxed: true, fontSize, lineHeight: 1.25, maxWidth: width * 0.86, paddingBottom: height * (portrait ? 0.07 : 0.06), strokeWidth: 0, textShadow: null };
  }
  return {
    boxed: false,
    fontSize: style.fontSizePx,
    lineHeight: (style.fontSizePx + style.lineSpacingPx) / style.fontSizePx,
    maxWidth: style.maxWidthPx,
    paddingBottom: style.marginBottomPx,
    strokeWidth: style.outlinePx * 2,
    textShadow: style.shadowPx > 0 ? `${style.shadowPx}px ${style.shadowPx}px 0 rgba(0, 0, 0, 0.6)` : null,
  };
}

/** The caption on screen at `t` seconds, if any. */
export function captionAt(captions: readonly Caption[], t: number): Caption | null {
  for (const c of captions) if (t >= c.start && t < c.end) return c;
  return null;
}

/** A small deterministic generator, so particles land in the same place on every render of the same plan. */
export function seeded(seed: number): () => number {
  let s = (Math.abs(Math.floor(seed)) % 2147483646) + 1;
  return () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

/** Props for Studio preview and the install probe: the golden fixture's scenes, no image files. */
export const SAMPLE_PROPS: TemplateProps = {
  template: "explainer-flat-vector",
  width: 1080,
  height: 1920,
  fps: 30,
  transitionSec: 0.5,
  durationSec: 8,
  shots: [
    { shotRef: "shot-01", seconds: 2.75, image: null },
    { shotRef: "shot-02", seconds: 3, image: null },
    { shotRef: "shot-03", seconds: 3.25, image: null },
  ],
  scenes: [
    { shotRef: "shot-01", seconds: 2.5, beatRole: "hook", elements: [{ kind: "heading", text: "Iron is everywhere" }, { kind: "plate" }], tokens: ["pop"], camera: true, layers: [{ id: "plate", frames: 1, fps: 1 }, { id: "scene", frames: 75, fps: 30 }] },
    { shotRef: "shot-02", seconds: 2.5, beatRole: "setup", elements: [{ kind: "counter", text: "degrees", value: 1400 }, { kind: "bar", text: "no data declared" }], tokens: ["counter", "bar"], camera: false, layers: [{ id: "scene", frames: 75, fps: 30 }] },
    { shotRef: "shot-03", seconds: 3, beatRole: "body", elements: [{ kind: "bar", text: "draw ratio", series: [0.2, 0.45, 0.7, 0.95] }, { kind: "gauge", text: "heat" }], tokens: ["draw", "bar"], camera: true, layers: [{ id: "scene", frames: 90, fps: 30 }] },
  ],
  captions: [
    { start: 0, end: 2.5, text: "Iron is everywhere." },
    { start: 2.5, end: 8, text: "The furnace reaches 1400 degrees." },
  ],
  narration: null,
  font: null,
};
