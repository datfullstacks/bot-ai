from argparse import ArgumentParser
from pathlib import Path
from shutil import copyfile

from PIL import Image, ImageDraw, ImageFilter, ImageFont


ROOT = Path(__file__).resolve().parents[1]
DEFAULT_BASE = ROOT / "public" / "brand" / "start" / "welcome-base.png"
DEFAULT_OUTPUT = ROOT / "public" / "brand" / "start" / "welcome.png"
FONT_CANDIDATES = [
    Path("C:/Windows/Fonts/bahnschrift.ttf"),
    Path("C:/Windows/Fonts/impact.ttf"),
    Path("C:/Windows/Fonts/arialbd.ttf"),
]


def parse_args():
    parser = ArgumentParser(description="Render the start image with a retro KAITO KID AI SHOP title.")
    parser.add_argument("--base", default=str(DEFAULT_BASE), help="Base welcome PNG. Defaults to welcome-base.png.")
    parser.add_argument("--output", default=str(DEFAULT_OUTPUT), help="Output welcome PNG. Defaults to welcome.png.")
    return parser.parse_args()


def pick_font(size):
    for path in FONT_CANDIDATES:
        if path.exists():
            return ImageFont.truetype(str(path), size=size)
    return ImageFont.load_default(size=size)


def fit_font(text, max_width, max_size, min_size):
    for size in range(max_size, min_size - 1, -2):
        font = pick_font(size)
        box = ImageDraw.Draw(Image.new("RGBA", (1, 1))).textbbox((0, 0), text, font=font, stroke_width=4)
        if box[2] - box[0] <= max_width:
            return font
    return pick_font(min_size)


def draw_neon_text(base, xy, text, font, fill, glow, stroke=(255, 255, 255, 240)):
    x, y = xy
    layer = Image.new("RGBA", base.size, (0, 0, 0, 0))
    draw = ImageDraw.Draw(layer)
    for width, alpha in [(12, 95), (7, 150), (3, 220)]:
        glow_layer = Image.new("RGBA", base.size, (0, 0, 0, 0))
        glow_draw = ImageDraw.Draw(glow_layer)
        glow_draw.text((x, y), text, font=font, fill=(*glow, alpha), stroke_width=width, stroke_fill=(*glow, alpha))
        layer.alpha_composite(glow_layer.filter(ImageFilter.GaussianBlur(radius=max(2, width // 2))))
    draw.text((x, y), text, font=font, fill=fill, stroke_width=3, stroke_fill=stroke)
    base.alpha_composite(layer)


def draw_panel(image):
    width, height = image.size
    panel = Image.new("RGBA", image.size, (0, 0, 0, 0))
    draw = ImageDraw.Draw(panel)

    box = (
        int(width * 0.645),
        int(height * 0.285),
        int(width * 0.955),
        int(height * 0.51),
    )
    draw.rounded_rectangle(box, radius=34, fill=(2, 8, 24, 255), outline=(18, 224, 255, 185), width=3)
    draw.rounded_rectangle(
        (box[0] + 10, box[1] + 10, box[2] - 10, box[3] - 10),
        radius=24,
        outline=(245, 78, 255, 160),
        width=2,
    )

    for offset, color in [(0, (16, 225, 255, 210)), (18, (241, 75, 255, 190))]:
        y = box[3] - 28 - offset
        draw.line((box[0] + 38, y, box[2] - 38, y), fill=color, width=2)

    image.alpha_composite(panel)
    return box


def center_text_x(text, font, box):
    text_box = ImageDraw.Draw(Image.new("RGBA", (1, 1))).textbbox((0, 0), text, font=font, stroke_width=4)
    text_width = text_box[2] - text_box[0]
    return box[0] + ((box[2] - box[0]) - text_width) // 2


def render(base_path, output_path):
    base_path = Path(base_path)
    output_path = Path(output_path)
    if not base_path.exists():
        if not output_path.exists():
            raise FileNotFoundError(f"Missing base image: {base_path}")
        base_path.parent.mkdir(parents=True, exist_ok=True)
        copyfile(output_path, base_path)

    image = Image.open(base_path).convert("RGBA")
    box = draw_panel(image)

    max_text_width = (box[2] - box[0]) - 70
    font_top = fit_font("KAITO KID", max_text_width, 76, 42)
    font_bottom = fit_font("AI SHOP", max_text_width, 84, 42)

    y_top = box[1] + 42
    y_bottom = box[1] + 118
    draw_neon_text(
        image,
        (center_text_x("KAITO KID", font_top, box), y_top),
        "KAITO KID",
        font_top,
        fill=(218, 247, 255, 255),
        glow=(0, 200, 255),
    )
    draw_neon_text(
        image,
        (center_text_x("AI SHOP", font_bottom, box), y_bottom),
        "AI SHOP",
        font_bottom,
        fill=(255, 224, 255, 255),
        glow=(255, 48, 244),
    )

    output_path.parent.mkdir(parents=True, exist_ok=True)
    image.convert("RGB").save(output_path, "PNG", optimize=True)
    return output_path


def main():
    args = parse_args()
    output = render(args.base, args.output)
    print(f"Rendered {output}")


if __name__ == "__main__":
    main()
