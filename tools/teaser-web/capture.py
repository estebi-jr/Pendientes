#!/usr/bin/env python3
"""Paso 1 del teaser: maneja la app REAL cuadro a cuadro y guarda la pantalla del teléfono.

    python3 capture.py            -> out/screen/0000.jpg ... + out/timeline.json

Cada cuadro (30 fps) = el estado exacto de la app en ese instante del guion, con reloj y animaciones
en tiempo virtual. Los toques son eventos reales del mouse sobre la app (taps, deslizar, escribir y scroll);
timeline.json guarda dónde estaba el dedo en cada cuadro para dibujar el toque visible en compose.py.
"""
import json, math, os, shutil, sys, time
from playwright.sync_api import sync_playwright

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import appdrive, seed
from guion import FPS, T, CAPTURE_END, EVENTS

OUT = os.path.join(HERE, 'out')
SCR = os.path.join(OUT, 'screen')


def ease(u):  # ease in-out cúbico
    u = min(1, max(0, u))
    return 4 * u * u * u if u < .5 else 1 - (-2 * u + 2) ** 3 / 2


def rect(page, sel, idx=0):
    r = page.evaluate("([s,i]) => { const el = typeof s === 'string' ? document.querySelectorAll(s)[i] : null;"
                      " if (!el) return null; const b = el.getBoundingClientRect();"
                      " return {x:b.left, y:b.top, w:b.width, h:b.height}; }", [sel, idx])
    if not r:
        raise SystemExit('FALLA: no encontré %r en la app (¿cambió el HTML?)' % sel)
    return r


def frame_of(t):
    return int(round(t * FPS))


