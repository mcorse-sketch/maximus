#!/usr/bin/env python3
"""v2.5.20 — icones do Maximus no grid do macOS (Big Sur+): corpo squircle de 824 px num
quadro de 1024, sombra suave, cavalo prateado em relevo e selo 3D grande (legivel a 32 px).
Gera scripts/icones/{maximus,consultorio,servidor,recepcao,financeiro}.png (1024, para .icns)
e apps/icones/<nome>-{180,192,512}.png (quadrado cheio, sem mascara: o iOS aplica a dele).
Uso: python3 scripts/icones/gerar_icones.py   (Pillow). O cavalo vem de cavalo_origem.png."""
import os, math
from PIL import Image, ImageDraw, ImageFilter, ImageChops, ImageFont

D = os.path.dirname(os.path.abspath(__file__))
WEB = os.path.join(D, "..", "..", "apps", "icones")
SS = 2                      # supersampling
B = 824 * SS                # lado do corpo
AZUL_TOPO, AZUL_BASE = (24, 44, 58), (1, 8, 12)   # Azul Profundo #01080C embaixo

def gradiente(w, h, c1, c2, ang=90):
    g = Image.new("RGB", (1, 256))
    for i in range(256):
        t = i / 255
        g.putpixel((0, i), tuple(int(c1[k] + (c2[k] - c1[k]) * t) for k in range(3)))
    g = g.resize((max(w, h) * 2, max(w, h) * 2)).rotate(90 - ang)
    W = g.size[0]
    return g.crop(((W - w) // 2, (W - h) // 2, (W - w) // 2 + w, (W - h) // 2 + h))

def squircle(n):
    """Retangulo de cantos continuos (grid Big Sur: raio ~22,5% do corpo)."""
    k = 4
    m = Image.new("L", (n * k, n * k), 0)
    ImageDraw.Draw(m).rounded_rectangle((0, 0, n * k - 1, n * k - 1), radius=int(0.225 * n * k), fill=255)
    return m.filter(ImageFilter.GaussianBlur(k * 3)).point(lambda v: 0 if v < 128 - 100 else (255 if v > 228 else int((v - 28) * 255 / 200))).resize((n, n), Image.LANCZOS)

def deslocar(im, dx, dy):
    return ImageChops.offset(im, int(dx), int(dy))

def metal(mask, escala, claro=(250, 252, 252), escuro=(150, 162, 168), relevo=1.0):
    """Preenche a mascara com prata (gradiente diagonal) e chanfro iluminado de cima-esquerda."""
    w, h = mask.size
    base = gradiente(w, h, claro, escuro, ang=70).convert("RGBA")
    alt = mask.filter(ImageFilter.GaussianBlur(5 * escala))
    d = int(4 * escala)
    hi = ImageChops.subtract(alt, deslocar(alt, d, d))      # bordas viradas para a luz
    sh = ImageChops.subtract(deslocar(alt, d, d), alt)      # bordas na sombra
    hi = hi.point(lambda v: min(255, int(v * 1.6 * relevo)))
    sh = sh.point(lambda v: min(255, int(v * 1.3 * relevo)))
    base = Image.composite(Image.new("RGBA", (w, h), (255, 255, 255, 255)), base, hi)
    base = Image.composite(Image.new("RGBA", (w, h), (70, 82, 90, 255)), base, sh)
    # brilho especular suave no terco de cima
    brilho = gradiente(w, h, (255, 255, 255), (0, 0, 0), ang=90).convert("L").point(lambda v: int(max(0, v - 150) * 0.5))
    base = Image.composite(Image.new("RGBA", (w, h), (255, 255, 255, 255)), base, brilho)
    base.putalpha(mask)
    return base

def sombra(mask, dx, dy, blur, alpha):
    s = Image.new("RGBA", mask.size, (0, 0, 0, 0))
    m = deslocar(mask, dx, dy).filter(ImageFilter.GaussianBlur(blur)).point(lambda v: int(v * alpha))
    s.putalpha(m)
    return s

def cavalo():
    o = Image.open(os.path.join(D, "cavalo_origem.png")).convert("L")
    bb = (328, 212, 696, 812)
    m = o.crop(bb).point(lambda v: max(0, min(255, int((v - 60) * 255 / 160))))
    return m

# ---------------- glifos do selo (mascara L, lado n, unidade u = n/2) -----------------
def g_estetoscopio(n):
    m = Image.new("L", (n, n), 0); d = ImageDraw.Draw(m); u = n / 2; c = u
    lw = int(0.22 * u)
    x1, x2, ytop, yarc = c - 0.62 * u, c + 0.06 * u, c - 0.78 * u, c - 0.10 * u
    r = (x2 - x1) / 2
    d.line((x1, ytop, x1, yarc), fill=255, width=lw); d.line((x2, ytop, x2, yarc), fill=255, width=lw)
    d.arc((x1 - lw / 2, yarc - r - lw / 2, x2 + lw / 2, yarc + r + lw / 2), 0, 180, fill=255, width=lw)
    for x in (x1, x2):
        d.ellipse((x - lw * 0.8, ytop - lw * 0.8, x + lw * 0.8, ytop + lw * 0.8), fill=255)
    xm, yb = (x1 + x2) / 2, yarc + r
    cx, cy, rr = c + 0.50 * u, c - 0.06 * u, 0.36 * u
    yf = c + 0.50 * u
    d.line((xm, yb, xm, yf - 0.25 * u), fill=255, width=lw)
    d.arc((xm - lw / 2, yf - 0.55 * u, cx + lw / 2, yf + lw / 2), 0, 180, fill=255, width=lw)
    d.line((cx, yf - 0.27 * u, cx, cy + rr * 0.9), fill=255, width=lw)
    d.ellipse((cx - rr, cy - rr, cx + rr, cy + rr), fill=255)
    d.ellipse((cx - rr * 0.40, cy - rr * 0.40, cx + rr * 0.40, cy + rr * 0.40), fill=0)
    return m, []

def g_servidor(n):
    m = Image.new("L", (n, n), 0); d = ImageDraw.Draw(m); u = n / 2; c = u
    leds = []
    h, gap, w = 0.34 * u, 0.10 * u, 1.18 * u
    y0 = c - (3 * h + 2 * gap) / 2
    for i in range(3):
        y = y0 + i * (h + gap)
        d.rounded_rectangle((c - w / 2, y, c + w / 2, y + h), radius=0.09 * u, fill=255)
        ly = y + h / 2
        for k in range(2):
            lx = c - w / 2 + 0.17 * u + k * 0.17 * u
            leds.append((lx, ly, 0.055 * u, (60, 230, 120) if k == 0 else (90, 200, 255)))
        d.rounded_rectangle((c + 0.02 * u, ly - 0.035 * u, c + w / 2 - 0.13 * u, ly + 0.035 * u), radius=0.03 * u, fill=0)
    for lx, ly, r, _ in leds:
        d.ellipse((lx - r * 1.35, ly - r * 1.35, lx + r * 1.35, ly + r * 1.35), fill=0)
    return m, leds

def g_headset(n):
    m = Image.new("L", (n, n), 0); d = ImageDraw.Draw(m); u = n / 2; c = u
    lw = int(0.20 * u)
    d.arc((c - 0.55 * u, c - 0.62 * u, c + 0.55 * u, c + 0.50 * u), 180, 360, fill=255, width=lw)
    for s in (-1, 1):
        x = c + s * 0.55 * u
        d.rounded_rectangle((x - 0.22 * u, c - 0.16 * u, x + 0.22 * u, c + 0.40 * u), radius=0.13 * u, fill=255)
    # microfone
    d.arc((c - 0.55 * u, c - 0.10 * u, c + 0.20 * u, c + 0.62 * u), 90, 170, fill=255, width=int(lw * 0.8))
    d.ellipse((c - 0.02 * u, c + 0.40 * u, c + 0.34 * u, c + 0.72 * u), fill=255)
    return m, []

def g_cifrao(n):
    m = Image.new("L", (n, n), 0); d = ImageDraw.Draw(m)
    f = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf", int(n * 0.78))
    d.text((n / 2, n / 2 + n * 0.02), "$", font=f, fill=255, anchor="mm")
    return m, []

# ---------------------------------- montagem do corpo --------------------------------
def corpo(glifo=None, nome=None):
    e = SS
    im = gradiente(B, B, AZUL_TOPO, AZUL_BASE, ang=90).convert("RGBA")
    # vinheta leve e brilho no topo
    luz = Image.new("L", (B, B), 0); ImageDraw.Draw(luz).ellipse((-B * .2, -B * .75, B * 1.2, B * .45), fill=60)
    luz = luz.filter(ImageFilter.GaussianBlur(120 * e))
    im = Image.composite(Image.new("RGBA", (B, B), (120, 150, 170, 255)), im, luz)
    # cavalo
    cv = cavalo()
    alt = int((600 if glifo else 640) * e)
    cv = cv.resize((int(cv.size[0] * alt / cv.size[1]), alt), Image.LANCZOS)
    mk = Image.new("L", (B, B), 0)
    x0 = (B - cv.size[0]) // 2 - (int(70 * e) if glifo else 0)
    y0 = (B - alt) // 2
    mk.paste(cv, (x0, y0))
    im.alpha_composite(sombra(mk, 0, 14 * e, 18 * e, 0.55))
    im.alpha_composite(metal(mk, e))
    leds = []
    sel = os.path.join(D, "selos", (nome or "") + ".png")
    if glifo and os.path.isfile(sel):
        # selo gerado (FLUX/Z-Image local no Mac do Dr. Marco), recortado em circulo
        R = int(215 * e); cx, cy = int(565 * e), int(580 * e)
        g = Image.open(sel).convert("RGB")
        bb = g.convert("L").point(lambda v: 255 if v > 45 else 0).getbbox()
        lado = max(bb[2] - bb[0], bb[3] - bb[1]); mx, my = (bb[0] + bb[2]) // 2, (bb[1] + bb[3]) // 2
        g = g.crop((mx - lado // 2, my - lado // 2, mx + lado // 2, my + lado // 2)).resize((2 * R, 2 * R), Image.LANCZOS)
        k = 4; mc = Image.new("L", (2 * R * k, 2 * R * k), 0)
        ImageDraw.Draw(mc).ellipse((k * 6, k * 6, 2 * R * k - k * 6, 2 * R * k - k * 6), fill=255)
        mc = mc.resize((2 * R, 2 * R), Image.LANCZOS)
        disco = Image.new("L", (B, B), 0); disco.paste(mc, (cx - R, cy - R))
        im.alpha_composite(sombra(disco, 0, 16 * e, 22 * e, 0.6))
        ga = g.convert("RGBA"); ga.putalpha(mc)
        im.alpha_composite(ga, (cx - R, cy - R))
        return im
    if glifo:
        R = int(205 * e); cx, cy = int(560 * e), int(575 * e)
        disco = Image.new("L", (B, B), 0); ImageDraw.Draw(disco).ellipse((cx - R, cy - R, cx + R, cy + R), fill=255)
        im.alpha_composite(sombra(disco, 0, 16 * e, 22 * e, 0.6))
        anel = metal(disco, e, claro=(255, 255, 255), escuro=(120, 132, 140), relevo=1.2)
        im.alpha_composite(anel)
        Ri = int(R * 0.84)
        dentro = Image.new("L", (B, B), 0); ImageDraw.Draw(dentro).ellipse((cx - Ri, cy - Ri, cx + Ri, cy + Ri), fill=255)
        fundo = gradiente(B, B, (6, 16, 22), (34, 58, 74), ang=90).convert("RGBA"); fundo.putalpha(dentro)
        im.alpha_composite(fundo)
        # sombra interna no alto do disco (parece rebaixado)
        anelint = ImageChops.subtract(dentro, deslocar(dentro, 0, 10 * e)).filter(ImageFilter.GaussianBlur(8 * e))
        s = Image.new("RGBA", (B, B), (0, 0, 0, 255)); s.putalpha(anelint.point(lambda v: int(v * .8))); im.alpha_composite(s)
        n = int(Ri * 2 * 0.86)
        gm, leds = glifo(n)
        gx, gy = cx - n // 2, cy - n // 2
        gmask = Image.new("L", (B, B), 0); gmask.paste(gm, (gx, gy))
        im.alpha_composite(sombra(gmask, 0, 6 * e, 6 * e, 0.7))
        im.alpha_composite(metal(gmask, e, relevo=1.3))
        dd = ImageDraw.Draw(im)
        for lx, ly, r, cor in leds:
            lx += gx; ly += gy
            glow = Image.new("L", (B, B), 0); ImageDraw.Draw(glow).ellipse((lx - r * 3, ly - r * 3, lx + r * 3, ly + r * 3), fill=150)
            g = Image.new("RGBA", (B, B), cor + (255,)); g.putalpha(glow.filter(ImageFilter.GaussianBlur(r * 1.5)))
            im.alpha_composite(g)
            dd.ellipse((lx - r, ly - r, lx + r, ly + r), fill=cor)
            dd.ellipse((lx - r * .45, ly - r * .6, lx + r * .1, ly - r * .1), fill=(255, 255, 255))
    return im

def mac(c):
    e = SS
    body = c.copy()
    sq = squircle(B)
    # filete claro na borda de cima (vidro) e escuro embaixo
    borda = ImageChops.subtract(sq, sq.filter(ImageFilter.MinFilter(5)))
    hl = Image.new("RGBA", (B, B), (255, 255, 255, 0)); hl.putalpha(ImageChops.multiply(borda, gradiente(B, B, (110,) * 3, (0,) * 3).convert("L")))
    body.alpha_composite(hl)
    body.putalpha(sq)
    W = 1024 * e
    tela = Image.new("RGBA", (W, W), (0, 0, 0, 0))
    m = Image.new("L", (W, W), 0); m.paste(sq, (100 * e, 100 * e))
    tela.alpha_composite(sombra(m, 0, 10 * e, 14 * e, 0.45))
    tela.alpha_composite(body, (100 * e, 100 * e))
    return tela.resize((1024, 1024), Image.LANCZOS)

ICONES = {"maximus": None, "consultorio": g_estetoscopio, "servidor": g_servidor,
          "recepcao": g_headset, "financeiro": g_cifrao}

if __name__ == "__main__":
    os.makedirs(WEB, exist_ok=True)
    for nome, gl in ICONES.items():
        c = corpo(gl, nome)
        mac(c).save(os.path.join(D, nome + ".png"), optimize=True)
        if nome in ("recepcao", "consultorio"):
            for px in (180, 192, 512):
                c.convert("RGB").resize((px, px), Image.LANCZOS).save(os.path.join(WEB, "%s-%d.png" % (nome, px)), optimize=True)
    print("ok")
