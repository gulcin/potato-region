"""Turn generated paintings into game-ready WebP sprites and an opaque app icon."""

from __future__ import annotations

from pathlib import Path

import numpy as np
from PIL import Image

RAW = Path("/opt/cursor/artifacts/assets")
OUT = Path("/workspace/public/art")
ICON_DIR = Path("/workspace/public")

# name, key (green|magenta|none), mode (body|pet|item|scene|icon)
JOBS: list[tuple[str, str, str]] = [
    ("girl-farm.jpg", "green", "body"),
    ("mum.jpg", "green", "body"),
    ("girl-strap.jpg", "green", "body"),
    ("girl-pink.jpg", "green", "body"),
    ("girl-coat.jpg", "green", "body"),
    ("girl-party.jpg", "green", "body"),
    ("pet-potato.jpg", "magenta", "pet"),
    ("pet-potato-happy.jpg", "magenta", "pet"),
    ("pet-chihuahua.jpg", "green", "pet"),
    ("pet-bird.jpg", "green", "pet"),
    ("pet-bunny.jpg", "green", "pet"),
    ("shopkeeper.jpg", "green", "body"),
    ("acc-headband.jpg", "magenta", "item"),
    ("acc-crown.jpg", "magenta", "item"),
    ("acc-hat.jpg", "green", "item"),
    ("potato-count.jpg", "green", "item"),
    ("potato-blue.jpg", "green", "item"),
    ("potato-green.jpg", "magenta", "item"),
    ("potato-red.jpg", "green", "item"),
    ("potato-purple.jpg", "green", "item"),
    ("potato-pink.jpg", "green", "item"),
    ("potato-orange.jpg", "green", "item"),
    ("potato-turquoise.jpg", "magenta", "item"),
    ("potato-lilac.jpg", "green", "item"),
    ("furn-sofa.jpg", "green", "item"),
    ("furn-rug.jpg", "magenta", "item"),
    ("furn-lamp.jpg", "green", "item"),
    ("furn-books.jpg", "green", "item"),
    ("furn-table.jpg", "green", "item"),
    ("furn-chair.jpg", "green", "item"),
    ("sprout.jpg", "magenta", "item"),
    ("leafy.jpg", "magenta", "item"),
    ("soil.jpg", "green", "bed"),
    ("wood-sign.jpg", "green", "sign"),
    ("heart.jpg", "green", "item"),
    ("emote-wave.jpg", "green", "item"),
    ("basket.jpg", "green", "item"),
    ("water.jpg", "magenta", "item"),
    ("map-bg.jpg", "none", "scene"),
    ("shop-bg.jpg", "none", "scene"),
    ("house-bg.jpg", "none", "scene"),
    ("dress-bg.jpg", "none", "scene"),
    ("farm-blue.jpg", "none", "scene"),
    ("farm-green.jpg", "none", "scene"),
    ("farm-red.jpg", "none", "scene"),
    ("farm-purple.jpg", "none", "scene"),
    ("farm-pink.jpg", "none", "scene"),
    ("farm-orange.jpg", "none", "scene"),
    ("farm-turquoise.jpg", "none", "scene"),
    ("farm-lilac.jpg", "none", "scene"),
    ("icon.jpg", "none", "icon"),
]


