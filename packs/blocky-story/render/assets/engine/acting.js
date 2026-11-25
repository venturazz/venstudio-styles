// Poses, locomotion cycles and gestures. A pose sets joint rotations (radians, Euler XYZ):
//   armL/armR/legL/legR/head/torso: [x, y, z]; bodyY: vertical body offset; lean: [x, z] body tilt.
// Arm conventions (character faces +Z): x = -PI/2 points the arm forward, x = -PI straight up;
// z swings sideways (for armL +z = outward, for armR -z = outward).
import { clamp, lerp, smooth, easeOut, easeInOut } from './core.js';

const P = Math.PI;
export function basePose() {
  return { armL: [0, 0, 0.06], armR: [0, 0, -0.06], legL: [0, 0, 0], legR: [0, 0, 0], head: [0, 0, 0], torso: [0, 0, 0], bodyY: 0, lean: [0, 0] };
}

export function idle(p, t, seed = 0) {
  const b = Math.sin(t * 2.1 + seed) * 0.5 + 0.5;
  p.armL[2] = 0.06 + b * 0.03; p.armR[2] = -0.06 - b * 0.03;
  p.head[0] = Math.sin(t * 0.9 + seed * 2) * 0.03; p.head[1] = Math.sin(t * 0.55 + seed) * 0.05;
  p.bodyY = b * 0.03;
  return p;
}

// phase in radians (from distance), amp 1 = walk, run uses ~1.6
export function locomotion(p, phase, run = false) {
  const a = run ? 1.0 : 0.62, s = Math.sin(phase);
  p.legL[0] = s * a; p.legR[0] = -s * a;
  p.armL[0] = -s * a * 0.85; p.armR[0] = s * a * 0.85;
  p.bodyY = Math.abs(Math.cos(phase)) * (run ? 0.22 : 0.1);
  if (run) { p.lean[0] = 0.18; p.armL[0] -= 0.3; p.armR[0] -= 0.3; }
  return p;
}

export function sit(p) {
  p.legL[0] = -P / 2; p.legR[0] = -P / 2; p.bodyY = -0.1;
  p.armL[0] = -0.5; p.armR[0] = -0.5;
  return p;
}

