import argparse
import json
import math
import os
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

from PIL import Image, ImageChops, ImageDraw, ImageEnhance, ImageFilter, ImageOps

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")
if hasattr(sys.stderr, "reconfigure"):
    sys.stderr.reconfigure(encoding="utf-8")


MENU_ITEMS = [
    {"key": "products", "label": "San pham", "emoji": "🛒", "effect": "shake", "color": "#facc15"},
    {"key": "topup", "label": "Nap tien", "emoji": "💳", "effect": "pulse-glow", "color": "#22c55e"},
    {"key": "account", "label": "Tai khoan", "emoji": "👤", "effect": "blink", "color": "#22d3ee"},
    {"key": "orders", "label": "Don hang", "emoji": "📦", "effect": "pop", "color": "#fb923c"},
    {"key": "language", "label": "Doi ngon ngu", "emoji": "🌐", "effect": "rotate", "color": "#a855f7"},
    {"key": "support", "label": "Ho tro", "emoji": "🎧", "effect": "neon-flicker", "color": "#f472b6"},
    {"key": "security", "label": "Bao mat", "emoji": "🛡️", "effect": "sweep-glow", "color": "#38bdf8"},
    {"key": "instant-delivery", "label": "Giao hang tuc thi", "emoji": "⚡", "effect": "flash", "color": "#facc15"},
    {"key": "automation-247", "label": "Tu dong 24/7", "emoji": "🔄", "effect": "trail-rotate", "color": "#22c55e"},
    {"key": "quality", "label": "Chat luong uy tin", "emoji": "⭐", "effect": "soft-pulse", "color": "#facc15"},
    {"key": "member", "label": "Thanh vien", "emoji": "👑", "effect": "neon-glow", "color": "#facc15"},
    {"key": "offers", "label": "Uu dai", "emoji": "🎁", "effect": "open-scale", "color": "#d946ef"},
    {"key": "notifications", "label": "Thong bao", "emoji": "📣", "effect": "alert-shake", "color": "#ef4444"},
    {"key": "promotions", "label": "Khuyen mai", "emoji": "🎫", "effect": "slide-glow", "color": "#22d3ee"},
    {"key": "reviews", "label": "Danh gia", "emoji": "✨", "effect": "sparkle", "color": "#f472b6"},
    {"key": "academy", "label": "Hoc vien", "emoji": "🎓", "effect": "drop-glow", "color": "#84cc16"},
    {"key": "news", "label": "Tin tuc", "emoji": "📄", "effect": "scroll-fade", "color": "#f59e0b"},
    {"key": "events", "label": "Su kien", "emoji": "🎮", "effect": "pop-glow", "color": "#8b5cf6"},
    {"key": "policy", "label": "Chinh sach", "emoji": "🛡️", "effect": "sweep-glow", "color": "#22d3ee"},
    {"key": "logout", "label": "Dang xuat", "emoji": "⏻", "effect": "power-fade", "color": "#ef4444"},
]


def parse_args():
    parser = argparse.ArgumentParser(description="Generate neon Telegram menu custom emoji videos from a source image.")
    parser.add_argument("--source", required=True)
    parser.add_argument("--output", required=True)
    parser.add_argument("--crops", required=True)
    parser.add_argument("--manifest", default="")
    parser.add_argument("--size", type=int, default=100)
    parser.add_argument("--duration", type=float, default=2.0)
    parser.add_argument("--fps", type=int, default=24)
    parser.add_argument("--crf", type=int, default=54)
    parser.add_argument("--ffmpeg", default="")
    parser.add_argument("--keep-frames", action="store_true")
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


def tile_box(image_size, index):
    width, height = image_size
    col = index % 5
    row = index // 5
    return (
        round(width * col / 5),
        round(height * row / 4),
        round(width * (col + 1) / 5),
        round(height * (row + 1) / 4),
    )


def saturated_neon_pixel(pixel):
    r, g, b, a = pixel
    if a < 24:
        return False
    maxv = max(r, g, b)
    minv = min(r, g, b)
    if maxv < 58:
        return False
    saturation = (maxv - minv) / maxv if maxv else 0
    return saturation > 0.16