def key_color(im: Image.Image, kind: str) -> Image.Image:
    arr = np.array(im.convert("RGBA"))
    r = arr[:, :, 0].astype(np.int16)
    g = arr[:, :, 1].astype(np.int16)
    b = arr[:, :, 2].astype(np.int16)
    if kind == "green":
        hard = (g > 165) & (g > r + 40) & (g > b + 40)
        soft = (g > 130) & (g > r + 22) & (g > b + 22) & ~hard
    else:
        # Hot pink screens are about rgb(230, 6, 130). Pure magenta screens are about rgb(248, 5, 221).
        hot = (r > 165) & (g < 80) & (b > 80) & (b < 200) & (r > g + 70) & (r > b + 30)
        pure = (r > 200) & (b > 180) & (g < 45) & (r > g + 100) & (b > g + 100)
        hard = hot | pure
        soft = (r > 170) & (b > 140) & (g < 75) & (g >= 45) & (r > g + 80) & (b > g + 70) & ~hard
    alpha = np.full(r.shape, 255, np.uint8)
    alpha[hard] = 0
    alpha[soft] = 40
    if kind == "green":
        spill = (g > r + 8) & (g > b + 8) & (alpha > 0)
        g = np.where(spill, np.maximum(r, b), g)
    else:
        edge = (alpha > 0) & (alpha < 255)
        spill = edge & (r > g + 25) & (b > g + 10)
        r = np.where(spill, (r + g) // 2, r)
        b = np.where(spill, (b * 2 + g) // 3, b)
        fringe = (g < 95) & (r > 145) & (b > 110) & (r > g + 45) & (b > g + 35)
        alpha[fringe] = 0
    arr[:, :, 0] = np.clip(r, 0, 255).astype(np.uint8)
    arr[:, :, 1] = np.clip(g, 0, 255).astype(np.uint8)
    arr[:, :, 2] = np.clip(b, 0, 255).astype(np.uint8)
    arr[:, :, 3] = alpha
    return Image.fromarray(arr)


def bbox(im: Image.Image) -> tuple[int, int, int, int] | None:
    alpha = np.array(im.split()[-1])
    ys, xs = np.where(alpha > 20)
    if len(xs) == 0:
        return None
    return int(xs.min()), int(ys.min()), int(xs.max()) + 1, int(ys.max()) + 1


def place(im: Image.Image, size: tuple[int, int], fill: float, feet: bool) -> Image.Image:
    box = bbox(im)
    if box is None:
        return Image.new("RGBA", size, (0, 0, 0, 0))
    crop = im.crop(box)
    cw, ch = crop.size
    canvas_w, canvas_h = size
    scale = min(canvas_w * fill / cw, canvas_h * fill / ch)
    nw, nh = max(1, int(cw * scale)), max(1, int(ch * scale))
    crop = crop.resize((nw, nh), Image.Resampling.LANCZOS)
    out = Image.new("RGBA", size, (0, 0, 0, 0))
    x = (canvas_w - nw) // 2
    y = canvas_h - nh - int(canvas_h * 0.02) if feet else (canvas_h - nh) // 2
    out.paste(crop, (x, y), crop)
    return out


def redden(im: Image.Image) -> Image.Image:
    """Push a brownish tuber toward a clearly red potato without touching the green screen."""
    arr = np.array(im.convert("RGBA"))
    r = arr[:, :, 0].astype(np.int16)
    g = arr[:, :, 1].astype(np.int16)
    b = arr[:, :, 2].astype(np.int16)
    screen = (g > 170) & (g > r + 35) & (g > b + 35)
    arr[:, :, 0] = np.where(screen, r, np.clip(r + 36, 0, 255)).astype(np.uint8)
    arr[:, :, 1] = np.where(screen, g, np.clip(g * 55 // 100, 0, 255)).astype(np.uint8)
    arr[:, :, 2] = np.where(screen, b, np.clip(b * 50 // 100, 0, 255)).astype(np.uint8)
    return Image.fromarray(arr)


def save_webp(im: Image.Image, path: Path, quality: int = 82) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    im.save(path, "WEBP", quality=quality, method=6)


def flatten_icon(im: Image.Image, size: int) -> Image.Image:
    im = im.convert("RGBA")
    bg = Image.new("RGBA", im.size, im.getpixel((2, 2)))
    bg.alpha_composite(im)
    flat = bg.convert("RGB")
    return flat.resize((size, size), Image.Resampling.LANCZOS)


def write_icons(icon: Image.Image) -> None:
    ICON_DIR.mkdir(parents=True, exist_ok=True)
    pairs = {
        "apple-touch-icon.png": 180,
        "apple-touch-icon-precomposed.png": 180,
        "apple-touch-icon-167.png": 167,
        "apple-touch-icon-152.png": 152,
        "icon-192.png": 192,
        "icon-512.png": 512,
        "favicon-32.png": 32,
    }
    for name, size in pairs.items():
        flatten_icon(icon, size).save(ICON_DIR / name, "PNG", optimize=True)
    # Maskable icon keeps a safe margin so the system mask does not crop faces.
    mask = Image.new("RGB", (512, 512), icon.convert("RGB").getpixel((4, 4)))
    inner = flatten_icon(icon, 410)
    mask.paste(inner, ((512 - 410) // 2, (512 - 410) // 2))
    mask.save(ICON_DIR / "icon-maskable-512.png", "PNG", optimize=True)


def paper() -> None:
    rng = np.random.default_rng(3)
    h = w = 128
    base = np.zeros((h, w, 3), np.float32)
    base[:, :, 0] = 247
    base[:, :, 1] = 241
    base[:, :, 2] = 228
    noise = rng.normal(0, 5, (h, w, 1))
    img = np.clip(base + noise, 0, 255).astype(np.uint8)
    Image.fromarray(img).save(OUT / "paper.webp", "WEBP", quality=70, method=6)


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    missing = []
    for filename, key, mode in JOBS:
        src = RAW / filename
        if not src.exists():
            missing.append(filename)
            continue
        im = Image.open(src)
        if mode == "icon":
            write_icons(im)
            save_webp(im.convert("RGB"), OUT / "icon.webp", 86)
            continue
        if mode == "scene":
            im = im.convert("RGB")
            im.thumbnail((1600, 1600), Image.Resampling.LANCZOS)
            save_webp(im, OUT / (Path(filename).stem + ".webp"), 80)
            continue
        if filename == "potato-red.jpg":
            im = redden(im)
        if key != "none":
            im = key_color(im, key)
        if mode == "body":
            im = place(im, (700, 1000), 0.94, True)
        elif mode == "pet":
            im = place(im, (800, 800), 0.92, True)
        elif mode == "bed":
            im = place(im, (960, 420), 0.98, False)
        elif mode == "sign":
            im = place(im, (640, 760), 0.96, False)
        else:
            im = place(im, (640, 640), 0.9, False)
        save_webp(im, OUT / (Path(filename).stem + ".webp"), 84)
    paper()
    if missing:
        print("missing:", ", ".join(missing))
    else:
        print("all art processed")


if __name__ == "__main__":
    main()
