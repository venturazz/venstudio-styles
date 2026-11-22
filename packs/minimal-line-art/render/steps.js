/*
 * minimal-line-art: VenStudio's html-capture adaptation of the `minimalistic-graphics` skill of
 * github.com/artemnovitckii/claude-animation-skills (commit 86f70106c9ae, MIT, Copyright (c) 2026 Artem Novitckii;
 * see LICENSE). The motif and its timing are the skill's: hairline outlined steps rise one by one, a solid dot
 * arrives, hops up them with squash and stretch, and at the top an orbit and a ring draw around it, sparks burst
 * and the steps dim. One quiet lowercase line of text sits above. What changed: one motif per scene from the render
 * payload, the narration's captions are that line of text (the page draws them, drawsCaptions true), and the paused
 * GSAP timeline is replaced by motion.js (no library); every value is a function of the frame number.
 *
 * Data, per scene, read and never invented:
 * - a `bar` or `counter` element with a `series` of 2 to 6 numbers, all 0 or above, one above 0: one step per
 *   value, each as tall as its value (the highest touches the top). No number is ever drawn.
 * - otherwise: the skill's neutral motif, 5 evenly rising steps.
 * Headings and other element text are not drawn: the style has one line of text, and it is the caption.
 */
(() => {
  const NS = "http://www.w3.org/2000/svg";
  const { track } = window.VSMotion;
  const W = 1080;
  const H = 1920;
  const LX = 137;
  const RX = 853;
  const R = 31;
  const SPARKS = 22;
  const NEUTRAL_STEPS = 5;
  const isNum = (v) => typeof v === "number" && Number.isFinite(v);

  /** Step heights (0..1, highest = 1) for a scene, from its data or the neutral motif. */
  function sceneSteps(scene) {
    const els = Array.isArray(scene && scene.elements) ? scene.elements : [];
    for (const e of els) {
      if ((e.kind === "bar" || e.kind === "counter") && Array.isArray(e.series)) {
        const v = e.series.filter(isNum);
        if (v.length >= 2 && v.length <= 6 && v.every((x) => x >= 0) && Math.max(...v) > 0) {
          const max = Math.max(...v);
          return { fromData: true, heights: v.map((x) => x / max) };
        }
      }
    }
    return { fromData: false, heights: Array.from({ length: NEUTRAL_STEPS }, (_, k) => k / (NEUTRAL_STEPS - 1)) };
  }

  /** When the dot reaches the top, and the natural length: the skill's formula (build.py payoff + 1.6 s). */
  function timing(n) {
    const step = Math.min(0.5, Math.max(0.3, 1.6 / (n - 1)));
    const payoff = 0.42 + step * (n - 2) + 0.58;
    return { step, payoff, natural: payoff + 1.6 };
  }

  function el(tag, attrs, parent) {
    const n = document.createElementNS(NS, tag);
    for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, String(v));
    parent.appendChild(n);
    return n;
  }

  function buildScene(root, scene, index) {
    const steps = sceneSteps(scene);
    const N = steps.heights.length;
    const { step: STEP, payoff: TP, natural } = timing(N);
    const section = document.createElement("section");
    section.className = "scene";
    root.appendChild(section);
    const svg = el("svg", { width: W, height: H, viewBox: `0 0 ${W} ${H}` }, section);

    const BW = Math.min(116, ((RX - LX) / N) * 0.77);
    const pitch = (RX - LX - BW) / (N - 1);
    const BX = steps.heights.map((_, k) => LX + BW / 2 + k * pitch);
    const TOP = steps.heights.map((h) => 1240 - h * 720);
    const OX = BX[N - 1];
    const OY = TOP[N - 1] - R;

    const defs = el("defs", {}, svg);
    const om = el("mask", { id: `om-${index}`, maskUnits: "userSpaceOnUse", x: 0, y: 0, width: W, height: H }, defs);
    const omc = el("circle", { cx: OX, cy: OY, r: 140, fill: "none", stroke: "#fff", "stroke-width": 14, "stroke-dasharray": 880, "stroke-dashoffset": 880, transform: `rotate(-90 ${OX} ${OY})` }, om);
    const em = el("mask", { id: `em-${index}`, maskUnits: "userSpaceOnUse", x: 0, y: 0, width: W, height: H }, defs);
    const emc = el("ellipse", { cx: OX, cy: OY, rx: 220, ry: 46, fill: "none", stroke: "#fff", "stroke-width": 14, "stroke-dasharray": 1000, "stroke-dashoffset": 1000 }, em);

    const bars = el("g", { class: "bars", fill: "none", "stroke-width": 2.6 }, svg);
    const rects = BX.map((x) => el("rect", { x: (x - BW / 2).toFixed(1), y: 1960, width: BW.toFixed(1), height: 1700 }, bars));
    const orbit = el("circle", { class: "orbit", cx: OX, cy: OY, r: 140, fill: "none", "stroke-width": 2, "stroke-dasharray": "5 9", mask: `url(#om-${index})` }, svg);
    el("ellipse", { class: "ring", cx: OX, cy: OY, rx: 220, ry: 46, fill: "none", "stroke-width": 2, mask: `url(#em-${index})` }, svg);
    const sparkG = el("g", { class: "sparks" }, svg);
    const sparks = Array.from({ length: SPARKS }, (_, i) => el("circle", { cx: OX, cy: OY, r: i % 3 ? 4 : 6, opacity: 0 }, sparkG));
    const pulse = el("circle", { class: "pulse", cx: 0, cy: 0, r: 34, fill: "none", "stroke-width": 3, opacity: 0 }, svg);
    const ball = el("circle", { class: "ball", cx: 0, cy: 0, r: R }, svg);

    // Tracks: the skill's timeline, tween for tween.
    const t = {
      ballX: track(BX[0]),
      ballY: track(TOP[0] - R),
      sx: track(0),
      sy: track(0),
      pulseX: track(BX[0]).set(TP, OX),
      pulseY: track(TOP[0] - R).set(TP, OY),
      pulseO: track(0).add(0.2, 0.5, 0, "power2.out", 0.9).add(TP, 0.6, 0, "power2.out", 0.9),
      pulseS: track(1).add(0.2, 0.5, 3.2, "power2.out", 1).add(TP, 0.6, 4.2, "power2.out", 1),
      bars: rects.map(() => track(1960)),
      omc: track(880).add(TP + 0.05, 0.55, 0, "power2.inOut"),
      emc: track(1000).add(TP + 0.18, 0.6, 0, "power2.inOut"),
      orbit: track(0).add(TP, 1.6, 40, "none", 0),
      barsO: track(1).add(TP + 0.1, 0.5, 0.32, "power2.out"),
      sparks: sparks.map((_, i) => {
        const a = (i / SPARKS) * Math.PI * 2 + (i % 2) * 0.12;
        const d = 190 + (i % 4) * 34;
        return {
          p: track(0).add(TP + 0.05, 0.5, 1, "power3.out", 0),
          dx: Math.cos(a) * d,
          dy: Math.sin(a) * d,
          o: track(0).add(TP + 0.05, 0.5, 1, "power3.out", 0).add(TP + 0.55, 0.5, i % 3 ? 0.35 : 0.8, "power1.out"),
        };
      }),
    };
    const scale = (at, dur, to, e) => {
      t.sx.add(at, dur, to, e);
      t.sy.add(at, dur, to, e);
    };
    const squash = (at, dur, x, y, e) => {
      t.sx.add(at, dur, x, e);
      t.sy.add(at, dur, y, e);
    };
    // The dot arrives big and settles; the first step rises.
    scale(0, 0.16, 2.1, "power2.out");
    scale(0.16, 0.26, 1, "power3.inOut");
    t.bars[0].add(0.18, 0.34, TOP[0], "power3.out");
    // Each next step rises, then the dot hops onto it.
    for (let k = 1; k < N; k++) {
      const tb = 0.42 + STEP * (k - 1);
      const th = tb + 0.2;
      const y0 = TOP[k - 1] - R;
      const y1 = TOP[k] - R;
      const peak = Math.min(y0, y1) - 120;
      t.bars[k].add(tb, 0.3, TOP[k], "power3.out");
      squash(th - 0.05, 0.05, 1.18, 0.78, "power1.out");
      t.ballX.add(th, 0.3, BX[k], "none");
      squash(th, 0.1, 0.9, 1.12, "power1.out");
      squash(th + 0.1, 0.1, 1, 1, "power1.in");
      t.ballY.add(th, 0.15, peak, "power2.out");
      t.ballY.add(th + 0.15, 0.15, y1, "power2.in");
      squash(th + 0.3, 0.05, 1.22, 0.74, "power1.out");
      squash(th + 0.35, 0.18, 1, 1, "back.out(3)");
    }
    return { section, natural, steps, rects, bars, orbit, omc, emc, pulse, ball, sparks, t, OX, OY };
  }

  function drawScene(s, time) {
    const t = s.t;
    s.rects.forEach((r, k) => r.setAttribute("y", t.bars[k].valueAt(time).toFixed(1)));
    s.bars.setAttribute("opacity", t.barsO.valueAt(time).toFixed(3));
    const sx = t.sx.valueAt(time);
    const sy = t.sy.valueAt(time);
    // Scaled about the bottom of the dot (the skill's transformOrigin 50% 100%), so it squashes onto the step.
    s.ball.setAttribute("transform", `translate(${t.ballX.valueAt(time).toFixed(2)} ${(t.ballY.valueAt(time) + R).toFixed(2)}) scale(${sx.toFixed(4)} ${sy.toFixed(4)}) translate(0 ${-R})`);
    s.pulse.setAttribute("transform", `translate(${t.pulseX.valueAt(time).toFixed(2)} ${t.pulseY.valueAt(time).toFixed(2)}) scale(${t.pulseS.valueAt(time).toFixed(4)})`);
    s.pulse.setAttribute("opacity", t.pulseO.valueAt(time).toFixed(3));
    s.omc.setAttribute("stroke-dashoffset", t.omc.valueAt(time).toFixed(2));
    s.emc.setAttribute("stroke-dashoffset", t.emc.valueAt(time).toFixed(2));
    s.orbit.setAttribute("transform", `rotate(${t.orbit.valueAt(time).toFixed(3)} ${s.OX} ${s.OY})`);
    s.sparks.forEach((c, i) => {
      const sp = t.sparks[i];
      const p = sp.p.valueAt(time);
      c.setAttribute("transform", `translate(${(sp.dx * p).toFixed(2)} ${(sp.dy * p).toFixed(2)})`);
      c.setAttribute("opacity", sp.o.valueAt(time).toFixed(3));
    });
  }

  window.VSSteps = { sceneSteps, timing };

  window.VENSTUDIO = {
    async init(props) {
      this.props = props;
      const { width, height } = props;
      const stage = document.getElementById("stage");
      stage.style.width = `${width}px`;
      stage.style.height = `${height}px`;
      const root = document.getElementById("root");
      const k = Math.min(width / W, height / H);
      root.style.transform = `translate(${((width - W * k) / 2).toFixed(2)}px, ${((height - H * k) / 2).toFixed(2)}px) scale(${k.toFixed(5)})`;
      if (document.fonts && document.fonts.load) await document.fonts.load("400 44px 'Poppins'").catch(() => undefined);
      this.scenes = (props.scenes || []).map((scene, i) => buildScene(root, scene, i));
      this.cap = document.createElement("div");
      this.cap.className = "cap";
      root.appendChild(this.cap);
      this.captions = props.drawsCaptions && Array.isArray(props.captions) ? props.captions.filter((c) => c && typeof c.text === "string") : [];
      this.shownCaption = null;
      return { totalFrames: props.totalFrames, fps: props.fps, width, height };
    },

    renderFrame(frame) {
      const { timeline, fps } = this.props;
      const fade = timeline.fadeFrames || 0;
      this.scenes.forEach((s, i) => {
        const start = timeline.startFrames[i];
        const len = timeline.frames[i];
        const local = frame - start;
        const visible = local >= 0 && local < len;
        const opacity = !visible ? 0 : fade > 0 && i > 0 && local < fade ? local / fade : 1;
        s.section.style.opacity = String(opacity);
        if (!visible) return;
        const sceneSec = len / fps;
        const speed = sceneSec < s.natural ? s.natural / sceneSec : 1;
        drawScene(s, (local / fps) * speed);
      });
      // The one line of text: the caption on screen now, swapped in like the skill's second line.
      const now = frame / fps;
      const c = this.captions.find((x) => now >= x.start && now < x.end) || null;
      const text = c ? c.text : "";
      if (text !== this.shownCaption) {
        this.cap.textContent = text;
        this.shownCaption = text;
      }
    },
  };
})();
