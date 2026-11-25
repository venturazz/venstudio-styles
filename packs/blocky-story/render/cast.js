/* The choreography: what a Roblox short looks like when the kit's DSL is used as a style instead of a script.
 *
 * Locked here: the cast (the kit's blocky figures), the eight locations, the camera vocabulary (push, pull, orbit, crane),
 * a gesture on every shot, hard cuts, and the caption band drawn by the kit itself from the voice's word timings.
 *
 * Open to the request: how many shots, how long, the caption text, and the motion token per shot. Nothing in this file
 * knows what the film is about; it only knows how this look behaves when it is asked for one.
 */

const SETS = ["plaza", "schoolyard", "classroom", "gym", "auditorium", "townhall", "rumah", "kelas_tua"];

// Two characters per shot, taken from the kit's own presets. A short that runs longer than eight shots starts reusing
// looks, which is what a small cast does anyway.
const CAST = ["hero", "kid", "girl", "mom", "dad", "teacher", "bully", "mayor"];

// One gesture per shot, so the shot has something to look at even when the line is short.
const GESTURES = ["wave", "clap", "nod", "point", "jump", "cheer", "bow", "shrug"];

// A writer asks for "zoom in"; this is what that means in this look.
const MOVES = {
  "zoom-in": { move: "push", amount: 0.1 },
  "push-in": { move: "push", amount: 0.1 },
  "zoom-out": { move: "pull", amount: 0.1 },
  "pan-left": { move: "orbit", deg: 26 },
  "pan-right": { move: "orbit", deg: -26 },
  orbit: { move: "orbit", deg: 30 },
  crane: { move: "crane", rise: 5 },
  static: { move: "push", amount: 0.03 },
};

/** Where the two figures stand, per shot index. Kept close to the middle: sets are built around their own origin. */
function stage(shotIndex) {
  const flip = shotIndex % 2 === 1;
  // Close enough together to share a frame: two figures three blocks apart read as a scene, five apart read as one figure
  // and an elbow at the edge of the picture.
  return [
    { p: [-1.5, 3.4], ry: flip ? 0.3 : -0.25, expr: "normal" },
    { p: [1.25, 3.8], ry: flip ? -0.35 : 0.3, expr: shotIndex % 3 === 0 ? "normal" : "smile" },
  ];
}

/**
 * The one function the studio calls. `plan.shots[i]` carries the seconds, the motion token and the word index the shot
 * starts on; the words themselves come from the run's captions.
 */
export function buildShots(K, plan) {
  plan.shots.forEach((shot, i) => {
    const set = SETS[i % SETS.length];
    const [a, b] = [CAST[(i * 2) % CAST.length], CAST[(i * 2 + 1) % CAST.length]];
    const gesture = GESTURES[i % GESTURES.length];
    const move = MOVES[shot.motion] ?? MOVES["zoom-in"];
    const spots = stage(i);

    K.shot(shot.word, `${set}: ${a} and ${b}`, (s) => {
      s.set(set);
      const first = K.char(a === "hero" ? "Rangga" : a, a);
      const second = K.char(b === "hero" ? "Rangga" : b, b);
      s.put(first, spots[0].p, { ry: spots[0].ry, expr: spots[0].expr });
      s.put(second, spots[1].p, { ry: spots[1].ry, expr: spots[1].expr });

      // The gesture lands a third of the way in: long enough to see the figures, early enough that the shot is not a still.
      s.do(first, gesture, Math.max(0.2, shot.seconds / 3));
      s.do(second, GESTURES[(i + 3) % GESTURES.length], Math.max(0.4, shot.seconds / 2));
      s.expr(first, i % 4 === 2 ? "wink" : "normal", 0.1);

      s.cam({ at: first, dist: 12.8, side: i % 2 === 0 ? 2.4 : -2.4, h: 6.1, lens: 33, ...move });
    });
  });
}