def main():
    shutil.rmtree(SCR, ignore_errors=True)
    os.makedirs(SCR)
    n = frame_of(CAPTURE_END)
    touch = [None] * n            # estado del dedo por cuadro
    marks = {}                    # rects útiles para la cámara
    # Programa de acciones por cuadro: lista de callables
    plan = {}

    def at(t, fn):
        plan.setdefault(frame_of(t), []).append(fn)

    with sync_playwright() as p:
        browser = p.chromium.launch()
        ctx, page = appdrive.open_app(browser, seed.local_storage('hoy'), seed.CLOCK_ISO)
        vc = appdrive.VClock(page, FPS)
        mouse = page.mouse

        for ev in EVENTS:
            kind = ev['do']
            if kind == 'tap':
                tp = ev['t']; tr = tp + 0.10; ta = tp - 0.26; tz = tr + 0.30
                box = {}
                if ev.get('fake'):
                    # toque solo visible (p. ej. sobre la pantalla bloqueada): no toca la app
                    box['x'], box['y'] = ev['xy']
                else:
                    def aim(sel=ev['sel'], idx=ev.get('i', 0), box=box, dx=ev.get('dx', 0.5), dy=ev.get('dy', 0.5)):
                        r = rect(page, sel, idx)
                        box['x'], box['y'] = r['x'] + r['w'] * dx, r['y'] + r['h'] * dy
                    at(ta, aim)
                    at(tp, lambda box=box: (mouse.move(box['x'], box['y']), mouse.down()))
                    at(tr, lambda: mouse.up())
                for f in range(frame_of(ta), frame_of(tz) + 1):
                    t = f / FPS
                    def st(t=t, box=box, ta=ta, tp=tp, tr=tr, tz=tz):
                        a = ease((t - ta) / (tp - ta - 0.04)) if t < tr else 1 - ease((t - tr) / (tz - tr))
                        pr = ease((t - tp + 0.02) / 0.07) if t < tr else 1 - ease((t - tr) / 0.12)
                        rip = (t - tr) / (tz - tr) if t >= tr else -1
                        return {'x': box['x'], 'y': box['y'], 'a': round(a, 4), 'p': round(pr, 4), 'rip': round(rip, 4)}
                    plan.setdefault(f, []).append(('touch', st))
            elif kind == 'swipe':
                tp, tr = ev['t'], ev['t2']; ta = tp - 0.26; tz = tr + 0.30; d = ev.get('dist', 250)
                box = {}

                def aim(sel=ev['sel'], idx=ev.get('i', 0), box=box):
                    r = rect(page, sel, idx)
                    box['x'], box['y'] = r['x'] + 96, r['y'] + r['h'] * 0.5
                at(ta, aim)
                at(tp, lambda box=box: (mouse.move(box['x'], box['y']), mouse.down()))
                for f in range(frame_of(tp) + 1, frame_of(tr) + 1):
                    t = f / FPS
                    at(t, lambda t=t, box=box, tp=tp, tr=tr, d=d: mouse.move(box['x'] + d * ease((t - tp - .04) / (tr - tp - .06)), box['y']))
                at(tr + 0.001, lambda: mouse.up())
                for f in range(frame_of(ta), frame_of(tz) + 1):
                    t = f / FPS
                    def st(t=t, box=box, ta=ta, tp=tp, tr=tr, tz=tz, d=d):
                        a = ease((t - ta) / (tp - ta - 0.04)) if t < tr else 1 - ease((t - tr) / (tz - tr))
                        pr = ease((t - tp + 0.02) / 0.07) if t < tr else 1 - ease((t - tr) / 0.12)
                        x = box['x'] + d * ease((t - tp - .04) / (tr - tp - .06)) if t >= tp else box['x']
                        if t >= tr:
                            x = box['x'] + d + 18 * ease((t - tr) / (tz - tr))   # el dedo sigue un poco al soltar
                        return {'x': x, 'y': box['y'], 'a': round(a, 4), 'p': round(pr, 4), 'rip': -1}
                    plan.setdefault(f, []).append(('touch', st))
            elif kind == 'type':
                text, t0, t1 = ev['text'], ev['t'], ev['t2']
                for k, ch in enumerate(text):
                    at(t0 + (t1 - t0) * k / max(1, len(text) - 1), lambda ch=ch: page.keyboard.type(ch))
            elif kind == 'scroll':
                t0, t1, dy = ev['t'], ev['t2'], ev['dy']
                fx, fy = ev.get('x', 300), ev.get('y', 720)
                ta, tz = t0 - 0.26, t1 + 0.30
                for f in range(frame_of(t0), frame_of(t1) + 1):
                    t = f / FPS
                    at(t, lambda t=t: page.evaluate('y => window.scrollTo(0, y)', round(dy * ease((t - t0) / (t1 - t0)), 2)))
                for f in range(frame_of(ta), frame_of(tz) + 1):
                    t = f / FPS
                    def st(t=t):
                        a = ease((t - ta) / 0.22) if t < t1 else 1 - ease((t - t1) / (tz - t1))
                        pr = ease((t - t0 + 0.02) / 0.07) if t < t1 else 1 - ease((t - t1) / 0.12)
                        y = fy - dy * ease((t - t0) / (t1 - t0)) if t >= t0 else fy
                        if t >= t1:
                            y = fy - dy - 10 * ease((t - t1) / (tz - t1))
                        return {'x': fx, 'y': y, 'a': round(a, 4), 'p': round(pr, 4), 'rip': -1}
                    plan.setdefault(f, []).append(('touch', st))
            elif kind == 'js':
                # ajuste solo para el video (p. ej. ocultar un aviso que tapa lo importante)
                at(ev['t'], lambda code=ev['code']: page.evaluate(code))
            elif kind == 'mark':
                def mk(name=ev['name'], sel=ev['sel']):
                    marks[name] = rect(page, sel)
                at(ev['t'], mk)
            else:
                raise SystemExit('acción desconocida: %r' % kind)

        # Texto del aviso de la mañana con la lógica REAL de la app (morningSummary del bloque CORE)
        # (la app corre dentro de un IIFE: se evalúa el mismo bloque CORE del index.html, el que copia el service worker)
        html = open(os.path.join(appdrive.REPO, 'index.html'), encoding='utf-8').read()
        a, b = html.index('/*CORE-START*/'), html.index('/*CORE-END*/')
        core = html[a:b]
        notif = page.evaluate("""([core, today]) => { const st = JSON.parse(localStorage.getItem('pendientes:local:v1'));
            return new Function('tasks', 'today', core + '\\n;return morningSummary(tasks, today);')(Object.values(st.tasks), today); }""",
                              [core, seed.TODAY])
        print('aviso:', notif)

        t_start = time.time()
        for i in range(n):
            for fn in plan.get(i, []):
                if isinstance(fn, tuple):
                    touch[i] = fn[1]()
                else:
                    fn()
            vc.sync()
            page.screenshot(path=os.path.join(SCR, '%04d.jpg' % i), type='jpeg', quality=95)
            page.clock.run_for(round((i + 1) * 1000 / FPS) - vc.ms)
            vc.ms, vc.i = round((i + 1) * 1000 / FPS), i + 1
            if i % 30 == 0:
                print('cuadro %d/%d  (%.1fs)' % (i, n, time.time() - t_start), flush=True)
        browser.close()

    with open(os.path.join(OUT, 'timeline.json'), 'w') as fh:
        json.dump({'fps': FPS, 'T': T, 'frames': n, 'screen': [appdrive.W, appdrive.H],
                   'touch': touch, 'marks': marks, 'notif': notif}, fh)
    print('Listo: %d cuadros de pantalla en out/screen' % n)


if __name__ == '__main__':
    main()
