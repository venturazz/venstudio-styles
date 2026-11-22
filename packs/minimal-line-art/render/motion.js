/*
 * A tiny, deterministic tween timeline for html-capture pages. Written for VenStudio; it replaces the paused GSAP
 * timeline the source templates use (github.com/artemnovitckii/claude-animation-skills, MIT) with the same idea:
 * tweens placed at fixed times, evaluated at one point in time, so a frame is a pure function of the frame number.
 *
 * Eases use GSAP's names and curves (power1 = quad, power2 = cubic, power3 = quart, back.out(s)), so timings read
 * the same as in the source. No library, no network, no clock.
 */
(() => {
  const clamp01 = (t) => (t < 0 ? 0 : t > 1 ? 1 : t);
  const powIn = (p) => (t) => Math.pow(t, p);
  const powOut = (p) => (t) => 1 - Math.pow(1 - t, p);
  const powInOut = (p) => (t) => (t < 0.5 ? Math.pow(2 * t, p) / 2 : 1 - Math.pow(2 * (1 - t), p) / 2);
  const backOut = (s) => (t) => {
    const x = t - 1;
    return 1 + (s + 1) * x * x * x + s * x * x;
  };
  const EASES = {
    none: (t) => t,
    "power1.in": powIn(2),
    "power1.out": powOut(2),
    "power1.inOut": powInOut(2),
    "power2.in": powIn(3),
    "power2.out": powOut(3),
    "power2.inOut": powInOut(3),
    "power3.in": powIn(4),
    "power3.out": powOut(4),
    "power3.inOut": powInOut(4),
    "back.out": backOut(1.70158),
    "back.out(3)": backOut(3),
  };
  const ease = (name) => EASES[name] || EASES.none;

  /**
   * A property track: tweens on one value, each starting where the value stood when it begins (like GSAP's `to`).
   * add(at, duration, to, easeName, from?) with `from` for a fromTo. valueAt(t) walks the tweens in start order.
   */
  function track(initial) {
    const tweens = [];
    return {
      add(at, duration, to, easeName = "none", from) {
        tweens.push({ at, duration: Math.max(0, duration), to, from, ease: ease(easeName) });
        tweens.sort((a, b) => a.at - b.at);
        return this;
      },
      /** A jump at `at` (GSAP's set). */
      set(at, to) {
        return this.add(at, 0, to);
      },
      valueAt(t) {
        let v = initial;
        for (const tw of tweens) {
          if (t < tw.at) break;
          const start = tw.from !== undefined ? tw.from : v;
          const p = tw.duration === 0 ? 1 : clamp01((t - tw.at) / tw.duration);
          v = start + (tw.to - start) * tw.ease(p);
        }
        return v;
      },
    };
  }

  window.VSMotion = { clamp01, ease, track };
})();
