/*
 * probe-line-graph: an original line-graph template for VenStudio's html-capture renderer.
 *
 * Contract (venstudio docs/html-capture.md): window.VENSTUDIO = { init(props), renderFrame(frame) }. Everything on
 * screen is a pure function of the frame number, so the same props always give the same frames. No library, no
 * network: the pictures come from props (../in/<file>), the font too when the job has one.
 */
(() => {
  const SVG = "http://www.w3.org/2000/svg";
  const clamp01 = (t) => (t < 0 ? 0 : t > 1 ? 1 : t);
  const easeOut = (t) => 1 - Math.pow(1 - clamp01(t), 3);
  const easeBack = (t) => {
    const x = clamp01(t);
    const c = 1.70158;
    return 1 + (c + 1) * Math.pow(x - 1, 3) + c * Math.pow(x - 1, 2);
  };

  function el(tag, cls, parent) {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    parent.appendChild(n);
    return n;
  }

  function svgEl(tag, attrs, parent) {
    const n = document.createElementNS(SVG, tag);
    for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, String(v));
    parent.appendChild(n);
    return n;
  }

  function buildGraph(section, series, w, h) {
    const gw = Math.round(w * 0.8);
    const gh = Math.round(h * 0.3);
    const svg = svgEl("svg", { class: "graph", width: gw, height: gh, viewBox: `0 0 ${gw} ${gh}` }, section);
    svg.style.left = `${Math.round(w * 0.1)}px`;
    svg.style.top = `${Math.round(h * 0.36)}px`;
    const stroke = Math.max(4, Math.round(w / 120));
    svgEl("path", { class: "axis", d: `M0 0 V${gh} H${gw}`, "stroke-width": Math.max(2, Math.round(stroke / 3)) }, svg);
    const max = Math.max(...series, 1e-9);
    const pts = series.map((v, i) => [series.length === 1 ? gw / 2 : (i / (series.length - 1)) * gw, gh - (v / max) * gh * 0.9]);
    const line = svgEl("path", { class: "line", d: pts.map((p, i) => `${i === 0 ? "M" : "L"}${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join(" "), "stroke-width": stroke }, svg);
    const length = line.getTotalLength();
    line.style.strokeDasharray = `${length}`;
    const dots = pts.map((p) => svgEl("circle", { class: "dot", cx: p[0].toFixed(1), cy: p[1].toFixed(1), r: stroke * 1.6 }, svg));
    return { line, length, dots, xs: pts.map((p) => p[0] / gw) };
  }

  window.VENSTUDIO = {
    async init(props) {
      this.props = props;
      const { width: w, height: h } = props;
      const stage = document.getElementById("stage");
      stage.style.width = `${w}px`;
      stage.style.height = `${h}px`;
      if (props.font) {
        const face = new FontFace("Pack Caption", `url(${props.font})`);
        document.fonts.add(await face.load());
      }
      const loads = [];
      this.scenes = props.scenes.map((scene, i) => {
        const section = el("section", "scene", stage);
        const shot = props.shots[i];
        const out = { section, plate: null, heading: null, label: null, graph: null, counter: null, value: 0 };
        if (shot && shot.image) {
          const img = el("img", "plate", section);
          img.src = shot.image;
          loads.push(img.decode().catch(() => undefined));
          out.plate = img;
        }
        for (const e of scene.elements) {
          if (e.kind === "heading" || e.kind === "callout") {
            out.heading = el("div", "heading", section);
            out.heading.textContent = e.text || "";
            out.heading.style.top = `${Math.round(h * 0.3)}px`;
            out.heading.style.fontSize = `${Math.round(w / 11)}px`;
          } else if (e.kind === "bar" && Array.isArray(e.series) && e.series.length > 0) {
            out.graph = buildGraph(section, e.series, w, h);
            if (e.text) {
              out.label = el("div", "label", section);
              out.label.textContent = e.text;
              out.label.style.top = `${Math.round(h * 0.26)}px`;
              out.label.style.fontSize = `${Math.round(w / 20)}px`;
            }
          } else if (e.kind === "counter" && typeof e.value === "number") {
            out.counter = el("div", "counter", section);
            out.counter.style.top = `${Math.round(h * 0.34)}px`;
            out.counter.style.fontSize = `${Math.round(w / 4)}px`;
            out.value = e.value;
            if (e.text) {
              out.label = el("div", "label", section);
              out.label.textContent = e.text;
              out.label.style.top = `${Math.round(h * 0.34 + w / 3.2)}px`;
              out.label.style.fontSize = `${Math.round(w / 16)}px`;
              out.label.style.textAlign = "center";
            }
          }
        }
        return out;
      });
      await Promise.all(loads);
      return { totalFrames: props.totalFrames, fps: props.fps, width: w, height: h };
    },

    renderFrame(frame) {
      const { timeline, scenes } = this.props;
      const fade = timeline.fadeFrames || 0;
      this.scenes.forEach((s, i) => {
        const start = timeline.startFrames[i];
        const len = timeline.frames[i];
        const local = frame - start;
        const visible = local >= 0 && local < len;
        // With a cross-fade the next scene fades in over the end of this one.
        const opacity = !visible ? 0 : fade > 0 && i > 0 && local < fade ? local / fade : 1;
        s.section.style.opacity = String(opacity);
        if (!visible) return;
        const t = local / Math.max(1, len - 1);
        const camera = scenes[i].camera === true;
        if (s.plate) s.plate.style.transform = `scale(${(camera ? 1.04 + 0.08 * t : 1.04).toFixed(4)})`;
        if (s.heading) {
          const k = easeBack(t * 3);
          s.heading.style.opacity = String(clamp01(t * 4));
          s.heading.style.transform = `translateY(${((1 - k) * 60).toFixed(1)}px) scale(${(0.85 + 0.15 * k).toFixed(4)})`;
        }
        if (s.label) s.label.style.opacity = String(clamp01(t * 3));
        if (s.graph) {
          const drawn = easeOut(t * 1.4);
          s.graph.line.style.strokeDashoffset = `${(s.graph.length * (1 - drawn)).toFixed(2)}`;
          s.graph.dots.forEach((d, k) => {
            const at = s.graph.xs[k];
            const p = clamp01((drawn - at) * 6 + (at === 0 ? 1 : 0));
            d.setAttribute("transform-origin", `${d.getAttribute("cx")} ${d.getAttribute("cy")}`);
            d.setAttribute("transform", `scale(${easeBack(p).toFixed(4)})`);
          });
        }
        if (s.counter) s.counter.textContent = `${Math.round(s.value * easeOut(t * 1.3))}%`;
      });
    },
  };
})();