// gesture(name)(lt, dur) -> partial pose overrides
const G = {
  wave: (t) => ({ armR: [-P * 0.88, 0, -0.35 + Math.sin(t * 12) * 0.35] }),
  wave_l: (t) => ({ armL: [-P * 0.88, 0, 0.35 + Math.sin(t * 12) * 0.35] }),
  point: () => ({ armR: [-P / 2, 0.15, 0], head: [0, -0.05, 0] }),
  point_l: () => ({ armL: [-P / 2, -0.15, 0] }),
  point_up: () => ({ armR: [-P * 0.95, 0, -0.15] }),
  cheer: (t) => ({ armL: [-P * 0.9, 0, 0.45 + Math.sin(t * 10) * 0.12], armR: [-P * 0.9, 0, -0.45 - Math.sin(t * 10) * 0.12], head: [-0.15, 0, 0] }),
  shock: () => ({ armL: [-P * 0.55, 0, 0.75], armR: [-P * 0.55, 0, -0.75], head: [-0.12, 0, 0], lean: [-0.08, 0] }),
  hands_head: () => ({ armL: [-P * 0.8, 0, -0.55], armR: [-P * 0.8, 0, 0.55], head: [-0.05, 0, 0] }),
  facepalm: () => ({ armR: [-P * 0.72, 0, 0.42], head: [0.25, 0, 0] }),
  shrug: () => ({ armL: [-0.45, 0, 0.75], armR: [-0.45, 0, -0.75], head: [0, 0, 0.15] }),
  think: () => ({ armR: [-P * 0.7, 0, 0.5], head: [0.05, 0, 0.12] }),
  hips: () => ({ armL: [0.15, 0, 0.55], armR: [0.15, 0, -0.55] }),
  cross: () => ({ armL: [-P * 0.45, 0, -0.55], armR: [-P * 0.42, 0, 0.55] }),
  raise_hand: (t) => ({ armR: [-P * 0.97 + Math.sin(t * 9) * 0.06, 0, -0.1], head: [-0.05, 0, 0] }),
  present: () => ({ armR: [-P * 0.4, 0, -0.9] }),
  hold: () => ({ armL: [-P * 0.45, 0, -0.2], armR: [-P * 0.45, 0, 0.2] }),
  write: (t) => ({ armR: [-P * 0.47 + Math.sin(t * 14) * 0.03, Math.sin(t * 7) * 0.1, 0.12], head: [0.38, 0, 0] }),   // hand stays above a desk top
  draw_up: (t) => ({ armR: [-P * 0.66 + Math.sin(t * 16) * 0.06, Math.sin(t * 9) * 0.18, 0.12], head: [-0.15, 0, 0] }),
  rub_hands: (t) => ({ armL: [-P * 0.42, 0, -0.5 + Math.sin(t * 14) * 0.08], armR: [-P * 0.42, 0, 0.5 - Math.sin(t * 14) * 0.08] }),
  ready_clap: () => ({ armL: [-P * 0.46, 0, -0.2], armR: [-P * 0.46, 0, 0.2] }),
  peek: (t) => ({ head: [0.3, 0.45, 0], armR: [-P * 0.2, 0, 0.1], armL: [0.1, 0, 0.3], lean: [0.08, 0.1] }),
  panic: (t) => ({ armL: [-P * 0.85 + Math.sin(t * 17) * 0.5, 0, 0.6], armR: [-P * 0.85 + Math.sin(t * 17 + 2) * 0.5, 0, -0.6], head: [0, Math.sin(t * 9) * 0.25, 0] }),
  nod: (t) => ({ head: [Math.max(0, Math.sin(t * 11)) * 0.25, 0, 0] }),
  headshake: (t) => ({ head: [0, Math.sin(t * 13) * 0.35, 0] }),
  look_around: (t) => ({ head: [0, Math.sin(t * 3.2) * 0.6, 0] }),
  bow: () => ({ lean: [0.5, 0], head: [0.2, 0, 0], armL: [0.1, 0, 0.1], armR: [0.1, 0, -0.1] }),
  duck: () => ({ bodyY: -0.8, lean: [0.35, 0], armL: [-P * 0.8, 0, -0.4], armR: [-P * 0.8, 0, 0.4], legL: [-0.6, 0, 0], legR: [-0.6, 0, 0] }),
  dodge: (t, d) => { const k = Math.sin(clamp(t / Math.max(d, 0.01)) * P); return { lean: [0, -0.55 * k], bodyY: -0.2 * k, armL: [0, 0, 0.9 * k], armR: [0, 0, -0.5 * k], legL: [0, 0, 0.3 * k] }; },
  throw: (t) => { const k = clamp(t / 0.25); const a = k < 1 ? lerp(-0.3, -P * 0.95, easeOut(k)) : lerp(-P * 0.95, -P * 0.35, easeOut(clamp((t - 0.25) / 0.12))); return { armR: [a, 0, -0.2], lean: [k < 1 ? -0.1 : 0.15, 0] }; },
  slam: (t) => { const k = clamp(t / 0.22); const a = k < 1 ? lerp(-0.4, -P * 0.85, easeOut(k)) : lerp(-P * 0.85, -P * 0.52, easeOut(clamp((t - 0.22) / 0.08))); return { armR: [a, 0, 0.1] }; },   // stops above the podium
  jump: (t, d) => { const k = clamp(t / Math.max(d, 0.3)); return { bodyY: Math.sin(k * P) * 2.2, armL: [-P * 0.9, 0, 0.5], armR: [-P * 0.9, 0, -0.5], legL: [-0.4, 0, 0], legR: [0.2, 0, 0] }; },
  celebrate: (t) => ({ bodyY: Math.abs(Math.sin(t * 7)) * 1.2, armL: [-P * 0.92, 0, 0.5], armR: [-P * 0.92, 0, -0.5] }),
  trophy: (t) => ({ armL: [-P * 0.95, 0, -0.18], armR: [-P * 0.95, 0, 0.18], bodyY: Math.abs(Math.sin(t * 6)) * 0.4 }),
  sneaky: (t) => ({ bodyY: -0.45, lean: [0.25, 0], armL: [-P * 0.3, 0, 0.3], armR: [-P * 0.3, 0, -0.3], head: [0, Math.sin(t * 4) * 0.4, 0] }),
  stretch: () => ({ armL: [-P, 0, 0.25], armR: [-P, 0, -0.25], head: [-0.2, 0, 0] }),
  yawn: () => ({ armL: [-P * 0.95, 0, 0.35], armR: [-P * 0.95, 0, -0.35], head: [-0.25, 0, 0] }),
  // CLAP: hands meet at lt = 0.15 (then every 0.3 s while the gesture lasts: "applaud")
  clap: (t) => clapPose(t, 1),
  applaud: (t) => clapPose(t, 99, 0.24),
  freeze_mid: () => ({}),
};
function clapPose(t, n, every = 0.3) {
  let close;
  if (t < 0.15) close = smooth(t / 0.15) * 0.0 + 0; // opening
  const ph = (t - 0.15) / every;
  if (t < 0.15) close = 1 - Math.cos(clamp(t / 0.15) * P / 2); // swing in
  else if (ph > n - 1 + 0.5) close = 0;
  else close = Math.pow(Math.cos(ph * P), 2);
  const z = 0.22 + 0.42 * close;
  return { armL: [-P * 0.46, 0, -z], armR: [-P * 0.46, 0, z] };
}
export const GESTURES = Object.keys(G);
// clap touch times (local to the gesture) so the studio can put a clap sound on each touch
export function clapTouches(name, dur) {
  if (name === 'clap') return [0.15];
  if (name === 'applaud') { const out = []; for (let t = 0.15; t < dur - 0.05; t += 0.24) out.push(t); return out; }
  return [];
}

export function gesturePose(name, lt, dur) {
  const f = G[name];
  if (!f) throw new Error('unknown gesture ' + name + ' (have: ' + GESTURES.join(', ') + ')');
  return f(lt, dur);
}

// blend partial pose q into p with weight w
export function blendInto(p, q, w) {
  for (const k of Object.keys(q)) {
    if (k === 'bodyY') p.bodyY = lerp(p.bodyY, q.bodyY, w);
    else if (Array.isArray(q[k])) for (let i = 0; i < q[k].length; i++) p[k][i] = lerp(p[k][i], q[k][i], w);
  }
  return p;
}

export function applyPose(ch, p) {
  ch.armL.rotation.set(...p.armL); ch.armR.rotation.set(...p.armR);
  ch.legL.rotation.set(...p.legL); ch.legR.rotation.set(...p.legR);
  ch.head.rotation.set(...p.head); ch.torso.rotation.set(...p.torso);
  ch.body.position.y = p.bodyY;
  ch.body.rotation.set(p.lean[0], 0, p.lean[1]);
}
