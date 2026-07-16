import math
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter, ImageFont


FONT_CANDIDATES = [
    Path("C:/Windows/Fonts/impact.ttf"),
    Path("C:/Windows/Fonts/bahnschrift.ttf"),
    Path("C:/Windows/Fonts/arialbd.ttf"),
    Path("/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"),
]

EFFECT_PRESETS = {
    "premium_scan": {
        "panel": (9, 15, 32, 250),
        "text": (255, 230, 202, 255),
        "stroke_width": 3,
        "glow": 0.85,
        "scan": "wide",
        "ticket_motion": "float",
        "bottom_line": True,
        "text_side_padding": 236,
        "text_max_height": 70,
    },
    "ticket_pop": {
        "panel": (12, 20, 35, 252),
        "text": (255, 234, 214, 255),
        "stroke_width": 3,
        "glow": 0.95,
        "scan": "spark",
        "ticket_motion": "pop",
        "bottom_line": True,
        "text_side_padding": 238,
        "text_max_height": 69,
    },
    "neon_flicker": {
        "panel": (10, 12, 29, 248),
        "text": (255, 238, 222, 255),
        "stroke_width": 3,
        "glow": 1.15,
        "scan": "none",
        "ticket_motion": "float",
        "bottom_line": False,
        "text_side_padding": 236,
        "text_max_height": 70,
    },
    "pixel_slide": {
        "panel": (8, 16, 31, 250),
        "text": (255, 229, 195, 255),
        "stroke_width": 3,
        "glow": 0.9,
        "scan": "pixel",
        "ticket_motion": "slide",
        "bottom_line": True,
        "text_side_padding": 236,
        "text_max_height": 70,
    },
    "marquee_text": {
        "panel": (7, 13, 27, 252),
        "text": (255, 235, 207, 255),
        "stroke_width": 3,
        "glow": 1.0,
        "scan": "marquee",
        "ticket_motion": "float",
        "title_motion": "marquee",
        "bottom_line": True,
        "text_side_padding": 150,
        "text_max_height": 72,
        "marquee_gap": 92,
    },
    "clean_static_motion": {
        "panel": (12, 18, 33, 245),
        "text": (255, 224, 190, 255),
        "stroke_width": 3,
        "glow": 0.55,
        "scan": "none",
        "ticket_motion": "still",
        "bottom_line": True,
        "text_side_padding": 236,
        "text_max_height": 70,
    },
}


def effect_names():
    return tuple(EFFECT_PRESETS.keys())


def effect_preview_slogans(slogans):
    if not slogans:
        return []
    base = slogans[0]
    return [{**base, "effect": name} for name in effect_names()]


def render_slogan_tile_frame(slogan, size, frame_index, total_frames):
    width = slogan["tileCount"] * size
    height = size
    t = frame_index / max(total_frames - 1, 1)
    wave = math.sin(math.tau * t)
    pulse = (wave + 1) / 2
    color = tuple(slogan["color"])
    accent = tuple(slogan["accent"])
    effect_name = slogan.get("effect") or "premium_scan"
    effect = EFFECT_PRESETS.get(effect_name, EFFECT_PRESETS["premium_scan"])

    image = Image.new("RGBA", (width, height), (0, 0, 0, 0))
    draw = ImageDraw.Draw(image)
    band = (2, 2, width - 2, size - 2)

    draw_panel(image, draw, band, color, accent, effect, t, pulse)
    draw_effect_background(image, draw, band, color, accent, effect, t, pulse)
    draw_tickets(image, width, size, color, accent, effect, t, wave, pulse)
    draw_title(image, draw, band, slogan["text"], width, height, color, accent, effect, t, wave, pulse)
    return image


def draw_panel(image, draw, band, color, accent, effect, t, pulse):
    glow = Image.new("RGBA", image.size, (0, 0, 0, 0))
    glow_draw = ImageDraw.Draw(glow)
    glow_alpha = int(64 + 34 * effect["glow"] + 24 * pulse)
    glow_draw.rounded_rectangle((band[0] - 4, band[1] - 4, band[2] + 4, band[3] + 4), radius=20, fill=(*color, glow_alpha))
    image.alpha_composite(glow.filter(ImageFilter.GaussianBlur(6)))

    outline_alpha = int(220 + 25 * pulse)
    draw.rounded_rectangle(band, radius=18, fill=effect["panel"], outline=(*accent, outline_alpha), width=3)
    draw.rounded_rectangle((band[0] + 4, band[1] + 4, band[2] - 4, band[3] - 4), radius=14, outline=(*color, 115), width=1)
    if effect["bottom_line"]:
        draw.line((18, band[3] - 8, image.width - 18, band[3] - 8), fill=(*color, 170), width=3)


