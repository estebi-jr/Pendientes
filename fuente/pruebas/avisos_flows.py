"""Flujos de avisos en la versión web instalada: resumen de la mañana + número en el ícono.
Corre el Worker real en local (worker_server.mjs) y le redirige las llamadas a pendientes-push.*.workers.dev.
Uso (desde la raíz, después de build.py): python3 fuente/pruebas/avisos_flows.py . /tmp/capturas"""
import functools, http.server, json, os, re, secrets, socket, subprocess, sys, threading, urllib.error, urllib.parse, urllib.request, base64
from datetime import datetime, timedelta
from zoneinfo import ZoneInfo
from playwright.sync_api import sync_playwright

ROOT = sys.argv[1] if len(sys.argv) > 1 else os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..'))
OUT = sys.argv[2] if len(sys.argv) > 2 else '/tmp/avisos-caps'
HERE = os.path.dirname(os.path.abspath(__file__)); os.makedirs(OUT, exist_ok=True)
UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Mobile/15E148 Safari/604.1'
R = []
LOG = open(os.path.join(OUT, 'progreso.log'), 'w')
def log(m): LOG.write(m + '\n'); LOG.flush()
def check(c, m): R.append(('OK   ' if c else 'FALLA') + ' ' + m); log(R[-1])
def free_port():
    s = socket.socket(); s.bind(('', 0)); p = s.getsockname()[1]; s.close(); return p
def serve_app():
    class Q(http.server.SimpleHTTPRequestHandler):
        def log_message(self, *a): pass
    port = free_port(); srv = http.server.ThreadingHTTPServer(('', port), functools.partial(Q, directory=ROOT))
    threading.Thread(target=srv.serve_forever, daemon=True).start(); return f'http://localhost:{port}'
def start_worker():
    port = free_port()
    p = subprocess.Popen(['node', os.path.join(HERE, 'worker_server.mjs'), os.path.join(ROOT, 'servidor', 'pendientes-push.js'), str(port)], stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True)
    assert p.stdout.readline().startswith('listo'); return p, port
def wjson(port, path): return json.loads(urllib.request.urlopen(f'http://127.0.0.1:{port}{path}', timeout=10).read())

tz = ZoneInfo('America/Santiago'); today = datetime.now(tz).date()
d = lambda n: (today + timedelta(days=n)).isoformat(); now = datetime.now(tz).isoformat()
def T(title, **k):
    o = dict(title=title, category='personal', subject=None, kind='tarea', horizon='dia', due=d(0), notes='', created=d(-2), createdAt=now, done=False, doneAt=None, source='app', updatedAt=now); o.update(k); return o
SEED = {'tasks': {
    't-late': T('Pagar la luz', category='dinero', due=d(-3), created=d(-10)),
    't-hoy': T('Ir al gym', category='deporte'),
    't-ev': T('Control de Microeconomía', category='universidad', subject='Microeconomía', kind='evaluacion', due=d(2), created=d(-5)),
    't-algun': T('Ordenar el clóset', horizon='algun', due=None, created=d(-30)),
    't-done': T('Entregar informe', done=True, doneAt=now)},
    'config': {'subjects': ['Microeconomía']}, 'learning': {'tokens': {}, 'phrases': {}}}
