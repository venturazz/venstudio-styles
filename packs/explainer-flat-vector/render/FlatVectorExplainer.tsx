/**
 * flat-vector-explainer: the executable form of the `flat-vector-explainer-video` skill.
 *
 * Renders payload.scenePlan scene by scene. Each scene is a flat palette, its heading or callout on top, the shot
 * picture as a plate where the scene has one, and its data elements (counter, bars, gauge, tally, arrow, diagram)
 * drawn and animated in code. The scene's motion tokens decide what moves; its camera flag moves the whole frame.
 * Scenes overlap by transitionSec with the same transition per position as the stills engine's xfade.
 */
import React, { useEffect, useState } from "react";
import { AbsoluteFill, Audio, Sequence, continueRender, delayRender, interpolate, staticFile, useCurrentFrame, useVideoConfig } from "remotion";
import { DATA_KINDS, DataElement, Particles, Plate, TEXT_KINDS, TextElement, ramp } from "./elements.tsx";
import { captionAt, captionLayout, layerFrame, timelineFor, transitionFor, type Scene, type TemplateProps, type TransitionName } from "../../props.ts";
import { FONT_FAMILY, paletteFor, type Palette } from "./theme.ts";

const clamp = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;

type Box = { x: number; y: number; w: number; h: number };

/** Where the parts of a scene go. Portrait stacks them; landscape puts the plate beside the data. */
function layout(width: number, height: number, hasText: boolean, hasPlate: boolean, dataCount: number): { text: Box; plate: Box | null; data: Box[] } {
  const portrait = height >= width;
  const pad = Math.min(width, height) * 0.06;
  // Text alone (a hook or an outro line) sits in the middle of the frame, with room to be big.
  const alone = !hasPlate && dataCount === 0;
  const text: Box = alone
    ? { x: pad, y: height * 0.28, w: width - 2 * pad, h: height * 0.34 }
    : portrait
      ? { x: pad, y: height * 0.07, w: width - 2 * pad, h: height * 0.17 }
      : { x: pad, y: height * 0.06, w: width - 2 * pad, h: height * 0.2 };
  const top = hasText ? text.y + text.h + pad * 0.6 : height * 0.1;
  // Captions own the bottom of the frame.
  const bottom = portrait ? height * 0.77 : height * 0.79;
  const main: Box = { x: pad, y: top, w: width - 2 * pad, h: Math.max(height * 0.2, bottom - top) };
  let plate: Box | null = null;
  let area = main;
  if (hasPlate && dataCount > 0) {
    if (portrait) {
      plate = { ...main, h: main.h * 0.54 };
      area = { x: main.x, y: main.y + main.h * 0.58, w: main.w, h: main.h * 0.42 };
    } else {
      plate = { ...main, w: main.w * 0.5 };
      area = { x: main.x + main.w * 0.54, y: main.y, w: main.w * 0.46, h: main.h };
    }
  } else if (hasPlate) {
    plate = main;
  }
  const data: Box[] = [];
  for (let i = 0; i < dataCount; i++) {
    // Side by side when there is room across, stacked otherwise.
    const across = area.w >= area.h * 1.2 || (portrait && plate !== null);
    data.push(across ? { x: area.x + (area.w / dataCount) * i, y: area.y, w: area.w / dataCount, h: area.h } : { x: area.x, y: area.y + (area.h / dataCount) * i, w: area.w, h: area.h / dataCount });
  }
  return { text, plate, data };
}

/** Whole-frame camera for a scene, from its camera flag and its camera tokens. */
function cameraTransform(scene: Scene, frame: number, dur: number): string {
  const p = frame / Math.max(1, dur);
  const t = scene.tokens;
  let scale = 1;
  let x = 0;
  let y = 0;
  let rotate = 0;
  if (t.includes("pull")) scale = 1.08 - 0.08 * p;
  else if (t.includes("push") || (scene.camera && !t.includes("drift"))) scale = 1 + 0.05 * p;
  if (t.includes("drift")) x = -1.2 + 2.4 * p;
  if (t.includes("parallax")) y = -1.5 * p;
  if (t.includes("whip")) x += interpolate(frame, [0, 9], [38, 0], clamp);
  if (t.includes("shake") && frame < 14) {
    const k = (14 - frame) / 14;
    x += Math.sin(frame * 2.7) * 0.7 * k;
    y += Math.cos(frame * 3.1) * 0.5 * k;
    rotate = Math.sin(frame * 1.9) * 0.4 * k;
  }
  return `translate(${x}%, ${y}%) scale(${scale}) rotate(${rotate}deg)`;
}

