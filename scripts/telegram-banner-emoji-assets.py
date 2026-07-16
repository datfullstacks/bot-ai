import argparse
import json
import math
import os
import shutil
import subprocess
import tempfile
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter, ImageFont


ITEMS = [
    {"key": "kaito", "text": "KAITO", "emoji": "✨", "color": (56, 189, 248), "accent": (250, 204, 21)},
    {"key": "welcome", "text": "HI", "emoji": "👋", "color": (244, 114, 182), "accent": (34, 211, 238)},
    {"key": "products", "text": "SHOP", "emoji": "🛒", "color": (34, 197, 94), "accent": (250, 204, 21)},
    {"key": "orders", "text": "ORD", "emoji": "📦", "color": (249, 115, 22), "accent": (125, 211, 252)},
    {"key": "support", "text": "SUP", "emoji": "🎧", "color": (217, 70, 239), "accent": (253, 224, 71)},
    {"key": "account", "text": "USER", "emoji": "👤", "color": (139, 92, 246), "accent": (52, 211, 153)},
    {"key": "checkin", "text": "CHECK", "emoji": "📝", "color": (45, 212, 191), "accent": (251, 113, 133)},
    {"key": "minigame", "text": "GAME", "emoji": "🎮", "color": (168, 85, 247), "accent": (250, 204, 21)},
    {"key": "vip", "text": "VIP", "emoji": "👑", "color": (250, 204, 21), "accent": (244, 114, 182)},
    {"key": "hot", "text": "HOT", "emoji": "🔥", "color": (239, 68, 68), "accent": (253, 224, 71)},
    {"key": "new", "text": "NEW", "emoji": "🆕", "color": (59, 130, 246), "accent": (34, 197, 94)},
    {"key": "sale", "text": "SALE", "emoji": "🎫", "color": (236, 72, 153), "accent": (250, 204, 21)},
    {"key": "auto247", "text": "24/7", "emoji": "⚡", "color": (34, 211, 238), "accent": (132, 204, 22)},
    {"key": "trusted", "text": "TRUST", "emoji": "🛡️", "color": (96, 165, 250), "accent": (52, 211, 153)},
    {"key": "delivery", "text": "SHIP", "emoji": "📦", "color": (251, 146, 60), "accent": (34, 211, 238)},
    {"key": "payment", "text": "PAY", "emoji": "💳", "color": (52, 211, 153), "accent": (250, 204, 21)},
    {"key": "ai", "text": "AI", "emoji": "🤖", "color": (129, 140, 248), "accent": (34, 211, 238)},
    {"key": "mmo", "text": "MMO", "emoji": "🎯", "color": (14, 165, 233), "accent": (250, 204, 21)},
    {"key": "instant", "text": "NOW", "emoji": "⚡", "color": (34, 211, 238), "accent": (250, 204, 21)},
    {"key": "secure", "text": "SAFE", "emoji": "🛡️", "color": (74, 222, 128), "accent": (96, 165, 250)},
    {"key": "guide", "text": "GUIDE", "emoji": "📜", "color": (251, 191, 36), "accent": (244, 114, 182)},
    {"key": "contact", "text": "CHAT", "emoji": "💬", "color": (45, 212, 191), "accent": (167, 139, 250)},
    {"key": "stock", "text": "STOCK", "emoji": "📦", "color": (34, 197, 94), "accent": (125, 211, 252)},
    {"key": "soldout", "text": "SOLD", "emoji": "⚠️", "color": (248, 113, 113), "accent": (253, 224, 71)},
    {"key": "review", "text": "RATE", "emoji": "✨", "color": (232, 121, 249), "accent": (52, 211, 153)},
    {"key": "refund", "text": "REFUND", "emoji": "↩️", "color": (251, 146, 60), "accent": (96, 165, 250)},
    {"key": "combo", "text": "COMBO", "emoji": "🎁", "color": (236, 72, 153), "accent": (34, 211, 238)},
    {"key": "member", "text": "MEMBER", "emoji": "👑", "color": (250, 204, 21), "accent": (168, 85, 247)},
    {"key": "news", "text": "NEWS", "emoji": "📄", "color": (59, 130, 246), "accent": (52, 211, 153)},
    {"key": "event", "text": "EVENT", "emoji": "🎮", "color": (168, 85, 247), "accent": (251, 191, 36)},
    {"key": "policy", "text": "RULE", "emoji": "🛡️", "color": (96, 165, 250), "accent": (34, 197, 94)},
    {"key": "logout", "text": "LOGOUT", "emoji": "🔌", "color": (148, 163, 184), "accent": (248, 113, 113)},
]