def detect_icon_box(image, rough_box):
    left, top, right, bottom = rough_box
    tile = image.crop(rough_box).convert("RGBA")
    width, height = tile.size
    x_min_limit = int(width * 0.06)
    x_max_limit = width - int(width * 0.06)
    y_min_limit = int(height * 0.10)
    y_max_limit = int(height * 0.86)

    mask = set()
    pixels = tile.load()
    for y in range(y_min_limit, y_max_limit):
        for x in range(x_min_limit, x_max_limit):
            if saturated_neon_pixel(pixels[x, y]):
                mask.add((x, y))

    components = connected_components(mask)
    components = [component for component in components if component["area"] >= 20 and not is_likely_card_frame(component)]
    if not components:
        components = connected_components(mask)

    if not components:
        # Fallback still avoids fixed final crops: it uses an inset search area
        # inside the card instead of returning the whole grid cell.
        return (
            left + int(width * 0.18),
            top + int(height * 0.16),
            left + int(width * 0.82),
            top + int(height * 0.70),
        )

    largest = max(components, key=lambda component: component["area"])
    minimum_area = max(16, int(largest["area"] * 0.018))
    kept = []
    largest_center = ((largest["x0"] + largest["x1"]) / 2, (largest["y0"] + largest["y1"]) / 2)
    max_distance = min(width, height) * 0.34
    for component in components:
        center = ((component["x0"] + component["x1"]) / 2, (component["y0"] + component["y1"]) / 2)
        distance = math.hypot(center[0] - largest_center[0], center[1] - largest_center[1])
        if component["area"] >= minimum_area and distance <= max_distance:
            kept.append(component)

    if not kept:
        kept = [largest]

    xs = []
    ys = []
    for component in kept:
        xs.extend([component["x0"], component["x1"]])
        ys.extend([component["y0"], component["y1"]])

    x0, x1 = percentile(xs, 0.005), percentile(xs, 0.995)
    y0, y1 = percentile(ys, 0.005), percentile(ys, 0.995)
    pad = max(8, int(max(x1 - x0, y1 - y0) * 0.12))
    x0 = max(x_min_limit, x0 - pad)
    y0 = max(y_min_limit, y0 - pad)
    x1 = min(x_max_limit, x1 + pad)
    y1 = min(y_max_limit, y1 + pad)

    return (
        left + max(0, int(round(x0))),
        top + max(0, int(round(y0))),
        left + min(width, int(round(x1))),
        top + min(height, int(round(y1))),
    )


def connected_components(mask):
    pending = set(mask)
    components = []
    while pending:
        start = pending.pop()
        stack = [start]
        xs = []
        ys = []
        area = 0
        while stack:
            x, y = stack.pop()
            xs.append(x)
            ys.append(y)
            area += 1
            for neighbor in ((x - 1, y), (x + 1, y), (x, y - 1), (x, y + 1)):
                if neighbor in pending:
                    pending.remove(neighbor)
                    stack.append(neighbor)
        components.append(
            {
                "x0": min(xs),
                "x1": max(xs),
                "y0": min(ys),
                "y1": max(ys),
                "area": area,
            }
        )
    return components


def is_likely_card_frame(component):
    width = max(1, component["x1"] - component["x0"] + 1)
    height = max(1, component["y1"] - component["y0"] + 1)
    thin = width > height * 6 or height > width * 6
    return thin and component["area"] < 900


def percentile(values, fraction):
    if not values:
        return 0
    sorted_values = sorted(values)
    index = max(0, min(len(sorted_values) - 1, int(round((len(sorted_values) - 1) * fraction))))
    return sorted_values[index]


