import importlib.util
import json
from pathlib import Path

from PIL import ImageChops


def load_module(name, file_name):
    module_path = Path(__file__).with_name(file_name)
    spec = importlib.util.spec_from_file_location(name, module_path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


effects = load_module("telegram_slogan_tile_effects", "telegram_slogan_tile_effects.py")
assets = load_module("telegram_slogan_tile_assets", "telegram-slogan-tile-assets.py")

expected = {
    "premium_scan",
    "ticket_pop",
    "neon_flicker",
    "pixel_slide",
    "marquee_text",
    "clean_static_motion",
}

names = set(effects.effect_names())
missing = sorted(expected - names)
if missing:
    raise AssertionError(f"Missing slogan tile effect presets: {missing}")

slogan = {**assets.SLOGANS[0], "effect": "premium_scan"}
first = effects.render_slogan_tile_frame(slogan, 100, 0, 48)
middle = effects.render_slogan_tile_frame(slogan, 100, 24, 48)

if first.size != (600, 100):
    raise AssertionError(f"Expected full slogan frame size (600, 100), got {first.size}.")

diff_image = ImageChops.difference(first, middle)
diff = sum(value * count for value, count in enumerate(diff_image.histogram()))
if diff <= 20000:
    raise AssertionError("premium_scan should visibly animate across frames.")

marquee_slogan = {**assets.SLOGANS[0], "effect": "marquee_text"}
marquee_first = effects.render_slogan_tile_frame(marquee_slogan, 100, 0, 48)
marquee_middle = effects.render_slogan_tile_frame(marquee_slogan, 100, 24, 48)
marquee_diff_image = ImageChops.difference(marquee_first, marquee_middle)
marquee_diff = sum(value * count for value, count in enumerate(marquee_diff_image.histogram()))
if marquee_diff <= 50000:
    raise AssertionError("marquee_text should scroll the slogan text across frames.")

for name in sorted(expected):
    frame = effects.render_slogan_tile_frame({**assets.SLOGANS[0], "effect": name}, 100, 0, 48)
    alpha = frame.getchannel("A")
    solid_alpha = alpha.point(lambda value: 255 if value >= 180 else 0)
    bbox = solid_alpha.getbbox()
    if not bbox:
        raise AssertionError(f"{name} should render visible content.")
    visible_height = bbox[3] - bbox[1]
    if visible_height < 88:
        raise AssertionError(f"{name} should use at least 88px of height, got {visible_height}px.")

preview_slogans = effects.effect_preview_slogans([assets.SLOGANS[0]])
preview_effects = [item["effect"] for item in preview_slogans]
if preview_effects != list(effects.effect_names()):
    raise AssertionError(f"Preview should include every preset in order, got {preview_effects}.")

print(json.dumps({
    "ok": True,
    "checked": "telegram slogan tile effect presets",
    "effects": list(effects.effect_names())
}, indent=2))