P256 = base64.urlsafe_b64encode(b'\x04' + secrets.token_bytes(64)).decode().rstrip('=')
AUTH = base64.urlsafe_b64encode(secrets.token_bytes(16)).decode().rstrip('=')
MOCK = r'''
(() => {
  const F = window.__FLAGS || {};
  const T = window.__T = {badge: [], asked: [], subCalls: [], unsub: 0};
  if (F.standalone !== false) Object.defineProperty(Navigator.prototype, 'standalone', {get(){return true}, configurable: true});
  if (F.noPush) { try { delete window.PushManager; } catch (e) {} }
  const perm = () => localStorage.getItem('__perm') || 'default';
  const answer = () => localStorage.getItem('__answer') || 'granted';
  function FakeNotification(t){ this.title = t; }
  Object.defineProperty(FakeNotification, 'permission', {get: perm});
  FakeNotification.requestPermission = function(cb){
    T.asked.push(!!(navigator.userActivation && navigator.userActivation.isActive));
    const a = perm() === 'default' ? answer() : perm();
    return new Promise(r => setTimeout(() => { localStorage.setItem('__perm', a); if (cb) cb(a); r(a); }, 60));
  };
  window.Notification = FakeNotification;
  navigator.setAppBadge = n => { T.badge.push(['set', n]); return Promise.resolve(); };
  navigator.clearAppBadge = () => { T.badge.push(['clear']); return Promise.resolve(); };
  if (window.PushManager) {
    const mk = o => ({endpoint: o.endpoint, options: {applicationServerKey: new Uint8Array(o.key).buffer, userVisibleOnly: true},
      toJSON(){ return {endpoint: o.endpoint, expirationTime: null, keys: {p256dh: F.p256dh, auth: F.auth}}; },
      unsubscribe(){ localStorage.removeItem('__sub'); T.unsub++; return Promise.resolve(true); }});
    PushManager.prototype.getSubscription = function(){ const o = JSON.parse(localStorage.getItem('__sub') || 'null'); return Promise.resolve(o ? mk(o) : null); };
    PushManager.prototype.subscribe = function(opts){
      T.subCalls.push(!!(navigator.userActivation && navigator.userActivation.isActive));
      let p = perm(); if (p === 'default') { p = answer(); localStorage.setItem('__perm', p); }
      if (p !== 'granted') return Promise.reject(new DOMException('denied', 'NotAllowedError'));
      const k = opts.applicationServerKey, key = Array.from(new Uint8Array(k.buffer ? k.buffer : k));
      const cur = JSON.parse(localStorage.getItem('__sub') || 'null');
      if (cur && JSON.stringify(cur.key) !== JSON.stringify(key)) return Promise.reject(new DOMException('other key', 'InvalidStateError'));
      const o = cur || {endpoint: 'https://web.push.apple.com/QPU8test' + Math.random().toString(36).slice(2, 10), key};
      localStorage.setItem('__sub', JSON.stringify(o));
      return new Promise(r => setTimeout(() => r(mk(o)), 50));
    };
  }
})();
'''
def seed_js(extra):
    ls = {'pendientes:local:v1': SEED, 'pendientes:tip:v1': True}; ls.update(extra.get('ls', {}))
    js = 'if(!sessionStorage.getItem("__seeded")){sessionStorage.setItem("__seeded","1");'
    for k, v in ls.items(): js += f'localStorage.setItem({json.dumps(k)},{json.dumps(json.dumps(v))});'
    for k in ('__perm', '__answer', '__sub'):
        if k in extra: js += f'localStorage.setItem("{k}",{json.dumps(extra[k])});'
    return js + '}'

def router(wport, state):
    def handler(route, request):
        if state.get('down'): route.abort(); return
        u = urllib.parse.urlparse(request.url); h = request.all_headers()
        hdrs = {k: v for k, v in h.items() if k.lower() in ('origin', 'content-type')}
        if request.method == 'POST': state['origins'].append(hdrs.get('origin'))
        rq = urllib.request.Request(f'http://127.0.0.1:{wport}{u.path}' + ('?' + u.query if u.query else ''), data=request.post_data_buffer if request.method == 'POST' else None, method=request.method, headers=hdrs)
        try:
            with urllib.request.urlopen(rq, timeout=10) as r: st, body, rh = r.status, r.read(), dict(r.headers.items())
        except urllib.error.HTTPError as e: st, body, rh = e.code, e.read(), dict(e.headers.items())
        rh = {k: v for k, v in rh.items() if k.lower() not in ('transfer-encoding', 'connection', 'keep-alive')}
        state['calls'].append((request.method, u.path, st)); route.fulfill(status=st, headers=rh, body=body)
    return handler

def new_ctx(b, url, wport, scheme='light', **extra):
    c = b.new_context(viewport={'width': 390, 'height': 844}, device_scale_factor=2, user_agent=UA, color_scheme=scheme, is_mobile=True, has_touch=True, timezone_id='America/Santiago')
    flags = dict(extra.get('flags', {})); flags.update(p256dh=P256, auth=AUTH)
    c.add_init_script('window.__FLAGS=' + json.dumps(flags) + ';' + seed_js(extra)); c.add_init_script(MOCK)
    state = {'calls': [], 'origins': [], 'down': extra.get('down', False)}
    c.route(re.compile(r'^https://pendientes-push\.esteban-lands\.workers\.dev/'), router(wport, state))
    p = c.new_page(); errs = []; p.on('pageerror', lambda e: errs.append(str(e)))
    p.goto(url + '/'); p.wait_for_timeout(900)
    return c, p, errs, state