/** How scene i enters over the scene before it during the overlap. */
function transitionStyle(name: TransitionName, t: number): React.CSSProperties {
  if (name === "none" || t >= 1) return {};
  switch (name) {
    case "slideup":
      return { transform: `translateY(${(1 - t) * 100}%)` };
    case "wipeleft":
      return { clipPath: `inset(0 0 0 ${(1 - t) * 100}%)` };
    case "circleopen":
      return { clipPath: `circle(${t * 72}% at 50% 50%)` };
    default:
      return { opacity: t };
  }
}

function Backdrop({ pal, frame, index, parallax, width, height }: { pal: Palette; frame: number; index: number; parallax: boolean; width: number; height: number }) {
  const shift = parallax ? -frame * 0.08 : 0;
  const big = Math.max(width, height);
  return (
    <AbsoluteFill style={{ background: pal.bg }}>
      <svg width={width} height={height} style={{ position: "absolute", inset: 0 }}>
        <defs>
          <pattern id={`dots-${index}`} width={big / 28} height={big / 28} patternUnits="userSpaceOnUse" patternTransform={`translate(0 ${shift})`}>
            <circle cx={2} cy={2} r={Math.max(1.5, big / 900)} fill={pal.ink} opacity={0.08} />
          </pattern>
        </defs>
        <rect width={width} height={height} fill={`url(#dots-${index})`} />
        {/* Breathes slowly, so a scene with nothing else moving still changes from frame to frame. */}
        <circle cx={index % 2 === 0 ? width * 0.92 : width * 0.08} cy={height * (0.15 + 0.1 * (index % 3)) + shift * 2} r={big * (0.22 + 0.02 * Math.sin(frame / 20))} fill={pal.accent2} opacity={0.1} />
      </svg>
    </AbsoluteFill>
  );
}

function SceneView({ scene, index, image, dur, fadeFrames }: { scene: Scene; index: number; image: string | null; dur: number; fadeFrames: number }) {
  const raw = useCurrentFrame();
  const { width, height, fps } = useVideoConfig();
  const u = Math.min(width, height) / 100;
  const pal = paletteFor(index);
  // Each layer runs on its own clock; this template draws everything on the "scene" layer and holds the plate.
  const frame = layerFrame(raw, fps, scene.layers.find((l) => l.id === "scene"));
  const texts = scene.elements.filter((e) => (TEXT_KINDS as readonly string[]).includes(e.kind)).slice(0, 2);
  const datas = scene.elements.filter((e) => (DATA_KINDS as readonly string[]).includes(e.kind)).slice(0, 3);
  const hasPlate = scene.elements.some((e) => e.kind === "plate");
  const particles = scene.elements.some((e) => e.kind === "particles") || scene.tokens.includes("particles");
  const box = layout(width, height, texts.length > 0, hasPlate, datas.length);
  // Elements wait for the fade into this scene to be half done, then enter one after another.
  const enter = index > 0 ? Math.round(fadeFrames / 2) : 0;
  const t = index > 0 && fadeFrames > 0 ? interpolate(raw, [0, fadeFrames], [0, 1], clamp) : 1;
  const dim = scene.tokens.includes("dim") ? interpolate(raw, [dur * 0.55, dur], [0, 0.38], clamp) : 0;
  const common = { frame, dur, fps, pal, tokens: scene.tokens, u };
  return (
    <AbsoluteFill style={transitionStyle(transitionFor(index), t)}>
      <Backdrop pal={pal} frame={raw} index={index} parallax={scene.tokens.includes("parallax")} width={width} height={height} />
      <AbsoluteFill style={{ transform: cameraTransform(scene, raw, dur), transformOrigin: "50% 45%" }}>
        {box.plate ? (
          <div style={{ position: "absolute", left: box.plate.x, top: box.plate.y, opacity: ramp(raw, enter, 10) }}>
            <Plate image={image} w={box.plate.w} h={box.plate.h} frame={raw} dur={dur} pal={pal} tokens={scene.tokens} camera={scene.camera} u={u} />
          </div>
        ) : null}
        {datas.map((el, i) => {
          const b = box.data[i];
          return (
            <div key={`d${i}`} style={{ position: "absolute", left: b.x, top: b.y }}>
              <DataElement el={el} w={b.w} h={b.h} delay={enter + 6 + i * 6} {...common} />
            </div>
          );
        })}
        {texts.length > 0 ? (
          <div style={{ position: "absolute", left: box.text.x, top: box.text.y, width: box.text.w, height: box.text.h, display: "flex", flexDirection: "column" }}>
            {texts.map((el, i) => (
              <TextElement key={`t${i}`} el={el} w={box.text.w} h={box.text.h / texts.length} delay={enter + i * 5} {...common} />
            ))}
          </div>
        ) : null}
        {particles ? <Particles width={width} height={height} frame={frame} seed={index + 1} pal={pal} /> : null}
      </AbsoluteFill>
      {dim > 0 ? <AbsoluteFill style={{ background: "#000", opacity: dim }} /> : null}
    </AbsoluteFill>
  );
}

