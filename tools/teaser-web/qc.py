#!/usr/bin/env python3
"""Paso 3: control de calidad del MP4 ya codificado.

    python3 qc.py [ruta.mp4]

- ffprobe: 1920x1080, 30 fps, H.264 high, yuv420p, sin pista de audio.
- Detector de tirones: cuadro casi quieto entre dos que se mueven.
- Empalme del loop: diferencia último -> primer cuadro comparada con la de cuadros consecutivos.
- Hoja de contactos del MP4 codificado (out/pendientes-teaser-contactos.png).
"""
import json, os, subprocess, sys
import numpy as np
from PIL import Image, ImageDraw, ImageFont

HERE = os.path.dirname(os.path.abspath(__file__))
MP4 = sys.argv[1] if len(sys.argv) > 1 else os.path.join(HERE, 'out', 'pendientes-teaser.mp4')
SHEET = os.path.join(os.path.dirname(MP4), 'pendientes-teaser-contactos.png')


def probe():
    j = json.loads(subprocess.check_output(['ffprobe', '-v', 'error', '-show_streams', '-show_format', '-of', 'json', MP4]))
    v = [s for s in j['streams'] if s['codec_type'] == 'video']
    a = [s for s in j['streams'] if s['codec_type'] == 'audio']
    s = v[0]
    num, den = map(int, s['r_frame_rate'].split('/'))
    info = {'ancho': s['width'], 'alto': s['height'], 'fps': num / den, 'codec': s['codec_name'], 'perfil': s.get('profile'),
            'pix_fmt': s['pix_fmt'], 'cuadros': int(s.get('nb_frames', 0)), 'duracion_s': float(j['format']['duration']),
            'pistas_audio': len(a), 'peso_MB': round(int(j['format']['size']) / 1e6, 2)}
    ok = info['ancho'] == 1920 and info['alto'] == 1080 and abs(info['fps'] - 30) < 1e-6 and not a \
        and info['pix_fmt'] == 'yuv420p' and info['codec'] == 'h264'
    return info, ok


def gray_frames(w=480, h=270):
    raw = subprocess.check_output(['ffmpeg', '-v', 'error', '-i', MP4, '-vf', 'scale=%d:%d' % (w, h), '-f', 'rawvideo',
                                   '-pix_fmt', 'gray', '-'])
    return np.frombuffer(raw, np.uint8).reshape(-1, h, w).astype(np.float32)


def main():
    info, ok = probe()
    print('ffprobe:', info, '->', 'OK' if ok else 'REVISAR')
    f = gray_frames()
    n = len(f)
    d = np.abs(np.diff(f, axis=0)).mean(axis=(1, 2))           # d[i] = diferencia entre cuadro i e i+1
    bad = [round((i + 1) / 30, 2) for i in range(2, len(d) - 2)
           if d[i] < 0.35 * min(d[i - 1], d[i + 1]) and min(d[i - 1], d[i + 1]) > 2]
    print('tirones:', bad if bad else 'ninguno')
    seam = float(np.abs(f[-1] - f[0]).mean())
    near = np.concatenate([d[-15:], d[:15]])
    print('empalme último->primero: %.3f | consecutivos: mediana %.3f, media %.3f, p90 %.3f | '
          'alrededor del empalme (15 antes/15 después): media %.3f, máx %.3f'
          % (seam, np.median(d), d.mean(), np.percentile(d, 90), near.mean(), near.max()))
    print('cuadros: %d (%.3f s)' % (n, n / 30))
    # Hoja de contactos del MP4 codificado: 24 cuadros
    idx = [int(round(k * (n - 1) / 23)) for k in range(24)]
    tw, th, cols = 384, 216, 6
    rows = (len(idx) + cols - 1) // cols
    S = Image.new('RGB', (cols * (tw + 8) + 8, rows * (th + 30) + 8), (245, 246, 250))
    dr = ImageDraw.Draw(S)
    try:
        font = ImageFont.truetype('/usr/share/fonts/opentype/inter/Inter-SemiBold.otf', 15)
    except Exception:
        font = None
    for k, i in enumerate(idx):
        png = subprocess.check_output(['ffmpeg', '-v', 'error', '-i', MP4, '-vf', r'select=eq(n\,%d)' % i, '-frames:v', '1',
                                       '-f', 'image2pipe', '-vcodec', 'png', '-'])
        im = Image.open(__import__('io').BytesIO(png)).convert('RGB').resize((tw, th), Image.LANCZOS)
        x, y = 8 + (k % cols) * (tw + 8), 8 + (k // cols) * (th + 30)
        S.paste(im, (x, y + 24))
        dr.text((x + 2, y + 3), 'cuadro %d · %.2f s' % (i, i / 30), fill=(30, 40, 70), font=font)
    S.save(SHEET)
    print('hoja de contactos:', SHEET)


if __name__ == '__main__':
    main()
