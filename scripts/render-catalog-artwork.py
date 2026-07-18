from pathlib import Path
import re
import unicodedata

from PIL import Image, ImageDraw, ImageFilter, ImageFont


ROOT = Path(__file__).resolve().parents[1]
ART_ROOT = ROOT / "public" / "brand" / "catalog-artwork"
BACKGROUND_DIR = ART_ROOT / "backgrounds"
BRAND_OUTPUT_DIR = ART_ROOT / "brands"
PLAN_OUTPUT_DIR = ROOT / "public" / "brand" / "product-plans"
LOGO_DIR = ROOT / "public" / "brand" / "emoji"
CANVAS_SIZE = (1200, 800)

FONT_CANDIDATES = [
    Path("C:/Windows/Fonts/seguisb.ttf"),
    Path("C:/Windows/Fonts/segoeuib.ttf"),
    Path("C:/Windows/Fonts/arialbd.ttf"),
]

CATEGORY_BACKGROUNDS = {
    "AI Accounts": "ai-accounts.png",
    "Design Accounts": "design-accounts.png",
    "Work & Cloud Accounts": "work-cloud-accounts.png",
    "Social/MMO Accounts": "social-mmo-accounts.png",
}

BRANDS = {
    "ChatGPT": {"logo": "ChatGPT.png", "accent": (30, 215, 160)},
    "Claude": {"logo": "Claude.png", "accent": (224, 130, 92)},
    "Gemini": {"logo": "Gemini.png", "accent": (151, 105, 255)},
    "Perplexity": {"logo": "Perplexity.png", "accent": (48, 205, 205)},
    "Cursor": {"logo": "Cursor.png", "accent": (225, 231, 239)},
    "Canva": {"logo": "Canva.png", "accent": (41, 207, 220)},
    "CapCut": {"logo": "CapCut.png", "accent": (245, 245, 255)},
    "Figma": {"logo": "Figma.png", "accent": (166, 94, 255)},
    "Gmail": {"logo": "Gmail.png", "accent": (234, 85, 74)},
    "Google": {"logo": "Google.png", "accent": (66, 133, 244)},
    "Microsoft": {"logo": "Microsoft.png", "accent": (0, 188, 242)},
    "Notion": {"logo": "Notion.png", "accent": (235, 238, 244)},
    "PayPal": {"logo": "PayPal.png", "accent": (31, 156, 255)},
    "Telegram": {"logo": "Telegram.png", "accent": (50, 181, 245)},
    "TikTok": {"logo": "TikTok.png", "accent": (255, 55, 123)},
    "Facebook": {"logo": "Facebook.png", "accent": (56, 139, 253)},
    "Discord": {"logo": "Discord.png", "accent": (122, 133, 255)},
}

