#!/usr/bin/env node
/**
 * Checks a rendered fixture against its pack's fixtures/expect.json: frame size, frame rate, duration (within
 * durationToleranceSec) and the exact frame count (durationSec x fps), read with ffprobe. Zero dependencies.
 *
 *   node tools/check-video.mjs <video.mp4> <packs/<id>/fixtures/expect.json>
 */
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

/** What ffprobe -count_frames -show_entries stream=...:format=duration -of json printed, reduced to what we check. */
export function measured(probeJson) {
  const v = (probeJson?.streams ?? []).find((s) => s.codec_type === "video") ?? {};
  const [num, den] = String(v.avg_frame_rate ?? v.r_frame_rate ?? "0/1").split("/").map(Number);
  return {
    width: Number(v.width),
    height: Number(v.height),
    fps: den ? Math.round((num / den) * 1000) / 1000 : 0,
    frames: Number(v.nb_read_frames),
    durationSec: Number(probeJson?.format?.duration),
    codec: v.codec_name ?? null,
    pixFmt: v.pix_fmt ?? null,
  };
}

/** Why a measured video does not meet expect.json, or []. Pure. */
export function videoIssues(m, expect) {
  const issues = [];
  if (m.width !== expect.width || m.height !== expect.height) issues.push(`it is ${m.width}x${m.height}, expected ${expect.width}x${expect.height}`);
  if (Math.abs(m.fps - expect.fps) > 0.01) issues.push(`it runs at ${m.fps} fps, expected ${expect.fps}`);
  const tol = typeof expect.durationToleranceSec === "number" ? expect.durationToleranceSec : 0.1;
  if (!(Math.abs(m.durationSec - expect.durationSec) <= tol)) issues.push(`it lasts ${m.durationSec} s, expected ${expect.durationSec} s (within ${tol} s)`);
  const frames = Math.round(expect.durationSec * expect.fps);
  if (m.frames !== frames) issues.push(`it has ${m.frames} frames, expected ${frames}`);
  if (m.codec !== "h264") issues.push(`its codec is ${m.codec}, expected h264`);
  if (m.pixFmt !== "yuv420p") issues.push(`its pixel format is ${m.pixFmt}, expected yuv420p`);
  return issues;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [video, expectFile] = process.argv.slice(2);
  if (!video || !expectFile) {
    console.error("usage: node tools/check-video.mjs <video.mp4> <fixtures/expect.json>");
    process.exit(2);
  }
  const expect = JSON.parse(readFileSync(expectFile, "utf8"));
  const out = execFileSync(
    "ffprobe",
    ["-v", "error", "-count_frames", "-select_streams", "v:0", "-show_entries", "stream=codec_type,codec_name,width,height,pix_fmt,avg_frame_rate,r_frame_rate,nb_read_frames:format=duration", "-of", "json", video],
    { encoding: "utf8" },
  );
  const m = measured(JSON.parse(out));
  const issues = videoIssues(m, expect);
  console.log(`${video}: ${JSON.stringify(m)}`);
  if (issues.length > 0) {
    console.error(`${video} does not meet ${expectFile}: ${issues.join("; ")}`);
    process.exit(1);
  }
}