def draw_effect_background(image, draw, band, color, accent, effect, t, pulse):
    mode = effect["scan"]
    if mode == "wide":
        x = int(-40 + (image.width + 80) * t)
        draw.line((x, band[1] + 3, x - 46, band[3] - 3), fill=(255, 255, 255, 64), width=5)
        draw.line((x + 16, band[1] + 8, x - 26, band[3] - 8), fill=(*accent, 45), width=3)
    elif mode == "spark":
        x = int(16 + (image.width - 32) * t)
        draw.line((x, band[1] + 6, x - 22, band[3] - 6), fill=(255, 244, 220, 72), width=4)
        for index in range(8):
            phase = (t * 1.6 + index * 0.17) % 1
            dot_x = int(28 + phase * (image.width - 56))
            dot_y = 16 + (index * 13) % 68
            alpha = int(110 * triangle_wave(phase))
            draw.rectangle((dot_x, dot_y, dot_x + 3, dot_y + 3), fill=(*accent, alpha))
    elif mode == "pixel":
        tile = 8
        offset = int(t * tile * 2)
        for x in range(14 - offset, image.width - 14, tile * 2):
            draw.rectangle((x, band[1] + 8, x + 5, band[1] + 11), fill=(*accent, 115))
            draw.rectangle((image.width - x - 5, band[3] - 13, image.width - x, band[3] - 10), fill=(*color, 130))
        sweep_x = int(-20 + (image.width + 40) * t)
        draw.rectangle((sweep_x, band[1] + 14, sweep_x + 16, band[3] - 14), fill=(255, 255, 255, 32))
    elif mode == "marquee":
        rail_alpha = int(135 + 55 * pulse)
        draw.line((24, band[1] + 14, image.width - 24, band[1] + 14), fill=(*accent, rail_alpha), width=2)
        draw.line((24, band[3] - 14, image.width - 24, band[3] - 14), fill=(*color, rail_alpha), width=2)
        dash = 18
        offset = int(t * dash * 2)
        for x in range(32 - offset, image.width - 32, dash * 2):
            draw.rectangle((x, band[1] + 8, x + 8, band[1] + 11), fill=(*color, 150))
            draw.rectangle((image.width - x - 8, band[3] - 11, image.width - x, band[3] - 8), fill=(*accent, 150))
        shine_x = int((image.width + 120) * t) - 60
        draw.line((shine_x, band[1] + 8, shine_x - 28, band[3] - 8), fill=(255, 255, 255, 60), width=5)


def draw_tickets(image, width, size, color, accent, effect, t, wave, pulse):
    motion = effect["ticket_motion"]
    y = size // 2
    left_x = 65
    right_x = width - 65
    scale = 1.0
    left_angle = -13
    right_angle = 13

    if motion == "pop":
        scale = 1.0 + 0.07 * triangle_wave(t * 2)
        y += int(4 * wave)
        left_angle -= 3 * wave
        right_angle += 3 * wave
    elif motion == "slide":
        left_x += int(4 * math.sin(math.tau * t))
        right_x -= int(4 * math.sin(math.tau * t))
        y += int(2 * wave)
    elif motion == "float":
        y += int(2 * wave)

    draw_ticket(image, (left_x, y), size, color, accent, angle=left_angle, scale=scale)
    draw_ticket(image, (right_x, y), size, color, accent, angle=right_angle, scale=scale)


def draw_title(image, draw, band, text, width, height, color, accent, effect, t, wave, pulse):
    stroke_width = effect["stroke_width"]
    if effect.get("title_motion") == "marquee":
        draw_marquee_title(image, draw, text, width, height, color, effect, t, wave, pulse, stroke_width)
        return

    font = fit_font(text, width - effect["text_side_padding"], effect["text_max_height"], stroke_width=stroke_width)
    box = draw.textbbox((0, 0), text, font=font, stroke_width=stroke_width)
    text_width = box[2] - box[0]
    text_height = box[3] - box[1]
    x = (width - text_width) // 2
    y = (height - text_height) // 2 - 5

    flicker = 1.0
    if effect["scan"] == "none" and effect["glow"] > 1:
        flicker = 0.82 + 0.18 * (1 if math.sin(math.tau * pulse * 2.7) > -0.2 else 0.45)
    elif effect["ticket_motion"] != "still":
        y += int(1.2 * wave)

    for blur, alpha in [(7, int(82 * effect["glow"] * flicker)), (3, int(150 * effect["glow"] * flicker))]:
        layer = Image.new("RGBA", image.size, (0, 0, 0, 0))
        layer_draw = ImageDraw.Draw(layer)
        layer_draw.text((x, y), text, font=font, fill=(*color, alpha), stroke_width=stroke_width + 1, stroke_fill=(*color, alpha))
        image.alpha_composite(layer.filter(ImageFilter.GaussianBlur(blur)))

    draw.text((x, y), text, font=font, fill=effect["text"], stroke_width=stroke_width, stroke_fill=(*color, 255))


