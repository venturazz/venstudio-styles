#!/usr/bin/env python3
"""Dafiology full-frame: one plate per scene, moved by the measured camera grammar.

The look comes from the ChikooTale engine (Hermes, `/opt/data/ep01_robotfist/engine.py`) that rendered the
Saitama-vs-MR-FEAST episodes: a full-frame still, a slow push that never crawls, a 2-3 px breath so a still
page does not read as dead, hard cuts, a value-coloured readout chip in the top bar, a callout tag under it,
and the hook burned in for the first 1.6 s. The actor rig, the story audio and the end card are out of scope
in this version; the plate motion, the chip, the tag and the hook are the parts this pack reproduces.

    python3 frames.py --props <props.json> --out <frames dir> --env <envDir> --in <inDir> [--font <ttf>]

Reads only the props, the job's inputs and the environment. Writes exactly `props.totalFrames` PNGs named
000000.png and on, at the job's size. No network, no randomness: the same props render the same pixels.
"""
import argparse
import json
import math
import os
import re
import sys

from PIL import Image, ImageDraw, ImageFont

# The engine was measured at 720x1280; every size below is in that design space and scaled to the job's width.
DW, DH = 720, 1280
BREATH = (2.6, 3.4)          # px of wander at 720 wide: without it a still page reads as dead
PUSH_MAX = 0.16              # the farthest a scene pushes in
INK = (0, 0, 0)
ACCENT = (255, 186, 70)      # the callout tag's bar, the same amber the engine used
HOOK = (255, 226, 61)
DANGER = (255, 78, 60)
WARN = (255, 226, 61)
GOOD = (110, 240, 130)
FONT_FILE = "fonts/dejavu-fonts-ttf-2.37/ttf/DejaVuSans-Bold.ttf"


def arg(name, default=None):
    i = sys.argv.index(f"--{name}") if f"--{name}" in sys.argv else -1
    if i >= 0 and i + 1 < len(sys.argv):
        return sys.argv[i + 1]
    if default is not None:
        return default
    raise SystemExit(f"missing --{name}")


def opt(name):
    """A flag the worker may add or leave out: --font is passed by the worker's command renderer when the job has a
    font, and the environment's own copy is used when it does not."""
    i = sys.argv.index(f"--{name}") if f"--{name}" in sys.argv else -1
    return sys.argv[i + 1] if i >= 0 and i + 1 < len(sys.argv) else None


def ease(u, kind="smooth"):
    u = min(1.0, max(0.0, u))
    if kind == "linear":
        return u
    if kind == "out":
        return 1 - (1 - u) ** 2
    if kind == "snap":
        return 1 - math.exp(-5.5 * u)       # a cut that settles: fast first, then still
    if kind == "out3":
        return 1 - (1 - u) ** 3
    return u * u * (3 - 2 * u)


