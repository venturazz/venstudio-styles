/**
 * The things a flat-vector explainer draws, one component per element kind. Everything is SVG or CSS, so a CPU-only
 * machine renders it without WebGL.
 *
 * Data is never invented. A counter counts to `value` only when the storyboard declared it; without one it shows its
 * label and a neutral ring. Bars and gauges plot `series` only when declared; without one they draw muted placeholder
 * shapes and no numbers.
 */
import React from "react";
import { Easing, Img, interpolate, spring, staticFile } from "remotion";
import { barHeights, formatCount, gaugeFraction, seeded, type SceneElement } from "../../props.ts";
import { FONT_FAMILY, type Palette } from "./theme.ts";

export type ElementProps = {
  el: SceneElement;
  /** Slot size in pixels. */
  w: number;
  h: number;
  /** Frame on the element's layer clock, from the start of its scene. */
  frame: number;
  /** Scene length in frames. */
  dur: number;
  fps: number;
  pal: Palette;
  tokens: readonly string[];
  /** Frames to wait before the element enters. */
  delay: number;
  /** 1% of the shorter side of the video. */
  u: number;
};

const clamp = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;

/** 0 to 1 over `frames` frames after `delay`, eased. */
export function ramp(frame: number, delay: number, frames: number): number {
  return interpolate(frame, [delay, delay + Math.max(1, frames)], [0, 1], { ...clamp, easing: Easing.out(Easing.cubic) });
}

/** Entrance: a springy pop with the `pop` token, a short rise otherwise. */
export function entrance(p: Pick<ElementProps, "frame" | "fps" | "delay" | "tokens">): React.CSSProperties {
  const f = p.frame - p.delay;
  if (p.tokens.includes("pop")) {
    const s = spring({ frame: f, fps: p.fps, config: { damping: 12, mass: 0.6 } });
    return { opacity: interpolate(f, [0, 4], [0, 1], clamp), transform: `scale(${0.6 + 0.4 * s})` };
  }
  const t = ramp(p.frame, p.delay, 12);
  return { opacity: t, transform: `translateY(${(1 - t) * 6}%)` };
}

const textStyle = (pal: Palette, size: number, weight: number): React.CSSProperties => ({
  fontFamily: FONT_FAMILY,
  color: pal.ink,
  fontSize: size,
  fontWeight: weight,
  lineHeight: 1.12,
  letterSpacing: "-0.01em",
  textAlign: "center",
  overflowWrap: "break-word",
});

function Label({ text, pal, u, top }: { text?: string; pal: Palette; u: number; top?: number }) {
  if (!text) return null;
  return <div style={{ ...textStyle(pal, u * 3.4, 700), opacity: 0.85, marginTop: top ?? u * 1.5, maxWidth: "100%" }}>{text}</div>;
}