def draw_marquee_title(image, draw, text, width, height, color, effect, t, wave, pulse, stroke_width):
    font = fit_font(text, width + 160, effect["text_max_height"], stroke_width=stroke_width)
    box = draw.textbbox((0, 0), text, font=font, stroke_width=stroke_width)
    text_width = box[2] - box[0]
    text_height = box[3] - box[1]
    y = (height - text_height) // 2 - 5 + int(1.5 * wave)
    gap = max(effect.get("marquee_gap", 88), width // 7)
    span = text_width + gap
    scroll = int((span + width) * t)
    x = width - scroll
    while x > -span:
        x -= span

    positions = []
    while x < width + span:
        positions.append((x, y))
        x += span

    for blur, alpha in [(8, int(90 * effect["glow"])), (3, int(165 * effect["glow"]))]:
        layer = Image.new("RGBA", image.size, (0, 0, 0, 0))
        layer_draw = ImageDraw.Draw(layer)
        for position in positions:
            layer_draw.text(
                position,
                text,
                font=font,
                fill=(*color, alpha),
                stroke_width=stroke_width + 1,
                stroke_fill=(*color, alpha),
            )
        image.alpha_composite(layer.filter(ImageFilter.GaussianBlur(blur)))

    for position in positions:
        draw.text(position, text, font=font, fill=effect["text"], stroke_width=stroke_width, stroke_fill=(*color, 255))


def draw_ticket(image, center, size, color, accent, angle=0, scale=1.0):
    width = int(size * 0.58 * scale)
    height = int(size * 0.44 * scale)
    pad = 10
    ticket = Image.new("RGBA", (width + pad * 2, height + pad * 2), (0, 0, 0, 0))
    layer = ImageDraw.Draw(ticket)
    x = pad
    y = pad

    shadow = Image.new("RGBA", ticket.size, (0, 0, 0, 0))
    shadow_draw = ImageDraw.Draw(shadow)
    shadow_draw.rounded_rectangle((x + 1, y + 3, x + width + 1, y + height + 3), radius=7, fill=(0, 0, 0, 92))
    ticket.alpha_composite(shadow.filter(ImageFilter.GaussianBlur(2)))

    layer.rounded_rectangle((x, y, x + width, y + height), radius=7, fill=(*color, 248), outline=(255, 226, 188, 235), width=3)
    notch = max(4, int(height * 0.24))
    layer.ellipse((x - notch, y + height // 2 - notch, x + notch, y + height // 2 + notch), fill=(12, 18, 33, 255))
    layer.ellipse((x + width - notch, y + height // 2 - notch, x + width + notch, y + height // 2 + notch), fill=(12, 18, 33, 255))
    layer.line((x + width * 0.30, y + 5, x + width * 0.30, y + height - 5), fill=(255, 255, 255, 120), width=3)
    layer.rectangle((x + width * 0.46, y + height * 0.38, x + width * 0.84, y + height * 0.58), fill=(15, 23, 42, 145))
    layer.line((x + 5, y + height - 5, x + width - 5, y + height - 5), fill=(*accent, 180), width=3)

    rotated = ticket.rotate(angle, resample=Image.Resampling.BICUBIC, expand=True)
    left = int(center[0] - rotated.width / 2)
    top = int(center[1] - rotated.height / 2)
    image.alpha_composite(rotated, (left, top))


def fit_font(text, max_width, max_height, stroke_width=3):
    for size in range(70, 13, -1):
        font = pick_font(size)
        box = ImageDraw.Draw(Image.new("RGBA", (1, 1))).textbbox((0, 0), text, font=font, stroke_width=stroke_width)
        if box[2] - box[0] <= max_width and box[3] - box[1] <= max_height:
            return font
    return pick_font(14)


def pick_font(size):
    for path in FONT_CANDIDATES:
        if path.exists():
            return ImageFont.truetype(str(path), size=size)
    return ImageFont.load_default(size=size)


def triangle_wave(value):
    phase = value % 1
    return max(0, 1 - abs(phase - 0.5) * 2)
