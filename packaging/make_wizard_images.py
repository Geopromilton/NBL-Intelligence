"""Installer side and corner images from the brand mark (Inno Setup needs BMP)."""
import sys
from pathlib import Path

from PIL import Image, ImageDraw

root = Path(__file__).resolve().parents[1]
out = Path(sys.argv[1])
mark = Image.open(root / "assets" / "brand" / "mark-512.png").convert("RGBA")

side = Image.new("RGB", (164, 314), (11, 27, 46))
d = ImageDraw.Draw(side)
for i, y in enumerate(range(250, 314, 9)):
    d.line([(0, y), (164, y - 6)], fill=(31, 163, 214) if i % 2 else (196, 98, 45), width=1)
m = mark.resize((120, 120), Image.LANCZOS)
side.paste(m, (22, 60), m)
side.save(out / "wizard.bmp")

small = Image.new("RGB", (55, 55), (255, 255, 255))
m = mark.resize((51, 51), Image.LANCZOS)
small.paste(m, (2, 2), m)
small.save(out / "wizard-small.bmp")
print("wizard images ok")