PRODUCTS = [
    ("chatgpt-plus-1m", "ChatGPT", "AI Accounts", "Plus 1M", "ChatGPT Plus - 1 tháng", "Tài khoản Plus dùng trong 1 tháng, giao thông tin sau thanh toán."),
    ("chatgpt-business-seat-1m", "ChatGPT", "AI Accounts", "Business Seat 1M", "ChatGPT Business Seat 1M", "Seat thành viên Business cấp qua workspace do shop quản lý."),
    ("claude-pro-1m", "Claude", "AI Accounts", "Pro 1M", "Claude Pro - 1 tháng", "Phù hợp viết nội dung, code, research và automation."),
    ("claude-business-seat-1x-1m", "Claude", "AI Accounts", "Business Seat 1x 1M", "Claude Business Seat 1x 1M", "Seat Business mức sử dụng 1x, cấp qua organization của shop."),
    ("claude-business-seat-6-5x-1m", "Claude", "AI Accounts", "Business Seat 6.5x 1M", "Claude Business Seat 6.5x 1M", "Seat Business với mức phân bổ 6.5x theo tier của shop."),
    ("gemini-advanced-1m", "Gemini", "AI Accounts", "Advanced 1M", "Gemini Advanced - 1 tháng", "AI đa nền tảng Google cho học tập, research và công việc."),
    ("perplexity-pro-1m", "Perplexity", "AI Accounts", "Pro 1M", "Perplexity Pro - 1 tháng", "Research, tìm kiếm và tổng hợp thông tin trong 1 tháng."),
    ("cursor-pro-1m", "Cursor", "AI Accounts", "Pro 1M", "Cursor Pro - 1 tháng", "Code AI, agent, autocomplete và workflow phát triển phần mềm."),
    ("canva-pro-1m", "Canva", "Design Accounts", "Nonprofit Seat 1M", "Canva Pro Seat - 1 tháng", "Seat Canva Pro trong team nonprofit, nhận lời mời qua email."),
    ("canva-pro-6m", "Canva", "Design Accounts", "Nonprofit Seat 6M", "Canva Pro Seat - 6 tháng", "Seat Canva Pro 6 tháng trong team nonprofit của shop."),
    ("capcut-pro-1m", "CapCut", "Design Accounts", "Pro 1M", "CapCut Pro - 1 tháng", "Dựng video ngắn và sáng tạo content quảng cáo."),
    ("figma-pro-1m", "Figma", "Design Accounts", "Professional 1M", "Figma Professional - 1 tháng", "Thiết kế UI/UX, prototype, FigJam và workflow team."),
    ("gmail-aged-pack-10", "Gmail", "Work & Cloud Accounts", "Aged Pack 10", "Gmail Aged - Pack 10", "Pack 10 tài khoản Gmail aged, giao theo định dạng của shop."),
    ("google-workspace-slot-1m", "Google", "Work & Cloud Accounts", "Workspace Slot 1M", "Google Workspace Slot - 1 tháng", "Email, Drive và công việc nhóm trong Google Workspace."),
    ("microsoft-365-1m", "Microsoft", "Work & Cloud Accounts", "365 1M", "Microsoft 365 - 1 tháng", "Office, OneDrive và công việc văn phòng trong 1 tháng."),
    ("notion-plus-1m", "Notion", "Work & Cloud Accounts", "Plus 1M", "Notion Plus - 1 tháng", "Workspace Plus cho cá nhân hoặc team nhỏ."),
    ("paypal-business-verified-1", "PayPal", "Work & Cloud Accounts", "Business Verified", "PayPal Business Verified", "Tài khoản Business cho nhu cầu thanh toán quốc tế."),
    ("telegram-aged-pack-10", "Telegram", "Social/MMO Accounts", "Aged Pack 10", "Telegram Aged - Pack 10", "Pack 10 tài khoản aged cho cộng đồng và vận hành MMO."),
    ("tiktok-aged-pack-5", "TikTok", "Social/MMO Accounts", "Aged Pack 5", "TikTok Aged - Pack 5", "Pack 5 tài khoản aged cho content và marketing."),
    ("facebook-aged-pack-5", "Facebook", "Social/MMO Accounts", "Aged Pack 5", "Facebook Aged - Pack 5", "Pack 5 tài khoản aged cho page, cộng đồng và social/MMO."),
    ("discord-aged-pack-10", "Discord", "Social/MMO Accounts", "Aged Pack 10", "Discord Aged - Pack 10", "Pack 10 tài khoản aged cho cộng đồng, whitelist và support."),
]


def brand_key(value):
    text = unicodedata.normalize("NFKD", value).encode("ascii", "ignore").decode("ascii")
    return re.sub(r"[^a-z0-9]+", "-", text.lower()).strip("-")


def pick_font(size):
    for path in FONT_CANDIDATES:
        if path.exists():
            return ImageFont.truetype(str(path), size=size)
    return ImageFont.load_default(size=size)


def fit_font(text, max_width, max_size, min_size=24):
    probe = ImageDraw.Draw(Image.new("RGBA", (1, 1)))
    for size in range(max_size, min_size - 1, -2):
        font = pick_font(size)
        box = probe.textbbox((0, 0), text, font=font)
        if box[2] - box[0] <= max_width:
            return font
    return pick_font(min_size)


def wrap_text(text, font, max_width, max_lines=2):
    draw = ImageDraw.Draw(Image.new("RGBA", (1, 1)))
    words = str(text).split()
    lines = []
    current = ""
    for index, word in enumerate(words):
        candidate = f"{current} {word}".strip()
        if not current or draw.textbbox((0, 0), candidate, font=font)[2] <= max_width:
            current = candidate
        else:
            lines.append(current)
            current = word
            if len(lines) == max_lines - 1:
                tail = " ".join([current, *words[index + 1:]])
                clipped = tail
                while draw.textbbox((0, 0), f"{clipped}…", font=font)[2] > max_width and " " in clipped:
                    clipped = clipped.rsplit(" ", 1)[0]
                lines.append(f"{clipped}…" if clipped != tail else clipped)
                return lines[:max_lines]
    if current and len(lines) < max_lines:
        lines.append(current)
    return lines[:max_lines]


