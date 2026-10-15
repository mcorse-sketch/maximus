import sys
from PIL import Image, ImageDraw, ImageFont
nomes = ["maximus", "consultorio", "servidor", "recepcao", "financeiro"]
f = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf", 18)
fundos = [(236, 238, 240), (40, 44, 50)]
W, H = 5 * 300 + 40, 2 * 520 + 20
c = Image.new("RGB", (W, H), "white"); d = ImageDraw.Draw(c)
for row, bg in enumerate(fundos):
    y0 = row * 530
    d.rectangle((0, y0, W, y0 + 520), fill=bg)
    for i, n in enumerate(nomes):
        im = Image.open(n + ".png").convert("RGBA")
        x = 20 + i * 300
        big = im.resize((256, 256), Image.LANCZOS); c.paste(big, (x, y0 + 20), big)
        xx = x
        for s in (128, 64, 32):
            sm = im.resize((s, s), Image.LANCZOS); c.paste(sm, (xx, y0 + 300 + (128 - s)), sm); xx += s + 12
        d.text((x, y0 + 450), n + "  (256·128·64·32)", fill=(0, 0, 0) if row == 0 else (230, 230, 230), font=f)
c.save(sys.argv[1])
