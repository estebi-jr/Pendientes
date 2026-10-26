#!/usr/bin/env python3
"""Paso 2 del teaser: compone 1920x1080 cuadro a cuadro (teléfono + fondo + toques) y codifica el MP4.

    python3 compose.py sheet [cuadros]   -> out/sheet.png (hoja de contactos rápida, p. ej. 0,60,120)
    python3 compose.py frames            -> out/frames/0000.png ... (los 480 cuadros)
    python3 compose.py video             -> out/pendientes-teaser.mp4 (H.264 high, crf 14, sin audio)
    python3 compose.py all               -> frames + video

Usa las pantallas de capture.py (out/screen) y su timeline.json.
"""
import json, os, subprocess, sys, time
from playwright.sync_api import sync_playwright

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
from guion import FPS, T, CAMERA, CLEARS, RETURN, LOCK, NOTIF_RECT

OUT = os.path.join(HERE, 'out')
FRAMES = os.path.join(OUT, 'frames')
MP4 = os.path.join(OUT, 'pendientes-teaser.mp4')
N = int(round(T * FPS))
BASE = 0.86                          # escala del teléfono en plano general
# Brillo del fondo con el día despejado: (sube desde, hasta, baja desde, hasta, intensidad)
GLOW = (10.0, 11.4, 13.4, 15.2, 0.55)

# Post-its del fondo. depth < 1: detrás del teléfono; > 1: delante (más desenfocados).
# old = cinta roja y sello (lo que llevas postergando). leave = índice de CLEARS en que se van (None = se quedan).
NOTES = [
    # izquierda
    dict(x=300, y=235, size=182, w=1, r=-8, depth=.5, blur=3.2, tape=True, lines=[62, 48, 30], leave=1),
    dict(x=548, y=560, size=165, w=4, r=5, depth=.62, blur=2.4, old=True, tape=True, lines=[60, 44], leave=0),
    dict(x=235, y=835, size=200, w=2, r=9, depth=.55, blur=3.2, lines=[54, 66], leave=2, lag=.08),
    dict(x=95, y=480, size=285, w=3, r=-12, depth=1.35, blur=12, tape=True, lines=[50, 64], leave=2, lag=.2),
    dict(x=630, y=135, size=138, w=3, r=6, depth=.35, blur=4.8, lines=[50, 34], leave=None),
    dict(x=455, y=930, size=150, w=4, r=-6, depth=.45, blur=3.8, old=True, tape=True, lines=[58], leave=0, lag=.15),
    dict(x=640, y=860, size=128, w=1, r=-4, depth=.4, blur=4.2, leave=1, lag=.16),
    dict(x=440, y=372, size=130, w=2, r=11, depth=.4, blur=4.2, old=True, tape=True, lines=[52], leave=0, lag=.08),
    # derecha
    dict(x=1430, y=655, size=162, w=4, r=-7, depth=.62, blur=2.4, old=True, tape=True, lines=[56, 38], leave=0, lag=.12),
    dict(x=1600, y=285, size=192, w=2, r=7, depth=.5, blur=3.2, tape=True, lines=[64, 42, 52], leave=2),
    dict(x=1705, y=905, size=210, w=3, r=-10, depth=.55, blur=3.2, lines=[58, 40], leave=1, lag=.10),
    dict(x=1845, y=135, size=262, w=1, r=10, depth=1.3, blur=12, tape=True, lines=[52], leave=2, lag=.22),
    dict(x=1335, y=150, size=128, w=4, r=-5, depth=.35, blur=4.8, leave=None),
    dict(x=1265, y=960, size=150, w=3, r=8, depth=.4, blur=4.2, lines=[46], leave=1, lag=.22),
    dict(x=1440, y=440, size=132, w=1, r=-12, depth=.42, blur=4.0, old=True, tape=True, lines=[50, 36], leave=0, lag=.05),
    dict(x=1830, y=600, size=176, w=2, r=6, depth=.5, blur=3.4, lines=[60, 40], leave=2, lag=.12),
    dict(x=1180, y=62, size=118, w=2, r=-9, depth=.33, blur=5, leave=None),
]
def _exit_distance(n):
    # Lo justo para salir del cuadro en dirección radial (más un margen): movimiento corto y calmado.
    dx, dy = n['x'] - 960, n['y'] - 540 - 1e-3
    L = (dx * dx + dy * dy) ** .5
    ux, uy = dx / L, dy / L
    m = n['size'] * 0.85 + 40
    c = []
    if ux < -1e-3: c.append((n['x'] + m) / -ux)
    if ux > 1e-3: c.append((1920 - n['x'] + m) / ux)
    if uy < -1e-3: c.append((n['y'] + m) / -uy)
    if uy > 1e-3: c.append((1080 - n['y'] + m) / uy)
    return min(c)


