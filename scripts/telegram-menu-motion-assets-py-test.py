import importlib.util
from pathlib import Path

from PIL import Image, ImageDraw


MODULE_PATH = Path(__file__).with_name("telegram-menu-motion-assets.py")
spec = importlib.util.spec_from_file_location("telegram_menu_motion_assets", MODULE_PATH)
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


def test_crop_uses_tile_center_as_anchor():
    image = Image.new("RGBA", (500, 400), (1, 4, 10, 255))
    draw = ImageDraw.Draw(image)

    # Main icon is centered in the first tile. A bright effect trail sits far
    # right; this should increase crop size, not drag the crop center away.
    draw.ellipse((31, 22, 69, 60), fill=(255, 220, 0, 255))
    draw.rectangle((42, 61, 58, 74), fill=(255, 180, 0, 255))
    draw.rectangle((80, 48, 98, 54), fill=(255, 160, 0, 255))

    rough = module.tile_box(image.size, 0)
    crop = module.detect_icon_box(image, rough)
    crop_center_x = (crop[0] + crop[2]) / 2
    tile_center_x = (rough[0] + rough[2]) / 2

    assert abs(crop_center_x - tile_center_x) <= 4, (
        f"crop center drifted from tile center: crop={crop}, "
        f"crop_center_x={crop_center_x}, tile_center_x={tile_center_x}"
    )


def test_extracted_icon_stays_centered_on_canvas():
    image = Image.new("RGBA", (500, 400), (1, 4, 10, 255))
    draw = ImageDraw.Draw(image)
    draw.ellipse((31, 22, 69, 60), fill=(255, 220, 0, 255))
    draw.rectangle((42, 61, 58, 74), fill=(255, 180, 0, 255))
    draw.rectangle((80, 48, 98, 54), fill=(255, 160, 0, 255))

    crop = module.detect_icon_box(image, module.tile_box(image.size, 0))
    icon = module.extract_transparent_icon(image, crop, 100)
    alpha = icon.getchannel("A")
    weighted_x = 0
    total = 0
    for y in range(icon.height):
        for x in range(icon.width):
            weight = alpha.getpixel((x, y))
            weighted_x += x * weight
            total += weight

    assert total > 0
    visual_center_x = weighted_x / total
    assert abs(visual_center_x - 50) <= 5, f"icon visual center should stay near 50px, got {visual_center_x:.2f}"


def test_real_source_icons_have_clean_edge_padding():
    source_path = Path("public/brand/menu-neon/source.png")
    assert source_path.exists(), f"missing source asset: {source_path}"
    image = Image.open(source_path).convert("RGBA")

    failures = []
    for index, item in enumerate(module.MENU_ITEMS):
        crop = module.detect_icon_box(image, module.tile_box(image.size, index))
        icon = module.extract_transparent_icon(image, crop, 100)
        bbox = icon.getchannel("A").point(lambda value: 255 if value > 12 else 0).getbbox()
        if not bbox:
            failures.append(f"{item['key']}: empty alpha")
            continue
        left, top, right, bottom = bbox
        margins = (left, top, icon.width - right, icon.height - bottom)
        width = right - left
        height = bottom - top
        if min(margins) < 6:
            failures.append(f"{item['key']}: too close to edge margins={margins}")
        if max(abs(margins[0] - margins[2]), abs(margins[1] - margins[3])) > 18:
            failures.append(f"{item['key']}: visually off-center margins={margins}")
        if max(width, height) < 70:
            failures.append(f"{item['key']}: too small bbox={(left, top, right, bottom)}")

    assert not failures, "\n".join(failures)


def test_each_menu_effect_has_ambient_motion_layer():
    transparent_icon = Image.new("RGBA", (100, 100), (0, 0, 0, 0))
    failures = []
    for item in module.MENU_ITEMS:
        active_pixels = 0
        for frame_index in (0, 8, 16, 24, 32, 40):
            frame = module.frame_for_effect(transparent_icon.copy(), item, frame_index, 48, 100)
            alpha = frame.getchannel("A")
            alpha_values = alpha.get_flattened_data() if hasattr(alpha, "get_flattened_data") else alpha.getdata()
            active_pixels = max(active_pixels, sum(1 for value in alpha_values if value > 8))
        if active_pixels < 24:
            failures.append(f"{item['key']} ({item['effect']}): ambient layer too weak: {active_pixels}px")

    assert not failures, "\n".join(failures)


if __name__ == "__main__":
    test_crop_uses_tile_center_as_anchor()
    test_extracted_icon_stays_centered_on_canvas()
    test_real_source_icons_have_clean_edge_padding()
    test_each_menu_effect_has_ambient_motion_layer()
    print('{"ok": true, "checked": "telegram menu crop centering"}')