def cover(im, w, h):
    """Fill the frame: the plate is a still, so it has to cover the box before the camera moves on it."""
    s = max(w / im.width, h / im.height)
    im = im.resize((max(1, int(im.width * s + 0.5)), max(1, int(im.height * s + 0.5))), Image.LANCZOS)
    return im.crop(((im.width - w) // 2, (im.height - h) // 2,
                    (im.width - w) // 2 + w, (im.height - h) // 2 + h)).convert("RGB")


def text_of(scene, kind):
    for e in scene.get("elements") or []:
        if isinstance(e, dict) and e.get("kind") == kind and isinstance(e.get("text"), str) and e["text"].strip():
            return e["text"].strip()
    return None


def value_colour(txt):
    """The engine's readout colours itself by its own number: green, amber, red as it falls.

    The number is the last percentage in the text (the engine read the last number group, not all digits, so a
    label like "P2 60%" colours itself by 60). A text with no number at all reads as the danger end.
    """
    pcts = re.findall(r"(\d+)\s*%", txt)
    nums = pcts or re.findall(r"\d+", txt)
    if not nums:
        return DANGER
    frac = min(1.0, int(nums[-1]) / 100.0)
    if frac > 0.55:
        return GOOD
    if frac > 0.30:
        return WARN
    return DANGER


def fit_font(path, text, draw, max_w, sizes):
    for size in sizes:
        f = ImageFont.truetype(path, size)
        if draw.textlength(text, font=f) <= max_w:
            return f
    return ImageFont.truetype(path, sizes[-1])


def main():
    props_path = arg("props")
    out = arg("out")
    env = arg("env")
    in_dir = arg("in")
    props = json.load(open(props_path, encoding="utf-8"))

    W, H = int(props["width"]), int(props["height"])
    FPS = int(props["fps"])
    total = int(props.get("totalFrames") or round(float(props.get("durationSec") or 0) * FPS))
    if total <= 0:
        raise SystemExit("props: no totalFrames and no durationSec")
    s = W / DW

    font_path = opt("font") or os.path.join(env, FONT_FILE)
    if not os.path.exists(font_path):
        raise SystemExit(f"font not found: {font_path}")

    shots = {sh.get("shotRef"): sh for sh in props.get("shots") or [] if isinstance(sh, dict)}
    scenes = []
    # The worker sends the scenes at the top level (props.scenes, each with start, startFrame and frames). A payload
    # written by hand may carry them under scenePlan only; read both rather than render an empty plan.
    plan_scenes = props.get("scenes") or (props.get("scenePlan") or {}).get("scenes") or []
    for sc in plan_scenes:
        if not isinstance(sc, dict):
            continue
        ref = sc.get("shotRef")
        shot = shots.get(ref) or {}
        image = shot.get("image") or sc.get("image")
        if not image:
            continue
        frames = int(sc.get("frames") or 0) or int(round(float(shot.get("seconds") or sc.get("seconds") or 0) * FPS))
        start = sc.get("startFrame")
        start = int(start) if isinstance(start, (int, float)) else (scenes[-1]["start"] + scenes[-1]["frames"] if scenes else 0)
        scenes.append({"start": start, "frames": max(1, frames), "image": image, "elements": sc.get("elements") or [],
                       "tokens": [t for t in (sc.get("tokens") or []) if isinstance(t, str)], "scene": sc})
    if not scenes:                                   # a payload without a scene list: one plate per shot, in order
        start = 0
        for ref, sh in shots.items():
            f = max(1, int(round(float(sh.get("seconds") or 1) * FPS)))
            scenes.append({"start": start, "frames": f, "image": sh.get("image"), "elements": [], "tokens": [],
                           "scene": {}})
            start += f
    scenes.sort(key=lambda x: x["start"])

    plates = {}
    for sc in scenes:
        if sc["image"] not in plates:
            p = os.path.join(in_dir, sc["image"])
            if not os.path.exists(p):
                raise SystemExit(f"input picture missing: {p}")
            plates[sc["image"]] = cover(Image.open(p), W, H)

    hook_txt = text_of(scenes[0]["scene"], "heading")
    # The hook is written by the request, so it can be any length: fit it, and break it in two before it leaves the frame.
    hook_lines = []
    if hook_txt:
        probe = ImageDraw.Draw(Image.new("RGB", (8, 8)))
        max_w = W - int(80 * s)
        sizes = [int(v * s) for v in (58, 52, 46, 40, 36, 32, 28)]
        one = fit_font(font_path, hook_txt, probe, max_w, sizes)
        if probe.textlength(hook_txt, font=one) <= max_w:
            hook_lines = [(hook_txt, one)]
        else:
            words = hook_txt.split()
            for cut in range(1, len(words)):
                l1, l2 = " ".join(words[:cut]), " ".join(words[cut:])
                for size in sizes:
                    f2 = ImageFont.truetype(font_path, size)
                    if max(probe.textlength(l1, font=f2), probe.textlength(l2, font=f2)) <= max_w:
                        hook_lines = [(l1, f2), (l2, f2)]
                        break
                if hook_lines:
                    break
            if not hook_lines:                       # one unbreakable word: put it on screen at the smallest size
                hook_lines = [(hook_txt, ImageFont.truetype(font_path, sizes[-1]))]
    chip_sizes = [int(v * s) for v in (21, 19, 17, 15, 14)]
    tag_size = int(19 * s)

    os.makedirs(out, exist_ok=True)
    tag_cache = {}
    print(f"rendering {total} frames / {len(scenes)} scenes / {len(plates)} plates at {W}x{H}@{FPS}", flush=True)

    for fi in range(total):
        t = fi / FPS
        sc = next((x for x in scenes if x["start"] <= fi < x["start"] + x["frames"]), scenes[-1])
        u = min(1.0, max(0.0, (fi - sc["start"]) / max(1, sc["frames"])))
        local = (fi - sc["start"]) / FPS
        frame = plates[sc["image"]].copy()
        d0 = ImageDraw.Draw(frame)

        push = "push" in sc["tokens"]
        drift = "drift" in sc["tokens"]
        c = (1.0 + PUSH_MAX * ease(u, "snap")) if push else 1.0
        fx = min(0.97, max(0.03, 0.5 + (0.03 * u if drift else 0.0)))
        fy = 0.5
        bx = BREATH[0] * s * math.sin(2 * math.pi * 0.62 * t)
        by = BREATH[1] * s * math.sin(2 * math.pi * 0.85 * t + 1.7)
        nw, nh = max(W + 4, int(W * c)), max(H + 4, int(H * c))
        ox = int((nw - W) * fx) + int(bx)
        oy = int((nh - H) * fy) + int(by)
        ox = max(0, min(nw - W, ox))
        oy = max(0, min(nh - H, oy))
        frame = frame.resize((nw, nh), Image.LANCZOS).crop((ox, oy, ox + W, oy + H)).convert("RGB")
        d = ImageDraw.Draw(frame)

        # ---- readout chip: top-right, its colour is its own number, shrunk before it can reach the middle
        chip = text_of(sc["scene"], "counter")
        if chip:
            f = fit_font(font_path, chip, d, int(W * 0.52), chip_sizes)
            pad = int(13 * s)
            cw = int(d.textlength(chip, font=f)) + pad * 2
            x1 = W - int(36 * s)
            y0 = int(56 * s)
            d.rounded_rectangle([x1 - cw, y0, x1, y0 + int(32 * s)], radius=int(6 * s), fill=INK)
            d.text((x1 - cw + pad, y0 + int((32 * s - f.size) / 2) - int(2 * s)), chip, font=f, fill=value_colour(chip))

        # ---- callout tag: a small tag under the bar, out of the subject's way, faded at both ends
        tag = text_of(sc["scene"], "callout")
        if tag and local > 0.25:
            key = tag
            if key not in tag_cache:
                f = ImageFont.truetype(font_path, tag_size)
                pad = int(8 * s)
                tw = int(min(d0.textlength(tag, font=f), W - int(140 * s)))
                wi, hi = tw + pad * 2 + int(6 * s), int(tag_size + pad * 1.3)
                im = Image.new("RGBA", (wi, hi), (0, 0, 0, 0))
                dd = ImageDraw.Draw(im)
                dd.rounded_rectangle([0, 0, wi - 1, hi - 1], radius=int(5 * s), fill=INK + (168,))
                dd.rectangle([0, 0, int(3 * s), hi - 1], fill=ACCENT + (235,))
                dd.text((pad + int(6 * s), int((hi - tag_size) / 2) - 1), tag, font=f, fill=ACCENT + (245,))
                tag_cache[key] = im
            li = tag_cache[key]
            a = min(1.0, local / 0.30, max(0.0, (sc["frames"] / FPS - local) / 0.40))
            if a > 0.02:
                lr = li.copy()
                lr.putalpha(lr.getchannel("A").point(lambda v: int(v * a)))
                frame.paste(lr, (int(18 * s), int(126 * s)), lr)
                d = ImageDraw.Draw(frame)

        # ---- hook: the first 1.6 s carry the promise, then they get out of the picture
        if hook_lines and t < 1.6:
            al = min(1.0, t / 0.25) * (1.0 if t < 1.28 else max(0.0, (1.6 - t) / 0.32))
            lh = max(f.size for _, f in hook_lines) + int(10 * s)
            y0 = int(852 * (H / DH)) - (len(hook_lines) - 1) * lh // 2
            for li, (txt, fnt) in enumerate(hook_lines):
                tw = d.textlength(txt, font=fnt)
                d.text(((W - tw) / 2, y0 + li * lh), txt, font=fnt,
                       fill=(int(255 * al), int(255 * al), int(255 * al)),
                       stroke_width=max(2, int(6 * s)), stroke_fill=INK)

        frame.save(os.path.join(out, f"{fi:06d}.png"), optimize=False, compress_level=1)
        if fi % 60 == 0 or fi == total - 1:
            print(f"  frame {fi + 1}/{total}", flush=True)

    print(f"wrote {total} frames to {out}", flush=True)


if __name__ == "__main__":
    main()