LS = lambda p, k: p.evaluate(f'localStorage.getItem({json.dumps(k)})')
def wait_for(p, fn, ms=6000):
    t = 0
    while t < ms:
        v = fn()
        if v: return v
        p.wait_for_timeout(100); t += 100
    return fn()
def open_settings(p): p.click('[data-act="open-settings"][aria-label="Ajustes"]'); p.wait_for_timeout(450)
def shot_avisos(p, name):
    p.evaluate("[...document.querySelectorAll('#setBody h3')].find(h=>h.textContent==='Avisos').scrollIntoView({block:'start'})"); p.wait_for_timeout(300)
    p.screenshot(path=f'{OUT}/{name}.png')
def sw_of(c, p, url):
    for _ in range(60):
        for w in c.service_workers:
            if w.url.startswith(url): return w
        p.wait_for_timeout(100)
    return None
def deliver_push(c, p, url):
    # Lo que haría el service worker al llegar el push: se llama a su showSummary() y se intercepta showNotification
    # (Chromium headless se cae mostrando notificaciones reales y no deja inspeccionar el worker después de un push por CDP)
    sw = sw_of(c, p, url); log('SW: ' + str(sw and sw.url))
    r = sw.evaluate("""async () => { const notes = [];
      self.registration.showNotification = (t, o) => { notes.push({title: t, body: o.body, tag: o.tag, renotify: o.renotify}); return Promise.resolve(); };
      self.navigator.setAppBadge = n => { notes.push({badge: n}); return Promise.resolve(); };
      self.navigator.clearAppBadge = () => { notes.push({badge: 0}); return Promise.resolve(); };
      try { await showSummary(); } finally { delete self.registration.showNotification; delete self.navigator.setAppBadge; delete self.navigator.clearAppBadge; } return notes; }""")
    log('notas ' + json.dumps(r, ensure_ascii=False)); return r
def snapshot(p):
    return p.evaluate("""new Promise(res=>{const rq=indexedDB.open('pendientes',1);rq.onupgradeneeded=()=>rq.result.createObjectStore('kv');
      rq.onsuccess=()=>{const g=rq.result.transaction('kv').objectStore('kv').get('snapshot');g.onsuccess=()=>res(g.result||null)};rq.onerror=()=>res(null)})""")

