import importlib.util
import json
from pathlib import Path


module_path = Path(__file__).with_name("telegram-slogan-tile-assets.py")
spec = importlib.util.spec_from_file_location("telegram_slogan_tile_assets", module_path)
assets = importlib.util.module_from_spec(spec)
spec.loader.exec_module(assets)

frame = assets.render_slogan_frame(assets.SLOGANS[0], 100, 0, 1)
alpha = frame.getchannel("A")
solid_alpha = alpha.point(lambda value: 255 if value >= 180 else 0)
bbox = solid_alpha.getbbox()

if not bbox:
    raise AssertionError("Daily Update slogan tile frame should render visible content.")

visible_height = bbox[3] - bbox[1]
if visible_height < 90:
    raise AssertionError(f"Daily Update slogan tile should use at least 90px of the 100px emoji height, got {visible_height}px.")

print(json.dumps({"ok": True, "checked": "telegram slogan tile visual height", "visibleHeight": visible_height}, indent=2))