def extract_transparent_icon(image, box, size):
    crop = image.crop(box).convert("RGBA")
    crop = ImageOps.contain(crop, (size, size), Image.Resampling.LANCZOS)
    canvas = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    canvas.alpha_composite(crop, ((size - crop.width) // 2, (size - crop.height) // 2))

    pixels = canvas.load()
    for y in range(size):
        for x in range(size):
            r, g, b, a = pixels[x, y]
            maxv = max(r, g, b)
            minv = min(r, g, b)
            saturation = (maxv - minv) / maxv if maxv else 0
            if maxv < 22 or saturation < 0.10:
                pixels[x, y] = (r, g, b, 0)
                continue
            new_alpha = int(max(0, min(255, (maxv - 18) * 2.7)))
            if maxv < 85:
                new_alpha = int(new_alpha * max(0.25, saturation))
            pixels[x, y] = (r, g, b, min(a, new_alpha))

    alpha = canvas.getchannel("A").filter(ImageFilter.GaussianBlur(0.25))
    canvas.putalpha(alpha)
    remove_edge_artifacts(canvas)
    canvas = normalize_icon_canvas(canvas, size)
    remove_edge_artifacts(canvas)
    return canvas


def normalize_icon_canvas(image, size):
    bbox = image.getchannel("A").point(lambda value: 255 if value > 12 else 0).getbbox()
    if not bbox:
        return image

    padding = max(6, size // 14)
    target = max(1, size - padding * 2)
    content = image.crop(bbox)
    content = ImageOps.contain(content, (target, target), Image.Resampling.LANCZOS)

    canvas = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    canvas.alpha_composite(content, ((size - content.width) // 2, (size - content.height) // 2))
    return canvas


def remove_edge_artifacts(image):
    edge_margin = max(2, image.width // 50)
    image_pixels = image.load()
    for y in range(image.height):
        for x in range(image.width):
            if x < edge_margin or y < edge_margin or x >= image.width - edge_margin or y >= image.height - edge_margin:
                r, g, b, _ = image_pixels[x, y]
                image_pixels[x, y] = (r, g, b, 0)

    alpha = image.getchannel("A")
    pixels = alpha.load()
    mask = set()
    for y in range(image.height):
        for x in range(image.width):
            if pixels[x, y] > 18:
                mask.add((x, y))

    components = connected_components(mask)
    if not components:
        return

    largest_area = max(component["area"] for component in components)
    remove = set()
    for component in components:
        touches_edge = (
            component["x0"] <= 1
            or component["y0"] <= 1
            or component["x1"] >= image.width - 2
            or component["y1"] >= image.height - 2
        )
        width = max(1, component["x1"] - component["x0"] + 1)
        height = max(1, component["y1"] - component["y0"] + 1)
        thin = width > height * 5 or height > width * 5
        if component["area"] < largest_area * 0.10 and (touches_edge or thin or component["area"] < 12):
            for y in range(component["y0"], component["y1"] + 1):
                for x in range(component["x0"], component["x1"] + 1):
                    if (x, y) in mask:
                        remove.add((x, y))

    for x, y in remove:
        r, g, b, _ = image_pixels[x, y]
        image_pixels[x, y] = (r, g, b, 0)


def hex_to_rgb(value):
    raw = value.strip().lstrip("#")
    return tuple(int(raw[index:index + 2], 16) for index in (0, 2, 4))


def transformed(icon, size, scale=1.0, angle=0.0, alpha=1.0):
    target = max(1, int(round(size * scale)))
    resized = icon.resize((target, target), Image.Resampling.LANCZOS)
    if angle:
        resized = resized.rotate(angle, resample=Image.Resampling.BICUBIC, expand=True)
    if alpha < 0.999:
        a = resized.getchannel("A").point(lambda p: int(p * alpha))
        resized.putalpha(a)
    return resized


def paste_center(base, layer, dx=0, dy=0):
    x = (base.width - layer.width) // 2 + int(round(dx))
    y = (base.height - layer.height) // 2 + int(round(dy))
    base.alpha_composite(layer, (x, y))


def glow_layer(icon, color, blur=8, alpha=0.75):
    mask = icon.getchannel("A").filter(ImageFilter.GaussianBlur(blur))
    mask = ImageEnhance.Brightness(mask).enhance(alpha)
    glow = Image.new("RGBA", icon.size, (*color, 0))
    glow.putalpha(mask)
    return glow


def add_sweep(frame, icon, color, progress):
    width, height = frame.size
    sweep = Image.new("RGBA", frame.size, (0, 0, 0, 0))
    draw = ImageDraw.Draw(sweep)
    x = int(-width * 0.35 + progress * width * 1.7)
    draw.polygon(
        [(x, 0), (x + 15, 0), (x - 15, height), (x - 30, height)],
        fill=(*color, 115),
    )
    mask = icon.getchannel("A").filter(ImageFilter.GaussianBlur(1))
    clipped = Image.new("RGBA", frame.size, (0, 0, 0, 0))
    clipped.putalpha(mask)
    sweep.putalpha(ImageChops.multiply(sweep.getchannel("A"), clipped.getchannel("A")))
    frame.alpha_composite(sweep)


def add_sparkles(frame, color, t, count=5):
    draw = ImageDraw.Draw(frame)
    for index in range(count):
        phase = (t * 1.7 + index * 0.21) % 1
        radius = 1 + int(phase * 3)
        x = int((17 + index * 19 + math.sin(phase * math.tau) * 8) % frame.width)
        y = int((18 + index * 13 + math.cos(phase * math.tau) * 10) % frame.height)
        alpha = int(170 * (1 - abs(phase - 0.5) * 1.7))
        if alpha <= 0:
            continue
        draw.line((x - radius, y, x + radius, y), fill=(*color, alpha), width=1)
        draw.line((x, y - radius, x, y + radius), fill=(*color, alpha), width=1)


def triangle_wave(value):
    phase = value % 1
    return max(0, 1 - abs(phase - 0.5) * 2)


def add_pulse_ring(frame, color, t, radius_min=25, radius_max=48, phase_offset=0, alpha=95):
    width, height = frame.size
    cx, cy = width / 2, height / 2
    phase = (t + phase_offset) % 1
    radius = radius_min + (radius_max - radius_min) * phase
    strength = max(0.0, 1 - phase)
    if strength <= 0:
        return
    draw = ImageDraw.Draw(frame)
    box = (cx - radius, cy - radius, cx + radius, cy + radius)
    draw.ellipse(box, outline=(*color, int(alpha * strength)), width=2)


def add_speed_lines(frame, color, t, count=4, direction=1):
    draw = ImageDraw.Draw(frame)
    width, height = frame.size
    for index in range(count):
        phase = (t * 1.7 + index / count) % 1
        y = 26 + index * (height - 50) / max(1, count - 1)
        length = 16 + 10 * triangle_wave(phase)
        alpha = int(90 * (1 - phase))
        if alpha <= 0:
            continue
        if direction >= 0:
            x1 = -14 + phase * (width + 28)
            x2 = x1 + length
        else:
            x2 = width + 14 - phase * (width + 28)
            x1 = x2 - length
        draw.line((x1, y, x2, y - 2), fill=(*color, alpha), width=2)


def add_radial_burst(frame, color, t, count=10, radius_min=26, radius_max=48, alpha=80):
    draw = ImageDraw.Draw(frame)
    cx, cy = frame.width / 2, frame.height / 2
    pulse = triangle_wave(t)
    for index in range(count):
        angle = math.tau * (index / count + t * 0.12)
        inner = radius_min + 3 * pulse
        outer = radius_max - 4 * (1 - pulse)
        x0 = cx + math.cos(angle) * inner
        y0 = cy + math.sin(angle) * inner
        x1 = cx + math.cos(angle) * outer
        y1 = cy + math.sin(angle) * outer
        draw.line((x0, y0, x1, y1), fill=(*color, int(alpha * pulse)), width=1)


def add_orbit_dots(frame, color, t, count=4, radius=42, dot_radius=2):
    draw = ImageDraw.Draw(frame)
    cx, cy = frame.width / 2, frame.height / 2
    for index in range(count):
        phase = (t + index / count) % 1
        angle = math.tau * phase
        x = cx + math.cos(angle) * radius
        y = cy + math.sin(angle) * radius
        alpha = int(55 + 90 * triangle_wave(phase))
        r = dot_radius + triangle_wave(phase)
        draw.ellipse((x - r, y - r, x + r, y + r), fill=(*color, alpha))


def add_sound_waves(frame, color, t, side="both"):
    draw = ImageDraw.Draw(frame)
    cy = frame.height / 2
    pulse = triangle_wave(t * 1.2)
    for index in range(3):
        radius = 16 + index * 8 + pulse * 5
        alpha = int((90 - index * 16) * pulse)
        if alpha <= 0:
            continue
        if side in ("left", "both"):
            box = (12 - radius / 2, cy - radius, 12 + radius / 2, cy + radius)
            draw.arc(box, start=-70, end=70, fill=(*color, alpha), width=2)
        if side in ("right", "both"):
            box = (frame.width - 12 - radius / 2, cy - radius, frame.width - 12 + radius / 2, cy + radius)
            draw.arc(box, start=110, end=250, fill=(*color, alpha), width=2)


def add_scan_lines(frame, color, t):
    draw = ImageDraw.Draw(frame)
    width, height = frame.size
    x = -width * 0.25 + (width * 1.5) * (t % 1)
    draw.line((x, 10, x + 26, height - 10), fill=(*color, 95), width=3)
    draw.line((x - 7, 10, x + 19, height - 10), fill=(*color, 45), width=1)


def add_corner_sparkles(frame, color, t, count=4):
    draw = ImageDraw.Draw(frame)
    anchors = ((18, 20), (82, 22), (20, 78), (80, 78), (50, 14), (50, 86))
    for index in range(count):
        x, y = anchors[index % len(anchors)]
        phase = (t * 1.5 + index * 0.23) % 1
        radius = 2 + int(3 * triangle_wave(phase))
        alpha = int(130 * triangle_wave(phase))
        if alpha <= 0:
            continue
        draw.line((x - radius, y, x + radius, y), fill=(*color, alpha), width=1)
        draw.line((x, y - radius, x, y + radius), fill=(*color, alpha), width=1)


def add_ambient_effect(frame, effect, color, t, pulse):
    if effect == "shake":
        add_speed_lines(frame, color, t, count=5, direction=1)
    elif effect == "pulse-glow":
        add_pulse_ring(frame, color, t, phase_offset=0, alpha=110)
        add_pulse_ring(frame, color, t, phase_offset=0.45, alpha=70)
    elif effect == "blink":
        add_pulse_ring(frame, color, t, radius_min=18, radius_max=42, alpha=65)
        add_scan_lines(frame, color, (t * 0.8) % 1)
    elif effect == "pop":
        add_radial_burst(frame, color, t, count=9, alpha=95)
    elif effect == "rotate":
        add_orbit_dots(frame, color, t, count=5, radius=41, dot_radius=2)
    elif effect == "neon-flicker":
        add_sound_waves(frame, color, t, side="both")
        add_corner_sparkles(frame, color, t, count=3)
    elif effect == "sweep-glow":
        add_scan_lines(frame, color, t)
        add_pulse_ring(frame, color, t, radius_min=30, radius_max=45, alpha=45)
    elif effect == "flash":
        add_speed_lines(frame, color, t * 2, count=5, direction=-1)
        add_radial_burst(frame, color, t * 1.4, count=7, alpha=110)
    elif effect == "trail-rotate":
        add_orbit_dots(frame, color, t, count=6, radius=43, dot_radius=2)
        add_pulse_ring(frame, color, t, radius_min=32, radius_max=47, alpha=55)
    elif effect == "soft-pulse":
        add_pulse_ring(frame, color, t, radius_min=28, radius_max=46, alpha=72)
        add_corner_sparkles(frame, color, t, count=3)
    elif effect == "neon-glow":
        add_radial_burst(frame, color, t, count=8, alpha=70)
        add_pulse_ring(frame, color, t, radius_min=31, radius_max=48, alpha=80)
    elif effect == "open-scale":
        add_corner_sparkles(frame, color, t, count=6)
        add_radial_burst(frame, color, t, count=6, alpha=65)
    elif effect == "alert-shake":
        add_sound_waves(frame, color, t, side="right")
        add_speed_lines(frame, color, t, count=3, direction=1)
    elif effect == "slide-glow":
        add_speed_lines(frame, color, t, count=4, direction=1)
        add_scan_lines(frame, color, (t + 0.2) % 1)
    elif effect == "sparkle":
        add_corner_sparkles(frame, color, t, count=6)
    elif effect == "drop-glow":
        add_pulse_ring(frame, color, (t + 0.35) % 1, radius_min=24, radius_max=43, alpha=60)
        add_speed_lines(frame, color, t, count=3, direction=-1)
    elif effect == "scroll-fade":
        add_scan_lines(frame, color, t)
        add_speed_lines(frame, color, t * 0.7, count=3, direction=1)
    elif effect == "pop-glow":
        add_radial_burst(frame, color, t, count=10, alpha=95)
        add_orbit_dots(frame, color, t, count=4, radius=40, dot_radius=2)
    elif effect == "power-fade":
        add_pulse_ring(frame, color, t, radius_min=24, radius_max=46, alpha=100)
        add_radial_burst(frame, color, t, count=6, alpha=55)


def frame_for_effect(icon, item, frame_index, total_frames, size):
    t = frame_index / total_frames
    wave = math.sin(math.tau * t)
    pulse = (wave + 1) / 2
    color = hex_to_rgb(item["color"])
    effect = item["effect"]
    frame = Image.new("RGBA", (size, size), (0, 0, 0, 0))

    scale = 0.86
    angle = 0
    alpha = 1
    dx = 0
    dy = 0
    glow_alpha = 0.65 + 0.45 * pulse
    blur = 8

    if effect == "shake":
        dx = math.sin(math.tau * t * 8) * 2.6
        angle = math.sin(math.tau * t * 8) * 2.2
    elif effect == "pulse-glow":
        scale += 0.055 * pulse
        glow_alpha = 0.85 + 0.55 * pulse
    elif effect == "blink":
        alpha = 0.70 + 0.30 * pulse
        scale += 0.025 * pulse
    elif effect == "pop":
        scale += 0.10 * max(0, wave)
    elif effect == "rotate":
        angle = 360 * t
        scale = 0.80
    elif effect == "neon-flicker":
        flicker = 0.55 + 0.45 * ((math.sin(math.tau * t * 11) + math.sin(math.tau * t * 17)) > 0)
        alpha = 0.78 + flicker * 0.22
        glow_alpha = 0.35 + flicker * 0.95
    elif effect == "sweep-glow":
        scale += 0.025 * pulse
    elif effect == "flash":
        flash = 1 if (t % 0.33) < 0.09 else 0
        scale += 0.07 * flash
        glow_alpha = 0.75 + 0.75 * flash
        alpha = 0.88 + 0.12 * flash
    elif effect == "trail-rotate":
        angle = 360 * t
        scale = 0.80
        for step in (3, 2, 1):
            ghost = transformed(icon.copy(), size, scale, angle - step * 18, alpha=0.10 * step)
            paste_center(frame, glow_layer(ghost, color, blur=5, alpha=0.5), 0, 0)
    elif effect == "soft-pulse":
        scale += 0.04 * pulse
        glow_alpha = 0.70 + 0.45 * pulse
    elif effect == "neon-glow":
        scale += 0.035 * pulse
        blur = 10 + int(3 * pulse)
        glow_alpha = 0.85 + 0.65 * pulse
    elif effect == "open-scale":
        scale = 0.76 + 0.14 * min(1, pulse * 1.35)
        dy = -2 * pulse
    elif effect == "alert-shake":
        dx = math.sin(math.tau * t * 10) * 3.2
        angle = math.sin(math.tau * t * 10) * 3.0
        glow_alpha = 0.8 + 0.5 * pulse
    elif effect == "slide-glow":
        dx = -7 * math.cos(math.tau * t)
        scale += 0.025 * pulse
    elif effect == "sparkle":
        scale += 0.04 * pulse
        glow_alpha = 0.8 + 0.5 * pulse
    elif effect == "drop-glow":
        dy = -6 * abs(math.sin(math.tau * t))
        scale += 0.025 * pulse
    elif effect == "scroll-fade":
        dy = -4 * math.sin(math.tau * t)
        alpha = 0.82 + 0.18 * pulse
    elif effect == "pop-glow":
        scale += 0.09 * max(0, wave)
        glow_alpha = 0.75 + 0.55 * pulse
    elif effect == "power-fade":
        alpha = 0.66 + 0.34 * pulse
        scale += 0.035 * pulse
        glow_alpha = 0.75 + 0.65 * pulse

    add_ambient_effect(frame, effect, color, t, pulse)

    layer = transformed(icon.copy(), size, scale, angle, alpha)
    paste_center(frame, glow_layer(layer, color, blur=blur, alpha=glow_alpha), dx, dy)
    paste_center(frame, layer, dx, dy)

    if effect == "sweep-glow":
        add_sweep(frame, icon, color, t)
    if effect in ("sparkle", "reviews", "pop-glow"):
        add_sparkles(frame, color, t)
    if effect in ("flash", "alert-shake", "neon-flicker"):
        add_sparkles(frame, color, t, count=3)

    return frame


def render_animation(icon, item, output_path, frame_dir, ffmpeg_path, size, duration, fps, crf):
    total_frames = max(2, int(round(duration * fps)))
    for frame_index in range(total_frames):
        frame = frame_for_effect(icon, item, frame_index, total_frames, size)
        frame.save(frame_dir / f"frame_{frame_index:04d}.png")

    command = [
        ffmpeg_path,
        "-y",
        "-framerate",
        str(fps),
        "-i",
        str(frame_dir / "frame_%04d.png"),
        "-an",
        "-c:v",
        "libvpx-vp9",
        "-b:v",
        "0",
        "-crf",
        str(crf),
        "-pix_fmt",
        "yuva420p",
        "-auto-alt-ref",
        "0",
        str(output_path),
    ]
    result = subprocess.run(command, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
    if result.returncode != 0:
        raise RuntimeError(f"ffmpeg failed for {output_path.name}: {result.stderr.strip()}")


def main():
    args = parse_args()
    source_path = Path(args.source)
    output_dir = Path(args.output)
    crop_dir = Path(args.crops)
    manifest_path = Path(args.manifest) if args.manifest else None
    output_dir.mkdir(parents=True, exist_ok=True)
    crop_dir.mkdir(parents=True, exist_ok=True)
    if manifest_path:
        manifest_path.parent.mkdir(parents=True, exist_ok=True)

    image = Image.open(source_path).convert("RGBA")
    ffmpeg_path = resolve_ffmpeg(args.ffmpeg)
    files = []

    for index, item in enumerate(MENU_ITEMS):
        rough = tile_box(image.size, index)
        precise = detect_icon_box(image, rough)
        icon = extract_transparent_icon(image, precise, args.size)
        crop_name = f"{item['key']}.png"
        motion_name = f"{item['key']}.webm"
        crop_path = crop_dir / crop_name
        motion_path = output_dir / motion_name
        icon.save(crop_path)

        frame_parent = Path(tempfile.mkdtemp(prefix=f"kaito-{item['key']}-frames-"))
        try:
            render_animation(icon, item, motion_path, frame_parent, ffmpeg_path, args.size, args.duration, args.fps, args.crf)
            if args.keep_frames:
                keep_dir = crop_dir / f"{item['key']}-frames"
                if keep_dir.exists():
                    shutil.rmtree(keep_dir)
                shutil.move(str(frame_parent), str(keep_dir))
                frame_parent = None
        finally:
            if frame_parent and frame_parent.exists():
                shutil.rmtree(frame_parent, ignore_errors=True)

        files.append(
            {
                "key": item["key"],
                "label": item["label"],
                "emoji": item["emoji"],
                "effect": item["effect"],
                "color": item["color"],
                "roughBox": list(rough),
                "cropBox": list(precise),
                "cropName": crop_name,
                "cropPath": str(crop_path),
                "motionName": motion_name,
                "motionPath": str(motion_path),
            }
        )

    result = {
        "ok": True,
        "sourceImage": str(source_path),
        "outputDir": str(output_dir),
        "cropDir": str(crop_dir),
        "generated": len(files),
        "files": files,
    }

    if manifest_path:
        manifest_path.write_text(json.dumps(result, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

    print(json.dumps(result, ensure_ascii=True, indent=2))


if __name__ == "__main__":
    try:
        main()
    except Exception as exc:
        print(str(exc), file=sys.stderr)
        sys.exit(1)
