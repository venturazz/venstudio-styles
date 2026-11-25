/*
 * line-graph: VenStudio's html-capture adaptation of the `graph` skill of
 * github.com/artemnovitckii/claude-animation-skills (commit 86f70106c9ae, MIT, Copyright (c) 2026 Artem Novitckii;
 * see LICENSE). The layout, the Catmull-Rom line, the count that follows the tip and the landing (soft ring, dotted
 * drop) are the skill's. What changed: the data comes from the render payload instead of a JSON spec, one scene per
 * shot, the paused GSAP timeline is replaced by motion.js (no library), and every value is a function of the frame.
 *
 * Data, per scene (props.scenes[i].elements), read and never invented:
 * - a `bar` or `counter` element with a `series` of 2 or more numbers, all 0 or above, one above 0: the line graph.
 *   The count lands on the element's `value` when it has one (the skill's `final`), else on the last point.
 * - otherwise a `counter`, `gauge`, `tally` or `bar` element with a `value`: the axes draw in and the number counts
 *   up to it. No line is drawn, because there are no points to draw it through.
 * - otherwise: neutral and number-free. The axes draw in under the scene's heading (or any element text). No number.
 * A `dim` token gives the dark variant (white line on black). Captions are burned by the worker (drawsCaptions false).
 */