def prepare_background(category, accent):
    source = BACKGROUND_DIR / CATEGORY_BACKGROUNDS[category]
    if not source.exists():
        raise FileNotFoundError(f"Missing AI-generated background: {source}")
    image = Image.open(source).convert("RGB").resize(CANVAS_SIZE, Image.Resampling.LANCZOS).convert("RGBA")
    dark = Image.new("RGBA", CANVAS_SIZE, (0, 5, 18, 72))
    image = Image.alpha_composite(image, dark)
    tint = Image.new("RGBA", CANVAS_SIZE, (*accent, 26))
    return Image.alpha_composite(image, tint)


def rounded_panel(image, box, accent, radius=34):
    glow = Image.new("RGBA", image.size, (0, 0, 0, 0))
    glow_draw = ImageDraw.Draw(glow)
    glow_draw.rounded_rectangle(box, radius=radius, outline=(*accent, 155), width=8)
    image.alpha_composite(glow.filter(ImageFilter.GaussianBlur(18)))
    layer = Image.new("RGBA", image.size, (0, 0, 0, 0))
    draw = ImageDraw.Draw(layer)
    draw.rounded_rectangle(box, radius=radius, fill=(2, 9, 28, 222), outline=(*accent, 220), width=3)
    inner = (box[0] + 10, box[1] + 10, box[2] - 10, box[3] - 10)
    draw.rounded_rectangle(inner, radius=max(10, radius - 9), outline=(255, 255, 255, 34), width=2)
    image.alpha_composite(layer)


def paste_logo(image, brand, center, size):
    info = BRANDS[brand]
    logo_path = LOGO_DIR / info["logo"]
    if logo_path.exists():
        logo = Image.open(logo_path).convert("RGBA")
    elif brand == "Figma":
        logo = Image.new("RGBA", (180, 270), (0, 0, 0, 0))
        logo_draw = ImageDraw.Draw(logo)
        logo_draw.rounded_rectangle((0, 0, 90, 90), radius=45, fill=(242, 78, 30, 255))
        logo_draw.rounded_rectangle((90, 0, 180, 90), radius=45, fill=(255, 114, 98, 255))
        logo_draw.rounded_rectangle((0, 90, 90, 180), radius=45, fill=(162, 89, 255, 255))
        logo_draw.ellipse((90, 90, 180, 180), fill=(26, 188, 254, 255))
        logo_draw.rounded_rectangle((0, 180, 90, 270), radius=45, fill=(10, 207, 131, 255))
    else:
        raise FileNotFoundError(f"Missing exact brand logo: {logo_path}")
    logo.thumbnail((size, size), Image.Resampling.LANCZOS)

    plate_size = size + 46
    plate = Image.new("RGBA", (plate_size, plate_size), (0, 0, 0, 0))
    plate_draw = ImageDraw.Draw(plate)
    plate_draw.rounded_rectangle(
        (8, 8, plate_size - 8, plate_size - 8),
        radius=34,
        fill=(247, 249, 255, 248),
        outline=(*info["accent"], 225),
        width=3,
    )
    glow = plate.filter(ImageFilter.GaussianBlur(14))
    x = int(center[0] - plate_size / 2)
    y = int(center[1] - plate_size / 2)
    image.alpha_composite(glow, (x, y))
    image.alpha_composite(plate, (x, y))
    image.alpha_composite(logo, (int(center[0] - logo.width / 2), int(center[1] - logo.height / 2)))


def draw_centered(draw, y, text, font, fill, width=CANVAS_SIZE[0]):
    box = draw.textbbox((0, 0), text, font=font)
    draw.text(((width - (box[2] - box[0])) / 2, y), text, font=font, fill=fill)


def save_artwork(image, output):
    output.parent.mkdir(parents=True, exist_ok=True)
    image.convert("RGB").save(output, "JPEG", quality=90, optimize=True, progressive=True, subsampling=0)


