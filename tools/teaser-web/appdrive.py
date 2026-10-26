"""Abre la app real (index.html, versión web) en Chromium headless como si fuera un iPhone 15 Pro Max
y permite manejarla cuadro a cuadro con tiempo virtual.

- La app se sirve desde el repo con page.route (http://pendientes.test/), sin red.
- Las fuentes de Google Fonts se reemplazan por los woff2 locales de fonts/ (mismas familias).
- Áreas seguras del iPhone (59 px arriba, 34 abajo) con Emulation.setSafeAreaInsetsOverride.
- Reloj falso (page.clock) en el lunes 26 de octubre de 2026, 9:41, hora de Chile.
- Animaciones CSS en tiempo virtual: cada cuadro se pausan y se les fija currentTime.
"""
import json, mimetypes, os

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.abspath(os.path.join(HERE, '..', '..'))
ORIGIN = 'http://pendientes.test'
W, H, DPR = 430, 932, 3
SAFE_TOP, SAFE_BOTTOM = 59, 34

FONT_CSS = """
@font-face{font-family:'Bricolage Grotesque';font-style:normal;font-display:block;font-weight:200 800;
  src:url(http://pendientes.test/__fonts/bricolage-grotesque-latin-opsz-normal.woff2) format('woff2-variations');}
@font-face{font-family:'Caveat';font-style:normal;font-display:block;font-weight:400 700;
  src:url(http://pendientes.test/__fonts/caveat-latin-wght-normal.woff2) format('woff2-variations');}
"""

# Sin cursor de texto (su parpadeo depende del reloj real y metería saltos entre cuadros).
CAPTURE_CSS = "#qText{caret-color:transparent!important}"

ANIM_JS = r"""
(vnow) => {
  // Tiempo virtual para animaciones y transiciones CSS: nacen pausadas y avanzan con el reloj del guion.
  for (const a of document.getAnimations()) {
    if (a.__vdone) continue;
    if (a.__vstart === undefined) { a.__vstart = vnow - 1000/60; try { a.pause(); } catch (e) {} }
    const t = vnow - a.__vstart;
    let end = Infinity;
    try { const c = a.effect.getComputedTiming(); end = c.endTime; } catch (e) {}
    if (t >= end && isFinite(end)) { try { a.finish(); } catch (e) {} a.__vdone = true; }
    else { try { a.currentTime = Math.max(0, t); } catch (e) {} }
  }
  return document.getAnimations().length;
}
"""


def _route(route):
    url = route.request.url
    if url.startswith('https://fonts.googleapis.com'):
        return route.fulfill(status=200, content_type='text/css', body=FONT_CSS)
    if url.startswith('https://fonts.gstatic.com'):
        return route.fulfill(status=404, body='')
    if not url.startswith(ORIGIN):
        return route.abort()
    path = url[len(ORIGIN):].split('?')[0].split('#')[0]
    if path.startswith('/__fonts/'):
        f = os.path.join(HERE, 'fonts', os.path.basename(path))
    else:
        if path in ('', '/'):
            path = '/index.html'
        f = os.path.join(REPO, path.lstrip('/'))
    if not os.path.isfile(f):
        return route.fulfill(status=404, body='')
    ctype = mimetypes.guess_type(f)[0] or 'application/octet-stream'
    if f.endswith('.woff2'):
        ctype = 'font/woff2'
    with open(f, 'rb') as fh:
        body = fh.read()
    if f.endswith('index.html'):
        body = body.replace(b'</head>', ('<style>' + CAPTURE_CSS + '</style></head>').encode(), 1)
    return route.fulfill(status=200, content_type=ctype, body=body)


def open_app(browser, storage, clock_iso):
    ctx = browser.new_context(viewport={'width': W, 'height': H}, device_scale_factor=DPR, is_mobile=True,
                              has_touch=True, locale='es-CL', timezone_id='America/Santiago',
                              color_scheme='light', reduced_motion='no-preference', service_workers='block',
                              user_agent='Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 '
                                         '(KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1')
    ctx.route('**/*', _route)
    page = ctx.new_page()
    cdp = ctx.new_cdp_session(page)
    cdp.send('Emulation.setSafeAreaInsetsOverride',
             {'insets': {'top': SAFE_TOP, 'bottom': SAFE_BOTTOM, 'left': 0, 'right': 0}})
    seed = 'for (const [k,v] of Object.entries(%s)) localStorage.setItem(k, JSON.stringify(v));' % json.dumps(storage)
    page.add_init_script('if (!sessionStorage.getItem("__seeded")) { localStorage.clear(); %s sessionStorage.setItem("__seeded","1"); }' % seed)
    # Math.random con semilla: el confeti y los ids salen iguales en cada render.
    page.add_init_script('(() => { let a = 7; Math.random = () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a);'
                         ' t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; })();')
    import datetime as _dt
    t0 = _dt.datetime.fromisoformat(clock_iso)
    page.clock.install(time=t0 - _dt.timedelta(seconds=20))
    page.goto(ORIGIN + '/')
    # Carga explícita de las dos familias (no se usa wait_for_function: con el reloj falso no sondea).
    ok = page.evaluate("""async () => {
      await Promise.all([document.fonts.load('700 30px Caveat'), document.fonts.load('600 25px Caveat'),
        document.fonts.load('800 34px "Bricolage Grotesque"'), document.fonts.load('560 16px "Bricolage Grotesque"')]);
      await document.fonts.ready;
      return document.fonts.check('700 30px Caveat') && document.fonts.check('800 34px "Bricolage Grotesque"');
    }""")
    assert ok, 'no cargaron las fuentes locales'
    page.clock.pause_at(t0)
    return ctx, page


class VClock:
    """Avanza el reloj de la página y las animaciones CSS en pasos de cuadro exactos (30 fps)."""

    def __init__(self, page, fps=30):
        self.page, self.fps, self.i, self.ms = page, fps, 0, 0

    def step(self):
        nxt = round((self.i + 1) * 1000 / self.fps)
        self.page.clock.run_for(nxt - self.ms)
        self.ms, self.i = nxt, self.i + 1
        return self.sync()

    def sync(self):
        return self.page.evaluate(ANIM_JS, self.ms)

    def settle(self, ms):
        """Avanza ms de tiempo virtual (para dejar la app quieta antes de una captura)."""
        for _ in range(int(round(ms * self.fps / 1000))):
            self.step()
