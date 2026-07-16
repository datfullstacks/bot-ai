import argparse
import json
import math
import os
import shutil
import subprocess
import tempfile
from pathlib import Path

from PIL import Image

from telegram_slogan_tile_effects import effect_preview_slogans, render_slogan_tile_frame


SLOGANS = [
    {
        "key": "daily_update",
        "text": "DAILY UPDATE",
        "fallbackText": "\U0001F3AB DAILY UPDATE \U0001F3AB",
        "emoji": "\U0001F3AB",
        "tileCount": 6,
        "color": (249, 115, 22),
        "accent": (251, 146, 60),
        "effect": "marquee_text",
    }
]


def parse_args():
    parser = argparse.ArgumentParser(description="Generate KAITO Telegram slogan tile custom emoji videos.")
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



def render_slogan_frame(slogan, size, frame_index, total_frames):
    return render_slogan_tile_frame(slogan, size, frame_index, total_frames)


def encode_tile(frame_dir, output_path, ffmpeg_path, fps, crf):
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


def render_slogan(slogan, output_dir, frame_root, ffmpeg_path, size, duration, fps, crf):
    total_frames = max(1, int(duration * fps))
    tile_dirs = []
    for index in range(slogan["tileCount"]):
        tile_dir = frame_root / f"{slogan['key']}_{index:02d}"
        tile_dir.mkdir(parents=True, exist_ok=True)
        tile_dirs.append(tile_dir)

    for frame_index in range(total_frames):
        frame = render_slogan_frame(slogan, size, frame_index, total_frames)
        for index, tile_dir in enumerate(tile_dirs):
            crop = frame.crop((index * size, 0, (index + 1) * size, size))
            crop.save(tile_dir / f"frame_{frame_index:04d}.png")

    tiles = []
    for index, tile_dir in enumerate(tile_dirs):
        key = f"{slogan['key']}_{index:02d}"
        file_name = f"{key}.webm"
        output_path = output_dir / file_name
        encode_tile(tile_dir, output_path, ffmpeg_path, fps, crf)
        tiles.append({
            "index": index,
            "key": key,
            "emoji": slogan["emoji"],
            "fileName": file_name,
            "outputPath": str(output_path),
        })
    return tiles


def render_preview(slogans, preview_path, size):
    padding = 10
    preview_slogans = effect_preview_slogans(slogans)
    width = max(slogan["tileCount"] * size for slogan in preview_slogans) + padding * 2
    height = len(preview_slogans) * (size + padding) + padding
    sheet = Image.new("RGBA", (width, height), (15, 23, 42, 255))
    for index, slogan in enumerate(preview_slogans):
        banner = render_slogan_frame(slogan, size, 0, 1)
        sheet.alpha_composite(banner, (padding, padding + index * (size + padding)))
    preview_path.parent.mkdir(parents=True, exist_ok=True)
    sheet.convert("RGB").save(preview_path)


def main():
    args = parse_args()
    output_dir = Path(args.output)
    output_dir.mkdir(parents=True, exist_ok=True)
    ffmpeg_path = resolve_ffmpeg(args.ffmpeg)

    files = []
    slogans = {}
    with tempfile.TemporaryDirectory(prefix="kaito-slogan-tile-frames-") as temp_root:
        frame_root = Path(temp_root)
        for slogan in SLOGANS:
            tiles = render_slogan(slogan, output_dir, frame_root, ffmpeg_path, args.size, args.duration, args.fps, args.crf)
            placeholder = "".join(tile["emoji"] for tile in tiles)
            slogans[slogan["key"]] = {
                "key": slogan["key"],
                "text": slogan["text"],
                "fallbackText": slogan["fallbackText"],
                "emoji": slogan["emoji"],
                "effect": slogan.get("effect", "premium_scan"),
                "placeholder": placeholder,
                "tiles": tiles,
            }
            for tile in tiles:
                files.append({
                    "sloganKey": slogan["key"],
                    **tile,
                })

    if args.preview:
        render_preview(SLOGANS, Path(args.preview), args.size)

    result = {
        "ok": True,
        "outputDir": str(output_dir),
        "previewPath": str(Path(args.preview)) if args.preview else "",
        "generated": len(files),
        "slogans": slogans,
        "files": files,
    }
    if args.manifest:
        manifest_path = Path(args.manifest)
        manifest_path.parent.mkdir(parents=True, exist_ok=True)
        manifest_path.write_text(json.dumps(result, indent=2), encoding="utf-8")
    print(json.dumps(result, indent=2))


if __name__ == "__main__":
    main()