def render_brand_banner(brand, category):
    accent = BRANDS[brand]["accent"]
    image = prepare_background(category, accent)
    rounded_panel(image, (150, 105, 1050, 695), accent)
    draw = ImageDraw.Draw(image)

    header_font = fit_font(f"KAITO KID AI SHOP  /  {category}", 790, 28, 20)
    draw_centered(draw, 145, f"KAITO KID AI SHOP  /  {category}", header_font, (188, 211, 239, 255))
    paste_logo(image, brand, (600, 315), 145)

    brand_font = fit_font(brand, 760, 80, 44)
    draw_centered(draw, 440, brand, brand_font, (248, 250, 255, 255))
    subtitle_font = pick_font(30)
    draw_centered(draw, 545, "KHÁM PHÁ CÁC PLAN ĐANG BÁN", subtitle_font, (*accent, 255))
    footer_font = pick_font(22)
    draw_centered(draw, 615, "GIÁ RÕ RÀNG   •   NHẬN HÀNG NHANH   •   HỖ TRỢ", footer_font, (170, 188, 216, 255))

    save_artwork(image, BRAND_OUTPUT_DIR / f"{brand_key(brand)}.jpg")


def render_plan_card(product):
    sku, brand, category, package_type, name, description = product
    accent = BRANDS[brand]["accent"]
    image = prepare_background(category, accent)
    rounded_panel(image, (95, 90, 1105, 710), accent)
    draw = ImageDraw.Draw(image)

    header_font = fit_font(f"{category}  /  {brand}", 890, 26, 19)
    draw.text((150, 132), f"{category}  /  {brand}", font=header_font, fill=(185, 208, 237, 255))
    draw.rounded_rectangle((150, 184, 430, 640), radius=28, fill=(1, 7, 22, 185), outline=(*accent, 130), width=2)
    paste_logo(image, brand, (290, 350), 150)
    brand_font = fit_font(brand, 230, 42, 25)
    brand_box = draw.textbbox((0, 0), brand, font=brand_font)
    draw.text((290 - (brand_box[2] - brand_box[0]) / 2, 475), brand, font=brand_font, fill=(247, 249, 255, 255))
    draw.text((213, 545), "PLAN TRONG CATALOG", font=pick_font(19), fill=(*accent, 255))

    content_x = 490
    name_font = fit_font(name, 545, 54, 34)
    name_lines = wrap_text(name, name_font, 545, 2)
    name_y = 220
    for line in name_lines:
        draw.text((content_x, name_y), line, font=name_font, fill=(250, 251, 255, 255))
        name_y += int(name_font.size * 1.12)

    package_font = fit_font(package_type.upper(), 440, 28, 20)
    package_box = draw.textbbox((0, 0), package_type.upper(), font=package_font)
    pill = (content_x, name_y + 24, content_x + package_box[2] - package_box[0] + 48, name_y + 76)
    draw.rounded_rectangle(pill, radius=24, fill=(7, 18, 42, 255), outline=(*accent, 230), width=2)
    draw.text((pill[0] + 24, pill[1] + 10), package_type.upper(), font=package_font, fill=(247, 249, 255, 255))

    description_font = pick_font(27)
    description_y = pill[3] + 42
    for line in wrap_text(description, description_font, 540, 3):
        draw.text((content_x, description_y), line, font=description_font, fill=(202, 216, 238, 255))
        description_y += 39

    draw.line((content_x, 625, 1035, 625), fill=(*accent, 130), width=2)
    draw.text((content_x, 645), "KAITO KID AI SHOP", font=pick_font(21), fill=(164, 184, 214, 255))
    save_artwork(image, PLAN_OUTPUT_DIR / f"{sku}-v2.jpg")


def main():
    categories_by_brand = {}
    for product in PRODUCTS:
        categories_by_brand.setdefault(product[1], product[2])

    for brand, category in categories_by_brand.items():
        render_brand_banner(brand, category)
    for product in PRODUCTS:
        render_plan_card(product)

    print(f"Rendered {len(categories_by_brand)} brand banners to {BRAND_OUTPUT_DIR}")
    print(f"Rendered {len(PRODUCTS)} product plan cards to {PLAN_OUTPUT_DIR}")


if __name__ == "__main__":
    main()