function Captions({ captions, style }: { captions: TemplateProps["captions"]; style: TemplateProps["captionStyle"] }) {
  const frame = useCurrentFrame();
  const { width, height, fps } = useVideoConfig();
  const u = Math.min(width, height) / 100;
  const c = captionAt(captions, frame / fps);
  if (!c) return null;
  const fadeIn = interpolate(frame / fps, [c.start, c.start + 0.2], [0, 1], clamp);
  const fadeOut = interpolate(frame / fps, [c.end - 0.15, c.end], [1, 0], clamp);
  // With a captionStyle the numbers are the portal's (measured on the reference, scaled to this frame); without one,
  // the dark card this template always had.
  const box = captionLayout(style, width, height);
  return (
    <AbsoluteFill style={{ justifyContent: "flex-end", alignItems: "center", paddingBottom: box.paddingBottom }}>
      <div
        style={{
          maxWidth: box.maxWidth,
          color: "#FFFFFF",
          fontFamily: FONT_FAMILY,
          fontWeight: 700,
          fontSize: box.fontSize,
          lineHeight: box.lineHeight,
          textAlign: "center",
          opacity: Math.min(fadeIn, fadeOut),
          ...(box.boxed
            ? { background: "rgba(14, 17, 28, 0.8)", padding: `${u * 1.4}px ${u * 2.6}px`, borderRadius: u * 2 }
            : {
                WebkitTextStroke: `${box.strokeWidth}px #000000`,
                paintOrder: "stroke fill",
                ...(box.textShadow ? { textShadow: box.textShadow } : {}),
              }),
        }}
      >
        {c.text}
      </div>
    </AbsoluteFill>
  );
}

/** Loads the job's font asset before the first frame, so no frame renders in a fallback face. */
function useFont(font: string | null) {
  const [handle] = useState(() => (font ? delayRender(`font ${font}`) : null));
  useEffect(() => {
    if (!font || handle === null) return;
    const face = new FontFace("VenStudioFont", `url(${staticFile(font)})`);
    face
      .load()
      .then((loaded) => {
        document.fonts.add(loaded);
        continueRender(handle);
      })
      .catch(() => {
        // A broken font must not hang the render: fall back to the system face.
        continueRender(handle);
      });
  }, [font, handle]);
}

export const FlatVectorExplainer: React.FC<TemplateProps> = (props) => {
  const { fps } = useVideoConfig();
  useFont(props.font);
  const timeline = props.timeline ?? timelineFor(props.shots.map((s) => s.seconds), props.transitionSec, fps);
  return (
    <AbsoluteFill style={{ background: "#111" }}>
      {props.scenes.map((scene, i) => {
        const shot = props.shots.find((s) => s.shotRef === scene.shotRef) ?? props.shots[i];
        const from = timeline.startFrames[i] ?? 0;
        const dur = timeline.frames[i] ?? 1;
        return (
          <Sequence key={scene.shotRef + i} from={from} durationInFrames={dur} name={scene.shotRef}>
            <SceneView scene={scene} index={i} image={shot?.image ?? null} dur={dur} fadeFrames={timeline.fadeFrames} />
          </Sequence>
        );
      })}
      <Captions captions={props.captions} style={props.captionStyle} />
      {props.narration ? <Audio src={staticFile(props.narration)} /> : null}
    </AbsoluteFill>
  );
};