export function Heading(p: ElementProps) {
  const size = Math.min(p.u * 7, p.h / 2.4);
  const underline = p.tokens.includes("scribble") || p.tokens.includes("draw");
  const draw = ramp(p.frame, p.delay + 10, 18);
  return (
    <div style={{ width: p.w, height: p.h, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", ...entrance(p) }}>
      <div style={{ ...textStyle(p.pal, size, 800), display: "-webkit-box", WebkitLineClamp: 3, WebkitBoxOrient: "vertical", overflow: "hidden" }}>{p.el.text ?? ""}</div>
      {underline ? (
        <svg width={p.w * 0.5} height={p.u * 3} viewBox="0 0 100 10" preserveAspectRatio="none" style={{ marginTop: p.u }}>
          <path d="M2 6 C 20 2, 35 9, 50 5 S 80 2, 98 6" fill="none" stroke={p.pal.accent} strokeWidth={3} strokeLinecap="round" pathLength={1} strokeDasharray={1} strokeDashoffset={1 - draw} />
        </svg>
      ) : null}
    </div>
  );
}

export function Callout(p: ElementProps) {
  const size = Math.min(p.u * 4.2, p.h / 3);
  return (
    <div style={{ width: p.w, height: p.h, display: "flex", alignItems: "center", justifyContent: "center", ...entrance(p) }}>
      <div style={{ position: "relative", background: p.pal.card, borderRadius: p.u * 3, padding: `${p.u * 2.2}px ${p.u * 3.4}px`, boxShadow: `0 ${p.u * 0.8}px 0 ${p.pal.muted}`, maxWidth: p.w * 0.92, borderLeft: `${p.u * 1.2}px solid ${p.pal.accent}` }}>
        <div style={textStyle(p.pal, size, 750)}>{p.el.text ?? ""}</div>
      </div>
    </div>
  );
}

export function Counter(p: ElementProps) {
  const target = typeof p.el.value === "number" ? p.el.value : null;
  const t = ramp(p.frame, p.delay, Math.max(12, Math.round(p.dur * 0.6)));
  const side = Math.min(p.w, p.h * 0.8);
  const r = 42;
  const c = 2 * Math.PI * r;
  const big = target !== null ? formatCount(target * t, target) : p.el.text ?? "";
  const size = Math.min(side * 0.22, (side * 1.4) / Math.max(4, big.length));
  return (
    <div style={{ width: p.w, height: p.h, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", ...entrance(p) }}>
      <div style={{ position: "relative", width: side * 0.8, height: side * 0.8 }}>
        <svg viewBox="0 0 100 100" width="100%" height="100%">
          <circle cx={50} cy={50} r={r} fill="none" stroke={p.pal.muted} strokeWidth={6} />
          <circle cx={50} cy={50} r={r} fill="none" stroke={target !== null ? p.pal.accent : p.pal.accent2} strokeWidth={6} strokeLinecap="round" strokeDasharray={c} strokeDashoffset={c * (1 - t)} transform="rotate(-90 50 50)" />
        </svg>
        <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", ...textStyle(p.pal, size, 800), fontVariantNumeric: "tabular-nums" }}>{big}</div>
      </div>
      {target !== null ? <Label text={p.el.text} pal={p.pal} u={p.u} /> : null}
    </div>
  );
}

/** Placeholder bar heights for a chart with no declared data. A shape, not a claim. */
const NEUTRAL_BARS = [0.42, 0.68, 0.52, 0.84];

function fmt(v: number): string {
  return Number.isInteger(v) ? formatCount(v, v) : formatCount(v, Math.round(v * 100) / 100);
}

export function Bars(p: ElementProps) {
  const declared = barHeights(p.el.series);
  const has = declared.length > 0;
  const heights = has ? declared : NEUTRAL_BARS;
  const n = heights.length;
  const chartH = p.h * (p.el.text ? 0.72 : 0.86);
  const gap = (p.w * 0.08) / Math.max(1, n);
  const barW = Math.min(p.u * 14, (p.w * 0.84 - gap * (n - 1)) / n);
  const grows = p.tokens.includes("bar") || p.tokens.includes("draw") || p.tokens.includes("pop");
  return (
    <div style={{ width: p.w, height: p.h, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "flex-end", opacity: ramp(p.frame, p.delay, 8) }}>
      <div style={{ display: "flex", alignItems: "flex-end", gap, height: chartH, borderBottom: `${p.u * 0.5}px solid ${p.pal.ink}` }}>
        {heights.map((hgt, i) => {
          const t = grows ? ramp(p.frame, p.delay + 4 + i * 5, 16) : ramp(p.frame, p.delay, 10);
          const v = has ? (p.el.series as number[])[i] : null;
          return (
            <div key={i} style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "flex-end", height: "100%" }}>
              {v !== null ? <div style={{ ...textStyle(p.pal, p.u * 3, 700), opacity: t, marginBottom: p.u * 0.6 }}>{fmt(v)}</div> : null}
              <div style={{ width: barW, height: Math.max(p.u * 0.6, (chartH - p.u * 5) * hgt * t), background: has ? (i === n - 1 ? p.pal.accent : p.pal.accent2) : p.pal.muted, borderRadius: `${p.u * 1.2}px ${p.u * 1.2}px 0 0` }} />
            </div>
          );
        })}
      </div>
      <Label text={p.el.text} pal={p.pal} u={p.u} />
    </div>
  );
}

export function Gauge(p: ElementProps) {
  const fraction = gaugeFraction(p.el.series);
  const t = ramp(p.frame, p.delay, Math.max(14, Math.round(p.dur * 0.5)));
  const side = Math.min(p.w, p.h * 1.5);
  const arc = "M 10 55 A 40 40 0 0 1 90 55";
  const len = Math.PI * 40;
  const shown = fraction === null ? 0 : fraction * t;
  const angle = -90 + 180 * shown;
  const series = p.el.series ?? [];
  const unit = series.every((v) => v >= 0 && v <= 1);
  const readout = fraction === null ? null : unit ? `${Math.round(shown * 100)}%` : fmt(series[series.length - 1] * t);
  return (
    <div style={{ width: p.w, height: p.h, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", opacity: ramp(p.frame, p.delay, 8) }}>
      <svg viewBox="0 0 100 62" width={side * 0.8} height={side * 0.5}>
        <path d={arc} fill="none" stroke={p.pal.muted} strokeWidth={8} strokeLinecap="round" pathLength={1} strokeDasharray={1} strokeDashoffset={fraction === null ? 1 - t : 0} />
        {fraction !== null ? (
          <>
            <path d={arc} fill="none" stroke={p.pal.accent} strokeWidth={8} strokeLinecap="round" strokeDasharray={len} strokeDashoffset={len * (1 - shown)} />
            <g transform={`rotate(${angle} 50 55)`}>
              <line x1={50} y1={55} x2={50} y2={22} stroke={p.pal.ink} strokeWidth={3} strokeLinecap="round" />
            </g>
            <circle cx={50} cy={55} r={4} fill={p.pal.ink} />
          </>
        ) : null}
      </svg>
      {readout ? <div style={{ ...textStyle(p.pal, p.u * 6, 800), fontVariantNumeric: "tabular-nums" }}>{readout}</div> : null}
      <Label text={p.el.text} pal={p.pal} u={p.u} top={p.u * 0.5} />
    </div>
  );
}

export function Tally(p: ElementProps) {
  const count = typeof p.el.value === "number" ? Math.max(0, Math.min(30, Math.round(Math.abs(p.el.value)))) : null;
  const t = ramp(p.frame, p.delay, Math.max(12, Math.round(p.dur * 0.6)));
  const markH = Math.min(p.h * 0.45, p.u * 12);
  if (count === null) {
    // No declared count: a row of dots that pulse, which says "several" without saying how many.
    return (
      <div style={{ width: p.w, height: p.h, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", opacity: ramp(p.frame, p.delay, 8) }}>
        <div style={{ display: "flex", gap: p.u * 2 }}>
          {[0, 1, 2, 3, 4].map((i) => (
            <div key={i} style={{ width: p.u * 4, height: p.u * 4, borderRadius: "50%", background: p.pal.accent2, opacity: 0.35 + 0.65 * Math.abs(Math.sin((p.frame - i * 4) / 9)) }} />
          ))}
        </div>
        <Label text={p.el.text} pal={p.pal} u={p.u} />
      </div>
    );
  }
  const shown = Math.round(count * t);
  const groups = Math.ceil(count / 5);
  return (
    <div style={{ width: p.w, height: p.h, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
      <div style={{ display: "flex", flexWrap: "wrap", gap: p.u * 3, justifyContent: "center", maxWidth: p.w * 0.9 }}>
        {Array.from({ length: groups }, (_, g) => {
          const inGroup = Math.max(0, Math.min(5, shown - g * 5));
          return (
            <svg key={g} viewBox="0 0 50 50" width={markH} height={markH}>
              {[0, 1, 2, 3].map((k) => (k < inGroup ? <line key={k} x1={8 + k * 10} y1={6} x2={8 + k * 10} y2={44} stroke={p.pal.ink} strokeWidth={4} strokeLinecap="round" /> : null))}
              {inGroup === 5 ? <line x1={2} y1={40} x2={46} y2={10} stroke={p.pal.accent} strokeWidth={4} strokeLinecap="round" /> : null}
            </svg>
          );
        })}
      </div>
      <Label text={p.el.text} pal={p.pal} u={p.u} />
    </div>
  );
}

export function Arrow(p: ElementProps) {
  const draw = ramp(p.frame, p.delay, 20);
  return (
    <div style={{ width: p.w, height: p.h, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
      <svg viewBox="0 0 100 40" width={p.w * 0.8} height={Math.min(p.h * 0.6, p.w * 0.32)}>
        <path d="M6 30 C 30 4, 62 4, 88 22" fill="none" stroke={p.pal.accent} strokeWidth={4.5} strokeLinecap="round" pathLength={1} strokeDasharray={1} strokeDashoffset={1 - draw} />
        <path d="M78 14 L 90 23 L 77 29" fill="none" stroke={p.pal.accent} strokeWidth={4.5} strokeLinecap="round" strokeLinejoin="round" opacity={draw > 0.95 ? 1 : 0} />
      </svg>
      <Label text={p.el.text} pal={p.pal} u={p.u} />
    </div>
  );
}

export function Diagram(p: ElementProps) {
  const draw = ramp(p.frame, p.delay + 6, 22);
  const nodes = [
    { x: 18, y: 50 },
    { x: 50, y: 22 },
    { x: 82, y: 50 },
  ];
  return (
    <div style={{ width: p.w, height: p.h, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", ...entrance(p) }}>
      <svg viewBox="0 0 100 70" width={p.w * 0.85} height={Math.min(p.h * 0.75, p.w * 0.6)}>
        <path d="M18 50 L 50 22 L 82 50" fill="none" stroke={p.pal.ink} strokeWidth={2.5} strokeLinecap="round" pathLength={1} strokeDasharray={1} strokeDashoffset={1 - draw} />
        {nodes.map((n, i) => (
          <circle key={i} cx={n.x} cy={n.y} r={9 * ramp(p.frame, p.delay + i * 6, 10)} fill={i === 1 ? p.pal.accent : p.pal.accent2} />
        ))}
      </svg>
      <Label text={p.el.text} pal={p.pal} u={p.u} top={0} />
    </div>
  );
}

/** Drifting dots over the whole scene. Seeded by scene, so a re-render puts them in the same place. */
export function Particles({ width, height, frame, seed, pal }: { width: number; height: number; frame: number; seed: number; pal: Palette }) {
  const rnd = seeded(seed * 97 + 13);
  const dots = Array.from({ length: 26 }, () => ({ x: rnd(), y: rnd(), r: 0.4 + rnd() * 1.1, speed: 0.15 + rnd() * 0.35, phase: rnd() * 6.28 }));
  return (
    <svg width={width} height={height} viewBox="0 0 100 100" preserveAspectRatio="none" style={{ position: "absolute", inset: 0, pointerEvents: "none" }}>
      {dots.map((d, i) => {
        const y = (((d.y * 100 - frame * d.speed) % 100) + 100) % 100;
        const x = d.x * 100 + Math.sin(frame / 30 + d.phase) * 1.5;
        return <ellipse key={i} cx={x} cy={y} rx={d.r * (height / width)} ry={d.r} fill={i % 3 === 0 ? pal.accent : pal.accent2} opacity={0.35} />;
      })}
    </svg>
  );
}

/** The shot picture in a card, or a flat placeholder landscape when the scene has a plate but no picture. */
export function Plate({ image, w, h, frame, dur, pal, tokens, camera, u }: { image: string | null; w: number; h: number; frame: number; dur: number; pal: Palette; tokens: readonly string[]; camera: boolean; u: number }) {
  const p = frame / Math.max(1, dur);
  // Ken Burns inside the card: the stills look the storyboard picture already has, but slower. Never fully still, so
  // a long scene does not read as a frozen picture (qc-video flags 4 s without change).
  const zoom = tokens.includes("pull") ? 1.12 - 0.1 * p : camera || tokens.includes("push") ? 1.02 + 0.1 * p : 1.03 + 0.04 * p;
  const panX = tokens.includes("drift") || tokens.includes("parallax") ? -2 + 4 * p : 0;
  const reveal = tokens.includes("blot") ? ramp(frame, 0, 16) : 1;
  const morph = tokens.includes("morph") ? ramp(frame, 0, 22) : 1;
  const flicker = tokens.includes("flicker") && frame < 16 ? (Math.floor(frame / 2) % 2 === 0 ? 1 : 0.55) : 1;
  const radius = u * 3 + (1 - morph) * Math.min(w, h) * 0.5;
  return (
    <div
      style={{
        width: w,
        height: h,
        borderRadius: radius,
        overflow: "hidden",
        background: pal.muted,
        boxShadow: `0 ${u}px 0 ${pal.muted}`,
        opacity: flicker,
        transform: `scale(${0.88 + 0.12 * morph})`,
        clipPath: reveal < 1 ? `circle(${reveal * 75}% at 50% 50%)` : undefined,
      }}
    >
      {image ? (
        <Img src={staticFile(image)} style={{ width: "100%", height: "100%", objectFit: "cover", transform: `scale(${zoom}) translateX(${panX}%)` }} />
      ) : (
        <svg viewBox="0 0 100 100" preserveAspectRatio="xMidYMid slice" width="100%" height="100%" style={{ transform: `scale(${zoom}) translateX(${panX}%)` }}>
          <rect width={100} height={100} fill={pal.accent2} opacity={0.35} />
          <circle cx={72} cy={30} r={11} fill={pal.accent} opacity={0.9} />
          <path d="M0 70 Q 25 52 50 66 T 100 60 V 100 H 0 Z" fill={pal.ink} opacity={0.35} />
          <path d="M0 82 Q 30 68 60 80 T 100 76 V 100 H 0 Z" fill={pal.ink} opacity={0.6} />
        </svg>
      )}
    </div>
  );
}

export const DATA_KINDS = ["counter", "bar", "gauge", "tally", "arrow", "diagram"] as const;
export const TEXT_KINDS = ["heading", "callout"] as const;

export function DataElement(p: ElementProps) {
  switch (p.el.kind) {
    case "counter":
      return <Counter {...p} />;
    case "bar":
      return <Bars {...p} />;
    case "gauge":
      return <Gauge {...p} />;
    case "tally":
      return <Tally {...p} />;
    case "arrow":
      return <Arrow {...p} />;
    case "diagram":
      return <Diagram {...p} />;
    default:
      return null;
  }
}

export function TextElement(p: ElementProps) {
  return p.el.kind === "heading" ? <Heading {...p} /> : <Callout {...p} />;
}