FONT_CANDIDATES = [
    Path("C:/Windows/Fonts/impact.ttf"),
    Path("C:/Windows/Fonts/bahnschrift.ttf"),
    Path("C:/Windows/Fonts/arialbd.ttf"),
    Path("/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"),
]


def parse_args():
    parser = argparse.ArgumentParser(description="Generate KAITO Telegram banner custom emoji videos.")
    parser.add_argument("--output", required=True)
    parser.add_argument("--manifest", default="")
    parser.add_argument("--preview", default="")
    parser.add_argument("--size", type=int, default=100)
    parser.add_argument("--duration", type=float, default=2.0)
    parser.add_argument("--fps", type=int, default=24)
    parser.add_argument("--crf", type=int, default=48)
    parser.add_argument("--ffmpeg", default="")
    return parser.parse_args()


def resolve_ffmpeg(explicit_path):
    if explicit_path:
        return explicit_path
    if os.environ.get("FFMPEG_PATH"):
        return os.environ["FFMPEG_PATH"]
    candidates = [
        Path.cwd() / "node_modules" / "@ffmpeg-installer" / "win32-x64" / "ffmpeg.exe",
        Path.cwd() / "node_modules" / "@ffmpeg-installer" / "linux-x64" / "ffmpeg",
        Path.cwd() / "node_modules" / "@ffmpeg-installer" / "darwin-x64" / "ffmpeg",
        Path.cwd() / "node_modules" / "@ffmpeg-installer" / "darwin-arm64" / "ffmpeg",
    ]
    for candidate in candidates:
        if candidate.exists():
            return str(candidate)
    found = shutil.which("ffmpeg")
    if found:
        return found
    raise RuntimeError("ffmpeg is required. Install npm dependencies or set FFMPEG_PATH.")


def pick_font(size):
    for path in FONT_CANDIDATES:
        if path.exists():
            return ImageFont.truetype(str(path), size=size)
    return ImageFont.load_default(size=size)


def fit_font(text, max_width, max_height):
    for size in range(42, 12, -2):
        font = pick_font(size)
        box = ImageDraw.Draw(Image.new("RGBA", (1, 1))).textbbox((0, 0), text, font=font, stroke_width=2)
        if box[2] - box[0] <= max_width and box[3] - box[1] <= max_height:
            return font
    return pick_font(12)


def render_frame(item, size, frame_index, total_frames):
    t = frame_index / max(total_frames - 1, 1)
    phase = math.sin(2 * math.pi * t)
    color = item["color"]
    accent = item["accent"]
    image = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(image)

    pulse = int(4 + 2 * phase)
    panel = (10 - pulse, 25 - pulse, size - 10 + pulse, size - 25 + pulse)
    glow = Image.new("RGBA", image.size, (0, 0, 0, 0))
    glow_draw = ImageDraw.Draw(glow)
    glow_draw.rounded_rectangle(panel, radius=8, fill=(*color, 70), outline=(*accent, 160), width=3)
    image.alpha_composite(glow.filter(ImageFilter.GaussianBlur(3)))
    draw.rounded_rectangle((10, 25, size - 10, size - 25), radius=8, fill=(15, 23, 42, 210), outline=(*accent, 230), width=2)

    shine_x = int(12 + (size - 24) * t)
    draw.line((shine_x, 27, shine_x - 18, size - 28), fill=(255, 255, 255, 70), width=3)
    draw.rectangle((14, size - 18, size - 14, size - 15), fill=(*accent, 180))

    font = fit_font(item["text"], size - 22, 42)
    box = draw.textbbox((0, 0), item["text"], font=font, stroke_width=2)
    text_width = box[2] - box[0]
    text_height = box[3] - box[1]
    x = (size - text_width) // 2
    y = (size - text_height) // 2 - 2 + int(2 * phase)

    for blur, alpha in [(5, 90), (2, 160)]:
        layer = Image.new("RGBA", image.size, (0, 0, 0, 0))
        layer_draw = ImageDraw.Draw(layer)
        layer_draw.text((x, y), item["text"], font=font, fill=(*color, alpha), stroke_width=3, stroke_fill=(*color, alpha))
        image.alpha_composite(layer.filter(ImageFilter.GaussianBlur(blur)))

    draw.text((x, y), item["text"], font=font, fill=(255, 255, 255, 255), stroke_width=2, stroke_fill=(*color, 255))
    return image


