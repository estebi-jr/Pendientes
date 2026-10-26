#!/usr/bin/env python3
"""Capturas en bruto de la app real para el portafolio: iPhone 15 Pro Max (430x932 @3x = 1290x2796).

    python3 screenshots.py     -> out/pendientes-1.png ... pendientes-5.png

Sin marco ni textos añadidos, con los datos de ejemplo de seed.py. Orden de importancia:
  1 Hoy (pantalla principal)   2 Anotar escribiendo (la app entiende fecha, ramo y tipo)
  3 Mes con el clavo (resultado del mes)   4 Muro de post-its   5 Día despejado
"""
import os, sys
from playwright.sync_api import sync_playwright

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import appdrive, seed
from guion import TYPED

OUT = os.path.join(HERE, 'out')


def shot(page, n):
    path = os.path.join(OUT, 'pendientes-%d.png' % n)
    page.screenshot(path=path, type='png')
    print('captura:', path)


def main():
    os.makedirs(OUT, exist_ok=True)
    with sync_playwright() as p:
        browser = p.chromium.launch()
        ctx, page = appdrive.open_app(browser, seed.local_storage('hoy'), seed.CLOCK_ISO)
        vc = appdrive.VClock(page)
        vc.settle(600)
        shot(page, 1)                                   # Hoy

        page.click('.fab'); vc.settle(500)
        for ch in TYPED:
            page.keyboard.type(ch); vc.step()
        vc.settle(600)
        shot(page, 2)                                   # Anotar escribiendo
        page.click('.q-done'); vc.settle(600)           # se cierra sin agregar

        page.click('.tab[data-tab="muro"]'); vc.settle(600)
        shot(page, 4)                                   # Muro

        page.click('.tab[data-tab="hoy"]'); vc.settle(400)
        for tid in ('tA', 'tB', 'tC'):
            page.click('.rw[data-id="%s"] .check' % tid); vc.settle(1200)
        vc.settle(6000)                                 # sin confeti ni avisos en pantalla
        shot(page, 5)                                   # Día despejado

        page.click('.tab[data-tab="mes"]'); vc.settle(1500)
        shot(page, 3)                                   # Mes con el clavo
        browser.close()


if __name__ == '__main__':
    main()