(() => {
  const SVG = "http://www.w3.org/2000/svg";
  const { track } = window.VSMotion;
  // The skill's frame: 1080x1920. Other sizes scale it uniformly and centre it.
  const W = 1080;
  const H = 1920;
  const X0 = 120;
  const X1 = 940;
  const Y0 = 1330;
  const Y1 = 770;
  // Natural length of the skill's animation (4 s). A shorter scene plays it faster; a longer one holds the end.
  const NATURAL = 4.0;
  const T0 = 0.3;
  const TD = 2.7;
  const TE = T0 + TD;

  const isNum = (v) => typeof v === "number" && Number.isFinite(v);

  /** What a scene shows, from its elements only. Exported for tests through window.VSGraph. */
  function sceneData(scene) {
    const els = Array.isArray(scene && scene.elements) ? scene.elements : [];
    const text = (e) => (e && typeof e.text === "string" ? e.text.trim() : "");
    for (const e of els) {
      if ((e.kind === "bar" || e.kind === "counter") && Array.isArray(e.series)) {
        const v = e.series.filter(isNum);
        if (v.length >= 2 && v.every((x) => x >= 0) && Math.max(...v) > 0) {
          return { kind: "graph", values: v, final: isNum(e.value) ? e.value : v[v.length - 1], label: text(e) };
        }
      }
    }
    for (const e of els) {
      if (["counter", "gauge", "tally", "bar"].includes(e.kind) && isNum(e.value)) return { kind: "count", final: e.value, label: text(e) };
    }
    const titled = els.find((e) => (e.kind === "heading" || e.kind === "callout") && text(e)) || els.find((e) => text(e));
    return { kind: "neutral", title: titled ? text(titled) : "" };
  }

  function decimalsOf(n) {
    if (Number.isInteger(n)) return 0;
    const s = String(n);
    const i = s.indexOf(".");
    return i < 0 ? 0 : Math.min(2, s.length - i - 1);
  }

  /** 1234567.5 -> "1,234,567.5" with fixed decimals. No Intl, so the text is the same on every machine. */
  function fmt(x, dec) {
    const neg = x < 0;
    const [int, frac] = Math.abs(x).toFixed(dec).split(".");
    const grouped = int.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
    return `${neg ? "-" : ""}${grouped}${frac ? `.${frac}` : ""}`;
  }

  /** The skill's width estimate: shrink the big number so its widest state stays inside the right margin. */
  function numberSize(s) {
    let em = 0;
    for (const ch of s) em += /[0-9]/.test(ch) ? 0.56 : /[,.]/.test(ch) ? 0.24 : ch === " " ? 0.25 : /[A-Z$%+-]/.test(ch) ? 0.62 : 0.54;
    return Math.min(180, 850 / Math.max(1, em));
  }

  function node(tag, attrs, parent, ns) {
    const n = ns ? document.createElementNS(SVG, tag) : document.createElement(tag);
    for (const [k, v] of Object.entries(attrs || {})) {
      if (k === "text") n.textContent = v;
      else if (k === "class") n.setAttribute("class", v);
      else n.setAttribute(k, String(v));
    }
    parent.appendChild(n);
    return n;
  }

  /** Catmull-Rom through every point as cubic beziers: the skill's smooth line. */
  function smoothPath(P) {
    let d = `M${P[0][0]},${P[0][1]}`;
    for (let i = 0; i < P.length - 1; i++) {
      const p0 = P[Math.max(0, i - 1)];
      const p1 = P[i];
      const p2 = P[i + 1];
      const p3 = P[Math.min(P.length - 1, i + 2)];
      const t = 0.5 / 3;
      const c1 = [p1[0] + (p2[0] - p0[0]) * t, p1[1] + (p2[1] - p0[1]) * t];
      const c2 = [p2[0] - (p3[0] - p1[0]) * t, p2[1] - (p3[1] - p1[1]) * t];
      d += ` C${c1[0].toFixed(1)},${c1[1].toFixed(1)} ${c2[0].toFixed(1)},${c2[1].toFixed(1)} ${p2[0].toFixed(1)},${p2[1].toFixed(1)}`;
    }
    return d;
  }

  function buildScene(root, scene) {
    const data = sceneData(scene);
    const dark = Array.isArray(scene.tokens) && scene.tokens.includes("dim");
    const section = node("section", { class: `scene${dark ? " dark" : ""}` }, root);
    const out = { section, data, tracks: {} };
    const tr = out.tracks;

    const lab = node("div", { class: "lab" }, section);
    const num = node("div", { class: "num" }, section);
    const svg = node("svg", { width: W, height: H, viewBox: `0 0 ${W} ${H}` }, section, true);
    const grid = [
      node("line", { class: "base", x1: X0, y1: Y0, x2: X0, y2: Y0, "stroke-width": 2 }, svg, true),
      node("line", { class: "grid", x1: X0, y1: 1050, x2: X0, y2: 1050, "stroke-width": 2 }, svg, true),
      node("line", { class: "grid", x1: X0, y1: Y1, x2: X0, y2: Y1, "stroke-width": 2 }, svg, true),
    ];
    out.grid = grid;
    // Axes draw in, one after another (the skill's 0, .06, .12 s).
    tr.grid = grid.map((_, i) => track(X0).add(0.06 * i, 0.45, X1, "power3.out"));

    if (data.kind === "neutral") {
      // Number-free: the title takes the number's place, in the same face, and rises in.
      lab.textContent = "";
      num.textContent = data.title;
      num.classList.add("title");
      tr.title = track(0).add(0.1, 0.5, 1, "power2.out");
      return out;
    }

    lab.textContent = data.label;
    tr.label = track(0).add(0, 0.3, 1, "power1.out");
    const dec = decimalsOf(data.final);
    out.dec = dec;
    num.style.fontSize = `${numberSize(fmt(data.final, dec)).toFixed(0)}px`;
    num.textContent = fmt(0, dec);
    out.num = num;

    if (data.kind === "count") {
      tr.count = track(0).add(T0, TD, 1, "power1.inOut");
      return out;
    }

    const V = data.values;
    const vmax = Math.max(...V) || 1;
    const last = V[V.length - 1] || 1;
    const scale = data.final / last;
    const px = (i) => X0 + (i * (X1 - X0)) / (V.length - 1);
    const py = (v) => Y0 - (v / vmax) * (Y0 - Y1);
    const P = V.map((v, i) => [px(i), py(v)]);
    const drop = node("line", { class: "drop", x1: 0, y1: 0, x2: 0, y2: 0, "stroke-width": 2, "stroke-dasharray": "3 9", opacity: 0 }, svg, true);
    const line = node("path", { class: "line", d: smoothPath(P), fill: "none", "stroke-width": 6, "stroke-linecap": "round", "stroke-linejoin": "round" }, svg, true);
    const halo = node("circle", { class: "halo", r: 12, opacity: 0 }, svg, true);
    const tip = node("circle", { class: "tip", r: 13, "stroke-width": 5, opacity: 0 }, svg, true);
    const L = line.getTotalLength();
    line.setAttribute("stroke-dasharray", String(L));
    line.setAttribute("stroke-dashoffset", String(L));
    Object.assign(out, { line, L, tip, halo, drop, vmax, scale, end: P[P.length - 1] });
    tr.p = track(0).add(T0, TD, 1, "power1.inOut");
    tr.tip = track(0).add(T0, 0.15, 1);
    tr.haloOpacity = track(0).add(TE, 0.7, 0, "power2.out", 0.18);
    tr.haloR = track(13).add(TE, 0.7, 60, "power2.out", 13);
    tr.dropY = track(0).add(TE + 0.05, 0.45, 1, "power2.inOut");
    return out;
  }

  function drawScene(s, t) {
    const tr = s.tracks;
    s.grid.forEach((g, i) => g.setAttribute("x2", tr.grid[i].valueAt(t).toFixed(1)));
    if (s.data.kind === "neutral") {
      const k = tr.title.valueAt(t);
      s.section.querySelector(".num").style.opacity = String(k);
      s.section.querySelector(".num").style.transform = `translateY(${((1 - k) * 40).toFixed(1)}px)`;
      return;
    }
    s.section.querySelector(".lab").style.opacity = String(tr.label.valueAt(t));
    if (s.data.kind === "count") {
      const p = tr.count.valueAt(t);
      const shown = p >= 1 ? s.data.final : Math.round(s.data.final * p * 10 ** s.dec) / 10 ** s.dec;
      s.num.textContent = fmt(p <= 0 ? 0 : shown, s.dec);
      return;
    }
    const p = tr.p.valueAt(t);
    const q = p * s.L;
    s.line.setAttribute("stroke-dashoffset", (s.L - q).toFixed(2));
    const pt = s.line.getPointAtLength(Math.max(0.01, q));
    for (const c of [s.tip, s.halo]) {
      c.setAttribute("cx", pt.x.toFixed(1));
      c.setAttribute("cy", pt.y.toFixed(1));
    }
    s.tip.setAttribute("opacity", tr.tip.valueAt(t).toFixed(3));
    // The count is the value under the tip, times final / last value (the skill's rule); it lands exactly on final.
    const v = p <= 0 ? 0 : Math.max(0, ((Y0 - pt.y) / (Y0 - Y1)) * s.vmax);
    const shown = p >= 1 ? s.data.final : Math.round(v * s.scale * 10 ** s.dec) / 10 ** s.dec;
    s.num.textContent = fmt(p <= 0 ? 0 : shown, s.dec);
    if (t >= TE) {
      s.halo.setAttribute("opacity", tr.haloOpacity.valueAt(t).toFixed(3));
      s.halo.setAttribute("r", tr.haloR.valueAt(t).toFixed(1));
      const [ex, ey] = s.end;
      const top = ey + 22;
      s.drop.setAttribute("x1", ex.toFixed(1));
      s.drop.setAttribute("x2", ex.toFixed(1));
      s.drop.setAttribute("y1", top.toFixed(1));
      s.drop.setAttribute("y2", (top + (Y0 - top) * tr.dropY.valueAt(t)).toFixed(1));
      s.drop.setAttribute("opacity", "1");
    } else {
      s.halo.setAttribute("opacity", "0");
      s.drop.setAttribute("opacity", "0");
    }
  }

  window.VSGraph = { sceneData, fmt, decimalsOf };

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
      if (document.fonts && document.fonts.load) {
        await Promise.all([document.fonts.load("500 34px 'Inter'"), document.fonts.load("700 180px 'Inter Tight'")]).catch(() => undefined);
      }
      this.scenes = (props.scenes || []).map((scene) => buildScene(root, scene));
      // The stage's background follows the first scene, so letterbox bars match it.
      stage.classList.toggle("dark", Boolean(this.scenes[0] && this.scenes[0].section.classList.contains("dark")));
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
        const speed = sceneSec < NATURAL ? NATURAL / sceneSec : 1;
        drawScene(s, (local / fps) * speed);
      });
    },
  };
})();
