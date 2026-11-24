#!/usr/bin/env python3
"""The environment's probe: proves the venv can draw text with the pinned Pillow and the pinned font.

    python3 probe.py --env <envDir>

Prints one line the worker matches before it reports `env:dafiology-pillow@1.0.0`. Also rasterises a short
string, because a Pillow that imports but cannot shape text would fail every render later, in a job.
"""
import os
import sys

from PIL import Image, ImageDraw, ImageFont, __version__ as pillow_version

FONT_FILE = "fonts/dejavu-fonts-ttf-2.37/ttf/DejaVuSans-Bold.ttf"


def arg(name):
    i = sys.argv.index(f"--{name}") if f"--{name}" in sys.argv else -1
    if i < 0 or i + 1 >= len(sys.argv):
        raise SystemExit(f"missing --{name}")
    return sys.argv[i + 1]


def main():
    env = arg("env")
    font_path = os.path.join(env, FONT_FILE)
    if not os.path.exists(font_path):
        raise SystemExit(f"font not found: {font_path}")
    font = ImageFont.truetype(font_path, 24)
    im = Image.new("RGB", (240, 48), (0, 0, 0))
    d = ImageDraw.Draw(im)
    d.text((6, 8), "probe 60%", font=font, fill=(255, 226, 61))
    if d.textlength("probe 60%", font=font) < 40:
        raise SystemExit("Pillow measured no text width; the font did not load")
    if im.getbbox() is None:
        raise SystemExit("Pillow drew nothing")
    print(f"ok pillow {pillow_version} dejavu-2.37")


if __name__ == "__main__":
    main()