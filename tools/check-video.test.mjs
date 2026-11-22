import { test } from "node:test";
import assert from "node:assert/strict";
import { measured, videoIssues } from "./check-video.mjs";

const expect = { format: "short", width: 1080, height: 1920, fps: 30, durationSec: 6, durationToleranceSec: 0.1, qc: ["G-technical"] };
const probe = (o = {}) => ({
  streams: [{ codec_type: "video", codec_name: "h264", width: 1080, height: 1920, pix_fmt: "yuv420p", avg_frame_rate: "30/1", nb_read_frames: "180", ...o }],
  format: { duration: "6.000000" },
});

test("a render that matches expect.json has no issues", () => {
  assert.deepEqual(videoIssues(measured(probe()), expect), []);
});

test("size, fps, duration, frame count, codec and pixel format are each named", () => {
  const m = measured({ ...probe({ width: 720, height: 1280, avg_frame_rate: "25/1", nb_read_frames: "150", codec_name: "vp9", pix_fmt: "yuv444p" }), format: { duration: "5.0" } });
  const issues = videoIssues(m, expect).join("\n");
  for (const re of [/720x1280, expected 1080x1920/, /25 fps, expected 30/, /lasts 5 s, expected 6 s/, /150 frames, expected 180/, /codec is vp9/, /pixel format is yuv444p/]) assert.match(issues, re);
  assert.deepEqual(videoIssues(measured({ streams: [], format: {} }), expect).length, 6, "no video stream fails every check");
});