for k, n in enumerate(NOTES):
    n['out'] = round(_exit_distance(n))
    n.setdefault('ax', 9 + (k * 7) % 9)
    n.setdefault('ay', 7 + (k * 5) % 8)
    n.setdefault('ar', 1.2 + (k % 3) * .5)
    n.setdefault('k', 1 + k % 2)
    n.setdefault('k2', 2 - k % 2)
    n.setdefault('ph', (k * 2.399) % 6.283)
    n.setdefault('rlag', (k * 0.173) % 0.55)


def route(r):
    url = r.request.url
    if not url.startswith('http://teaser.test/'):
        return r.abort()
    path = url[len('http://teaser.test/'):].split('?')[0]
    if path in ('', 'index.html'):
        f = os.path.join(HERE, 'compositor.html')
    elif path.startswith('fonts/'):
        f = os.path.join(HERE, path)
    elif path.startswith('screen/'):
        f = os.path.join(OUT, path)
    elif path.startswith('icon/'):
        f = os.path.join(HERE, '..', '..', os.path.basename(path))   # ícono real de la app (raíz del repo)
    else:
        return r.fulfill(status=404, body='')
    ctype = 'text/html' if f.endswith('.html') else 'image/jpeg' if f.endswith('.jpg') else \
        'image/png' if f.endswith('.png') else 'font/woff2'
    with open(f, 'rb') as fh:
        r.fulfill(status=200, content_type=ctype, body=fh.read())


def open_compositor(p):
    tl = json.load(open(os.path.join(OUT, 'timeline.json')))
    browser = p.chromium.launch(args=['--force-color-profile=srgb'])
    page = browser.new_page(viewport={'width': 1920, 'height': 1080}, device_scale_factor=1)
    page.route('**/*', route)
    page.goto('http://teaser.test/')
    page.evaluate("document.fonts.ready")
    page.evaluate('cfg => setup(cfg)', {'fps': FPS, 'T': T, 'camera': CAMERA, 'clears': CLEARS, 'ret': list(RETURN),
                                         'base': BASE, 'notes': NOTES, 'lock': LOCK, 'notifRect': NOTIF_RECT,
                                         'notif': tl['notif'], 'glow': GLOW})
    return browser, page, tl


def render(page, tl, i):
    src = 'screen/%04d.jpg' % min(i, tl['frames'] - 1)   # después de CAPTURE_END la app ya está tapada
    touch = tl['touch'][i] if i < len(tl['touch']) else None
    page.evaluate('([i,s,t]) => frame(i,s,t)', [i, src, touch])
    return page.screenshot(type='png')


def sheet(frames, path):
    from PIL import Image, ImageDraw
    import io
    with sync_playwright() as p:
        browser, page, tl = open_compositor(p)
        ims = [(f, Image.open(io.BytesIO(render(page, tl, f)))) for f in frames]
        browser.close()
    tw, th = 480, 270
    cols = 4
    rows = (len(ims) + cols - 1) // cols
    S = Image.new('RGB', (cols * (tw + 8), rows * (th + 26)), 'white')
    d = ImageDraw.Draw(S)
    for k, (f, im) in enumerate(ims):
        x, y = (k % cols) * (tw + 8), (k // cols) * (th + 26)
        S.paste(im.convert('RGB').resize((tw, th), Image.LANCZOS), (x, y + 24))
        d.text((x + 4, y + 6), 'cuadro %d  ·  %.2f s' % (f, f / FPS), fill='black')
    S.save(path)
    print('hoja:', path)


def frames_all():
    os.makedirs(FRAMES, exist_ok=True)
    t0 = time.time()
    with sync_playwright() as p:
        browser, page, tl = open_compositor(p)
        for i in range(N):
            with open(os.path.join(FRAMES, '%04d.png' % i), 'wb') as fh:
                fh.write(render(page, tl, i))
            if i % 30 == 0:
                print('cuadro %d/%d (%.0fs)' % (i, N, time.time() - t0), flush=True)
        browser.close()


def video():
    cmd = ['ffmpeg', '-y', '-v', 'error', '-framerate', str(FPS), '-i', os.path.join(FRAMES, '%04d.png'),
           '-frames:v', str(N), '-an',
           '-vf', 'scale=out_color_matrix=bt709:out_range=tv,format=yuv420p',
           '-c:v', 'libx264', '-profile:v', 'high', '-preset', 'veryfast', '-crf', '14',
           '-color_primaries', 'bt709', '-color_trc', 'bt709', '-colorspace', 'bt709', '-color_range', 'tv',
           '-movflags', '+faststart', MP4]
    subprocess.check_call(cmd)
    print('video:', MP4)


if __name__ == '__main__':
    mode = sys.argv[1] if len(sys.argv) > 1 else 'all'
    if mode == 'sheet':
        fr = [int(x) for x in sys.argv[2].split(',')] if len(sys.argv) > 2 else list(range(0, N, 30))
        sheet(fr, os.path.join(OUT, 'sheet.png'))
    elif mode == 'frames':
        frames_all()
    elif mode == 'video':
        video()
    elif mode == 'all':
        frames_all(); video()
    else:
        raise SystemExit(__doc__)
