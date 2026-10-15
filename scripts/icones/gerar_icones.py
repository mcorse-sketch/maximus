#!/usr/bin/env python3
"""Gera os icones Consultorio e Servidor a partir do icone prateado do Financeiro
(troca o selo '$' por um glifo novo, no mesmo estilo) e os PNGs web (180/192/512).
Uso: python3 scripts/icones/gerar_icones.py   (precisa de Pillow)"""
import os
from PIL import Image, ImageDraw
D = os.path.dirname(os.path.abspath(__file__))
CX, CY, R = 500, 571, 53
FUNDO = (24, 40, 52, 255)
PRATA = (222, 228, 229, 255)
S = 8  # supersampling

def selo(base, desenhar):
    im = Image.open(os.path.join(D, base)).convert('RGBA')
    w = 2 * R * S
    lay = Image.new('RGBA', (w, w), (0, 0, 0, 0))
    d = ImageDraw.Draw(lay)
    d.ellipse((0, 0, w - 1, w - 1), fill=FUNDO)
    desenhar(d, w)
    lay = lay.resize((2 * R, 2 * R), Image.LANCZOS)
    im.alpha_composite(lay, (CX - R, CY - R))
    return im

def estetoscopio(d, w):
    k = w / 100.0
    lw = int(7 * k)
    # tubos em U
    d.arc((26*k, 14*k, 62*k, 58*k), 0, 180, fill=PRATA, width=lw)
    d.line((26*k+lw/2, 36*k, 26*k+lw/2, 18*k), fill=PRATA, width=lw)
    d.line((62*k-lw/2, 36*k, 62*k-lw/2, 18*k), fill=PRATA, width=lw)
    d.ellipse((22*k, 14*k, 32*k, 24*k), fill=PRATA)
    d.ellipse((56*k, 14*k, 66*k, 24*k), fill=PRATA)
    # tubo ate o diafragma
    d.arc((44*k, 40*k, 80*k, 84*k), 90, 180, fill=PRATA, width=lw)
    d.line((44*k+lw/2, 56*k, 44*k+lw/2, 62*k), fill=PRATA, width=lw)
    d.arc((62*k, 52*k, 82*k, 84*k), 0, 90, fill=PRATA, width=lw)
    d.ellipse((66*k, 40*k, 84*k, 58*k), outline=PRATA, width=lw)

def servidor(d, w):
    k = w / 100.0
    for i, y in enumerate((24, 42, 60)):
        d.rounded_rectangle((26*k, y*k, 74*k, (y+14)*k), radius=3*k, outline=PRATA, width=int(5.5*k))
        d.ellipse((32*k, (y+5)*k, 37*k, (y+10)*k), fill=PRATA)
        d.line((46*k, (y+7)*k, 66*k, (y+7)*k), fill=PRATA, width=int(4*k))

if __name__ == '__main__':
    selo('financeiro.png', estetoscopio).save(os.path.join(D, 'consultorio.png'))
    selo('financeiro.png', servidor).save(os.path.join(D, 'servidor.png'))
    web = os.path.join(D, '..', '..', 'apps', 'icones')
    os.makedirs(web, exist_ok=True)
    for nome in ('recepcao', 'consultorio'):
        im = Image.open(os.path.join(D, nome + '.png')).convert('RGBA')
        # iOS aplica a propria mascara: recorta a margem do squircle e preenche o fundo
        bb = im.getbbox(); sq = im.crop(bb)
        fundo = Image.new('RGBA', sq.size, (22, 34, 43, 255)); fundo.alpha_composite(sq)
        for px in (180, 192, 512):
            fundo.convert('RGB').resize((px, px), Image.LANCZOS).save(os.path.join(web, f'{nome}-{px}.png'), optimize=True)
    print('ok')