SWSRC = open(os.path.join(ROOT, 'sw.js'), encoding='utf-8').read()
check("self.addEventListener('push',e=>{e.waitUntil(showSummary())})" in SWSRC and 'function morningSummary' in SWSRC, 'sw.js escucha el push y trae la lógica del resumen')
wproc, wport = start_worker()
try:
    wjson(wport, '/setup')
    with sync_playwright() as pw:
        b = pw.chromium.launch(env={**os.environ, 'TZ': 'America/Santiago'}); url = serve_app()

        # ---------- A. Camino completo: tarjeta → permiso → servidor → notificación ----------
        for scheme in ('light', 'dark'):
            c, p, errs, st = new_ctx(b, url, wport, scheme)
            key = wait_for(p, lambda: LS(p, 'pendientes:push-key'))
            check(bool(key) and len(json.loads(key)) > 80, f'[{scheme}] la app deja lista la llave del servidor antes del toque')
            check(p.locator('aside.news h3').inner_text() == 'Nuevo: tu día en la pantalla bloqueada', f'[{scheme}] tarjeta nueva en Hoy')
            p.screenshot(path=f'{OUT}/A-tarjeta-{scheme}.png')
            if scheme == 'dark':
                p.click('aside.news [data-act="avisos-on"]'); wait_for(p, lambda: LS(p, 'pendientes:daily'))
                open_settings(p); shot_avisos(p, 'A-ajustes-dark'); c.close(); continue
            p.click('aside.news [data-act="avisos-on"]')
            daily = wait_for(p, lambda: LS(p, 'pendientes:daily'))
            T_ = p.evaluate('window.__T')
            check(T_['subCalls'] == [True] and T_['asked'] == [], 'Activar llama a subscribe dentro del toque (como pide Apple), sin pasos previos')
            daily = json.loads(daily or '{}')
            check(daily.get('on') is True and daily.get('hour') == 8 and daily.get('syncedAt') == today.isoformat(), f'queda activado a las 8:00 y confirmado con el servidor: {daily}')
            kv = wjson(wport, '/__kv')
            check(len(kv) == 1 and kv[0]['meta']['h'] == 8 and kv[0]['meta']['tz'] == 'America/Santiago' and kv[0]['meta']['e'] == daily.get('endpoint'), 'el servidor guardó la suscripción: hora 8, zona de Chile')
            check(all(o and o.startswith('http://localhost') for o in st['origins']), 'las llamadas llevan el origen de la app (CORS)')
            check(LS(p, 'pendientes:badge') == 'true' and p.evaluate('window.__T.badge').pop() == ['set', 2], 'el mismo toque deja el número del ícono en 2')
            check('cada mañana a las 8:00' in p.inner_text('#toast'), 'toast de confirmación')
            check(p.locator('aside.news').count() == 0, 'la tarjeta desaparece')
            snap = wait_for(p, lambda: snapshot(p))
            check(snap and snap['badge'] is True and sorted(t['title'] for t in snap['tasks']) == sorted(['Pagar la luz', 'Ir al gym', 'Control de Microeconomía', 'Ordenar el clóset']), 'copia de lo pendiente guardada en IndexedDB para el service worker')
            check(all(set(t) == {'title', 'due', 'horizon', 'kind'} for t in snap['tasks']), 'la copia lleva solo lo mínimo (título, fecha, horizonte, tipo)')
            ns = deliver_push(c, p, url); nb = [x['badge'] for x in ns if 'badge' in x]; ns = [x for x in ns if 'title' in x]
            check(nb == [2], f'el aviso también deja el ícono en 2 (número encendido): {nb}')
            check(len(ns) == 1 and ns[0]['title'] == 'Hoy te quedan 2 tareas · 1 atrasada' and ns[0]['body'] == 'Pagar la luz\nIr al gym\nControl de Microeconomía en 2 días' and ns[0]['tag'] == 'pend-resumen', f'al llegar el push, el service worker muestra el resumen correcto: {ns}')
            p.wait_for_timeout(2600)
            p.click('li[data-id="t-hoy"] .check'); p.wait_for_timeout(1500)
            ns = [x for x in deliver_push(c, p, url) if 'title' in x]
            check(len(ns) == 1 and ns[0]['title'] == 'Hoy te queda 1 tarea · 1 atrasada', f'completar "Ir al gym" cambia el resumen siguiente: {[n["title"] for n in ns]}')
            open_settings(p)
            check(p.locator('[data-act="s-daily"]').get_attribute('aria-checked') == 'true' and p.locator('#sDailyHour').input_value() == '8', 'Ajustes › Avisos: resumen encendido a las 8:00')
            check(p.locator('[data-act="s-badge"]').get_attribute('aria-checked') == 'true', 'Ajustes › Avisos: número encendido')
            shot_avisos(p, 'A-ajustes-light')
            p.select_option('#sDailyHour', '7'); p.wait_for_timeout(700)
            kv = wjson(wport, '/__kv')
            check(kv[0]['meta']['h'] == 7 and json.loads(LS(p, 'pendientes:daily'))['hour'] == 7 and 'a las 7:00' in p.inner_text('#toast'), 'cambiar la hora a 7:00 queda en el servidor')
            p.click('[data-act="s-daily-test"]'); p.wait_for_timeout(800)
            sent = wjson(wport, '/__sent')
            check(len(sent) == 1 and sent[0]['url'] == daily['endpoint'] and sent[0]['headers']['TTL'] == '120', 'Probar ahora: el servidor manda un push de prueba a este teléfono')
            check(p.locator('[data-act="s-daily-test"]').is_disabled() and 'Bloquea el teléfono' in p.inner_text('#toast'), 'el botón se bloquea unos segundos y explica qué hacer')
            wjson(wport, '/__cron?at=' + urllib.parse.quote(datetime.combine(today, datetime.min.time(), tzinfo=tz).replace(hour=7).astimezone(ZoneInfo('UTC')).isoformat()))
            sent = wjson(wport, '/__sent')
            check(len(sent) == 2, 'el envío programado de las 7:00 (hora Chile) le llega a este teléfono')
            p.wait_for_timeout(2600)
            p.click('[data-act="s-daily"]'); p.wait_for_timeout(700)
            check(wjson(wport, '/__kv') == [] and p.evaluate('window.__T.unsub') == 1 and json.loads(LS(p, 'pendientes:daily'))['on'] is False, 'apagar el resumen borra la suscripción del servidor y del teléfono')
            check(p.locator('[data-act="s-badge"]').get_attribute('aria-checked') == 'true', 'el número sigue encendido por su cuenta')
            p.click('[data-act="s-close"]'); p.wait_for_timeout(300); p.reload(); p.wait_for_timeout(1200)
            check(p.locator('aside.news').count() == 0 and p.evaluate('window.__T.badge').pop() == ['set', 1], 'al reabrir: sin tarjeta y con el número al día')
            check(not errs, f'sin errores de JavaScript (A): {errs}')
            c.close()

        # ---------- B. Al abrir la app se re-sincroniza sola ----------
        c, p, errs, st = new_ctx(b, url, wport, 'light', __perm='granted', ls={'pendientes:daily': {'on': True, 'hour': 9, 'endpoint': 'https://web.push.apple.com/viejo', 'syncedAt': '2026-01-01'}, 'pendientes:avisos-card': True})
        kv = wait_for(p, lambda: [x for x in wjson(wport, '/__kv') if x['meta']['h'] == 9], 7000)
        d2 = json.loads(LS(p, 'pendientes:daily'))
        check(len(kv) == 1 and d2['syncedAt'] == today.isoformat() and d2['endpoint'] == kv[0]['meta']['e'], 'al abrir, la app vuelve a registrar su suscripción (hora 9) sin que el usuario haga nada')
        check(not errs, f'sin errores de JavaScript (B): {errs}')
        c.close()
        for x in wjson(wport, '/__kv'): pass

        # ---------- C. Servidor caído al activar desde Ajustes ----------
        c, p, errs, st = new_ctx(b, url, wport, 'light', down=True, ls={'pendientes:avisos-card': True})
        open_settings(p); p.click('[data-act="s-daily"]'); p.wait_for_timeout(1500)
        d3 = json.loads(LS(p, 'pendientes:daily') or '{"on":false}')
        check(p.evaluate('window.__T.asked') == [True] and d3.get('on') is not True and 'No se pudo activar el resumen' in p.inner_text('#toast'), 'sin servidor: pide permiso en el toque, no deja nada a medias y lo explica')
        check(not errs, f'sin errores de JavaScript (C): {errs}')
        c.close()

        # ---------- D. Permiso rechazado ----------
        c, p, errs, st = new_ctx(b, url, wport, 'light', __answer='denied')
        wait_for(p, lambda: LS(p, 'pendientes:push-key'))
        p.click('aside.news [data-act="avisos-on"]'); p.wait_for_timeout(900)
        check(p.locator('aside.news').count() == 0 and 'bloqueó el permiso' in p.inner_text('#toast') and not LS(p, 'pendientes:daily'), 'rechazar: la tarjeta no insiste y explica cómo activarlo')
        open_settings(p); check('bloqueados' in p.inner_text('.s-note'), 'Ajustes explica el camino en el iPhone'); shot_avisos(p, 'D-bloqueado-light')
        check(not errs, f'sin errores de JavaScript (D): {errs}')
        c.close()

        # ---------- E. Sin push (solo número en el ícono) ----------
        c, p, errs, st = new_ctx(b, url, wport, 'light', flags={'noPush': True})
        check(p.locator('aside.news h3').inner_text() == 'Nuevo: número en el ícono', 'sin push: la tarjeta ofrece solo el número')
        p.click('aside.news [data-act="avisos-on"]'); p.wait_for_timeout(600)
        check(LS(p, 'pendientes:badge') == 'true' and p.evaluate('window.__T.badge').pop() == ['set', 2], 'sin push: el número funciona igual')
        open_settings(p); check(p.locator('[data-act="s-daily"]').count() == 0 and p.locator('[data-act="s-badge"]').count() == 1, 'sin push: Ajustes muestra solo el número')
        check(not errs, f'sin errores de JavaScript (E): {errs}')
        c.close()

        # ---------- F. Sin instalar ----------
        c, p, errs, st = new_ctx(b, url, wport, 'light', flags={'standalone': False})
        check(p.locator('aside.news').count() == 0 and st['calls'] == [], 'sin instalar: ni tarjeta ni llamadas al servidor')
        open_settings(p); check('resumen cada mañana' in p.inner_text('#setBody'), 'sin instalar: Avisos explica que se activa al instalar')
        check(not errs, f'sin errores de JavaScript (F): {errs}')
        c.close()
        b.close()
finally:
    wproc.terminate()
for r in R: print(r)
fails = sum(1 for r in R if r.startswith('FALLA')); print(f'{len(R)} chequeos, {fails} fallas'); sys.exit(1 if fails else 0)
