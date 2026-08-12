from pathlib import Path
from PIL import Image, ImageDraw


ROOT = Path(__file__).resolve().parents[1]
BUILD = ROOT / "build"
BUILD.mkdir(parents=True, exist_ok=True)

sizes = [16, 24, 32, 48, 64, 128, 256]
images = []
for size in sizes:
    scale = size / 256
    image = Image.new("RGBA", (size, size), "#121212")
    draw = ImageDraw.Draw(image)
    margin = round(26 * scale)
    radius = round(10 * scale)
    draw.rounded_rectangle((margin, margin, size - margin, size - margin), radius=radius, fill="#d0d0d0")
    points = [(65, 70), (102, 70), (128, 174), (154, 70), (191, 70), (149, 202), (107, 202)]
    draw.polygon([(round(x * scale), round(y * scale)) for x, y in points], fill="#121212")
    images.append(image)

images[-1].save(BUILD / "icon.ico", format="ICO", sizes=[(size, size) for size in sizes], append_images=images[:-1])
images[-1].save(BUILD / "icon.png", format="PNG")
