"""Paint Home Screen splash images from the region art."""

from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
MAP = ROOT / "public" / "art" / "map-bg.webp"
ICON = ROOT / "public" / "art" / "icon.webp"
OUT = ROOT / "dist" / "splash"

SIZES = {
    "ipad-11-portrait.jpg": (1668, 2388),
    "ipad-11-landscape.jpg": (2388, 1668),
    "ipad-13-portrait.jpg": (2064, 2752),
    "ipad-13-landscape.jpg": (2752, 2064),
    "ipad-129-portrait.jpg": (2048, 2732),
    "ipad-129-landscape.jpg": (2732, 2048),
    "ipad-10-portrait.jpg": (1640, 2360),
    "ipad-10-landscape.jpg": (2360, 1640),
    "iphone-14-portrait.jpg": (1170, 2532),
    "iphone-14pm-portrait.jpg": (1290, 2796),
}


def cover(im: Image.Image, size: tuple[int, int]) -> Image.Image:
    target_w, target_h = size
    scale = max(target_w / im.width, target_h / im.height)
    resized = im.resize((int(im.width * scale), int(im.height * scale)), Image.Resampling.LANCZOS)
    left = (resized.width - target_w) // 2
    top = (resized.height - target_h) // 2
    return resized.crop((left, top, left + target_w, top + target_h))


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    scene = Image.open(MAP).convert("RGB")
    mark = Image.open(ICON).convert("RGBA")
    for name, size in SIZES.items():
        canvas = cover(scene, size).convert("RGBA")
        side = int(min(size) * 0.42)
        icon = mark.resize((side, side), Image.Resampling.LANCZOS)
        x = (size[0] - side) // 2
        y = int(size[1] * 0.33)
        canvas.alpha_composite(icon, (x, y))
        canvas.convert("RGB").save(OUT / name, "JPEG", quality=78, optimize=True)
    print(f"splashes {len(SIZES)}")


if __name__ == "__main__":
    main()