def render_animation(item, output_path, frame_dir, ffmpeg_path, size, duration, fps, crf):
    total_frames = max(1, int(duration * fps))
    for frame_index in range(total_frames):
        frame = render_frame(item, size, frame_index, total_frames)
        frame.save(frame_dir / f"frame_{frame_index:04d}.png")

    command = [
        ffmpeg_path,
        "-y",
        "-framerate", str(fps),
        "-i", str(frame_dir / "frame_%04d.png"),
        "-an",
        "-c:v", "libvpx-vp9",
        "-b:v", "0",
        "-crf", str(crf),
        "-pix_fmt", "yuva420p",
        "-auto-alt-ref", "0",
        str(output_path),
    ]
    result = subprocess.run(command, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
    if result.returncode != 0:
        raise RuntimeError(f"ffmpeg failed for {output_path.name}: {result.stderr.strip()}")


def render_preview_sheet(items, preview_path, size):
    columns = 8
    padding = 10
    label_height = 18
    rows = math.ceil(len(items) / columns)
    sheet = Image.new(
        "RGBA",
        (columns * (size + padding) + padding, rows * (size + label_height + padding) + padding),
        (15, 23, 42, 255),
    )
    draw = ImageDraw.Draw(sheet)
    label_font = pick_font(11)
    for index, item in enumerate(items):
        column = index % columns
        row = index // columns
        x = padding + column * (size + padding)
        y = padding + row * (size + label_height + padding)
        tile = render_frame(item, size, 0, 1)
        sheet.alpha_composite(tile, (x, y))
        draw.text((x + 2, y + size + 2), item["key"][:12], font=label_font, fill=(226, 232, 240, 255))
    preview_path.parent.mkdir(parents=True, exist_ok=True)
    sheet.convert("RGB").save(preview_path)


def main():
    args = parse_args()
    output_dir = Path(args.output)
    output_dir.mkdir(parents=True, exist_ok=True)
    ffmpeg_path = resolve_ffmpeg(args.ffmpeg)

    files = []
    with tempfile.TemporaryDirectory(prefix="kaito-banner-frames-") as temp_root:
        frame_root = Path(temp_root)
        for item in ITEMS:
            frame_dir = frame_root / item["key"]
            frame_dir.mkdir(parents=True, exist_ok=True)
            file_name = f"{item['key']}.webm"
            output_path = output_dir / file_name
            render_animation(item, output_path, frame_dir, ffmpeg_path, args.size, args.duration, args.fps, args.crf)
            files.append({
                "key": item["key"],
                "text": item["text"],
                "emoji": item["emoji"],
                "fileName": file_name,
                "outputPath": str(output_path),
            })

    if args.preview:
        render_preview_sheet(ITEMS, Path(args.preview), args.size)

    result = {
        "ok": True,
        "outputDir": str(output_dir),
        "previewPath": str(Path(args.preview)) if args.preview else "",
        "generated": len(files),
        "files": files,
    }
    if args.manifest:
        manifest_path = Path(args.manifest)
        manifest_path.parent.mkdir(parents=True, exist_ok=True)
        manifest_path.write_text(json.dumps(result, indent=2), encoding="utf-8")
    print(json.dumps(result, indent=2))


if __name__ == "__main__":
    main()
