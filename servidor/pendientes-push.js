/* Pendientes · servidor de avisos (Cloudflare Worker, plan gratis).
   Guarda SOLO suscripciones push (la dirección de notificaciones de cada teléfono) con la hora y zona horaria elegidas.
   Nunca recibe tareas: cada hora despierta a los teléfonos cuya hora local coincide y el teléfono arma el resumen.
   Instalación: binding KV con nombre de variable SUBS, Cron Trigger "0 * * * *", y abrir /setup una vez.
   Cambios: se editan en servidor/pendientes-push.js del repositorio y se vuelven a pegar en Cloudflare (Edit code). */

const APP_ORIGINS = ['https://estebi-jr.github.io'];
const CONTACT = 'https://estebi-jr.github.io/Pendientes/'; // "sub" del JWT: Apple exige una URL o un mailto:
const PUSH_HOST = /(^|\.)(push\.apple\.com|googleapis\.com|mozilla\.com|mozaws\.net|notify\.windows\.com)$/;
const MAX_BODY = 4096;
const MAX_PER_RUN = 45;          // el plan gratis permite 50 subrequests por ejecución
const JWT_LIFE = 12 * 3600;      // Apple rechaza JWT que vencen en más de un día y pide no renovarlos más de una vez por hora

const enc = new TextEncoder();
const b64u = buf => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
function unb64u(s) {
  s = String(s).replace(/-/g, '+').replace(/_/g, '/');
  while (s.length % 4) s += '=';
  const bin = atob(s), out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
const allowed = o => !!o && (APP_ORIGINS.includes(o) || /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(o));
function cors(origin, h = {}) { if (allowed(origin)) { h['Access-Control-Allow-Origin'] = origin; h['Vary'] = 'Origin'; } return h; }
const json = (obj, status, origin) => new Response(JSON.stringify(obj), { status: status || 200, headers: cors(origin, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }) });

/* ---- validaciones ---- */
function validEndpoint(e) {
  if (typeof e !== 'string' || e.length > 600) return false;
  try { const u = new URL(e); return u.protocol === 'https:' && PUSH_HOST.test(u.hostname); } catch (err) { return false; }
}
function validKey(k, len) {
  if (typeof k !== 'string' || !/^[A-Za-z0-9_-]+={0,2}$/.test(k)) return false;
  try { const b = unb64u(k); return b.length === len && (len !== 65 || b[0] === 4); } catch (err) { return false; }
}
function validTz(tz) {
  if (typeof tz !== 'string' || tz.length > 64) return false;
  try { new Intl.DateTimeFormat('en-US', { timeZone: tz }); return true; } catch (err) { return false; }
}
function localHour(date, tz) {
  try {
    const p = new Intl.DateTimeFormat('en-US', { timeZone: tz || 'America/Santiago', hour: 'numeric', hourCycle: 'h23' }).formatToParts(date);
    return +p.find(x => x.type === 'hour').value % 24;
  } catch (err) { return -1; }
}
async function subKey(endpoint) {
  const h = new Uint8Array(await crypto.subtle.digest('SHA-256', enc.encode(endpoint)));
  return 'sub:' + [...h.slice(0, 16)].map(x => x.toString(16).padStart(2, '0')).join('');
}
function readSub(body) {
  const s = body && body.subscription, keys = (s && s.keys) || {};
  if (!s || !validEndpoint(s.endpoint)) return { error: 'endpoint' };
  if (!validKey(keys.p256dh, 65) || !validKey(keys.auth, 16)) return { error: 'llaves' };
  const h = Number.isInteger(body.hour) && body.hour >= 0 && body.hour <= 23 ? body.hour : 8;
  const tz = validTz(body.tz) ? body.tz : 'America/Santiago';
  return { meta: { e: s.endpoint, p: keys.p256dh, a: keys.auth, h, tz } };
}

/* ---- llaves VAPID (se crean una vez con /setup y nunca cambian: si cambian, todas las suscripciones dejan de servir) ---- */
let VAPID = null;
async function getVapid(env) {
  if (VAPID) return VAPID;
  const v = await env.SUBS.get('vapid', 'json');
  if (v && v.pub && v.jwk) VAPID = v;
  return VAPID;
}
async function setup(env) {
  const cur = await getVapid(env);
  if (cur) return { created: false, key: cur.pub };
  const kp = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
  const v = { pub: b64u(await crypto.subtle.exportKey('raw', kp.publicKey)), jwk: await crypto.subtle.exportKey('jwk', kp.privateKey), createdAt: new Date().toISOString() };
  await env.SUBS.put('vapid', JSON.stringify(v));
  VAPID = v;
  return { created: true, key: v.pub };
}
const JWTS = new Map();
async function vapidAuth(env, vapid, endpoint) {
  const aud = new URL(endpoint).origin, now = Math.floor(Date.now() / 1000);
  let c = JWTS.get(aud) || await env.SUBS.get('jwt:' + aud, 'json');
  if (!c || c.exp - now < 3600) {
    const head = b64u(enc.encode(JSON.stringify({ typ: 'JWT', alg: 'ES256' })));
    const claims = b64u(enc.encode(JSON.stringify({ aud, exp: now + JWT_LIFE, sub: CONTACT })));
    const key = await crypto.subtle.importKey('jwk', vapid.jwk, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']);
    const sig = await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, key, enc.encode(head + '.' + claims));
    c = { t: head + '.' + claims + '.' + b64u(sig), exp: now + JWT_LIFE };
    await env.SUBS.put('jwt:' + aud, JSON.stringify(c), { expirationTtl: JWT_LIFE });
  }
  JWTS.set(aud, c);
  return 'vapid t=' + c.t + ', k=' + vapid.pub;
}

/* ---- envío: push sin contenido (Apple lo permite); el teléfono calcula el resumen con sus propios datos ---- */
async function sendPush(env, vapid, meta, ttl) {
  const res = await fetch(meta.e, {
    method: 'POST',
    headers: { 'Authorization': await vapidAuth(env, vapid, meta.e), 'TTL': String(ttl || 14400), 'Urgency': 'high', 'Topic': 'resumen' }
  });
  let reason = '';
  if (res.status >= 400) { try { reason = (await res.text()).slice(0, 200); } catch (err) {} }
  return { status: res.status, reason };
}
async function deliver(env, vapid, key, meta, ttl) {
  try {
    const r = await sendPush(env, vapid, meta, ttl);
    if (r.status === 404 || r.status === 410) await env.SUBS.delete(key); // el teléfono ya no existe o desinstaló la app
    else if (r.status >= 400) console.log('push', r.status, r.reason, new URL(meta.e).hostname);
    return r.status;
  } catch (err) { console.log('push falló', String(err)); return 0; }
}
async function hourly(env, when) {
  const vapid = await getVapid(env);
  if (!vapid) return { sent: 0, due: 0, note: 'falta /setup' };
  const due = [];
  let cursor;
  do {
    const page = await env.SUBS.list({ prefix: 'sub:', cursor });
    for (const k of page.keys) { const m = k.metadata; if (m && m.e && localHour(when, m.tz) === m.h) due.push([k.name, m]); }
    cursor = page.list_complete ? null : page.cursor;
  } while (cursor);
  let sent = 0;
  for (const [key, meta] of due.slice(0, MAX_PER_RUN)) { const st = await deliver(env, vapid, key, meta, 14400); if (st >= 200 && st < 300) sent++; }
  return { sent, due: due.length };
}

const LAST_TEST = new Map();
export default {
  async fetch(req, env, ctx) {
    const url = new URL(req.url), origin = req.headers.get('Origin');
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors(origin, { 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type', 'Access-Control-Max-Age': '86400' }) });
    if (!env.SUBS) return json({ ok: false, error: 'Falta el binding KV con nombre de variable SUBS' }, 500, origin);
    try {
      if (req.method === 'GET') {
        if (url.pathname === '/') { const v = await getVapid(env); return json({ ok: true, app: 'pendientes-push', listo: !!v, mensaje: v ? 'Servidor listo.' : 'Falta abrir /setup una vez.' }, 200, origin); }
        if (url.pathname === '/setup') { const r = await setup(env); return json({ ok: true, creado: r.created, key: r.key, mensaje: r.created ? 'Llaves creadas. El servidor quedó listo.' : 'Ya estaba configurado. No se cambió nada.' }, 200, origin); }
        if (url.pathname === '/key') { const v = await getVapid(env); return v ? json({ key: v.pub }, 200, origin) : json({ error: 'sin-setup' }, 503, origin); }
      }
      if (req.method === 'POST') {
        if (!allowed(origin)) return json({ error: 'origen' }, 403, origin);
        const text = await req.text();
        if (text.length > MAX_BODY) return json({ error: 'grande' }, 413, origin);
        let body; try { body = JSON.parse(text); } catch (err) { return json({ error: 'json' }, 400, origin); }
        if (url.pathname === '/unsubscribe') {
          if (!validEndpoint(body.endpoint)) return json({ error: 'endpoint' }, 400, origin);
          await env.SUBS.delete(await subKey(body.endpoint));
          return json({ ok: true }, 200, origin);
        }
        if (url.pathname === '/subscribe' || url.pathname === '/test') {
          const r = readSub(body);
          if (r.error) return json({ error: r.error }, 400, origin);
          const key = await subKey(r.meta.e);
          await env.SUBS.put(key, '1', { metadata: r.meta });
          if (url.pathname === '/subscribe') return json({ ok: true, hora: r.meta.h }, 200, origin);
          const vapid = await getVapid(env);
          if (!vapid) return json({ error: 'sin-setup' }, 503, origin);
          const last = LAST_TEST.get(key) || 0;
          if (Date.now() - last < 15000) return json({ error: 'espera' }, 429, origin);
          LAST_TEST.set(key, Date.now());
          const wait = env.TEST_DELAY_MS !== undefined ? +env.TEST_DELAY_MS : 6000; // unos segundos para alcanzar a bloquear el teléfono
          ctx.waitUntil(new Promise(res => setTimeout(res, wait)).then(() => deliver(env, vapid, key, r.meta, 120)));
          return json({ ok: true, segundos: Math.round(wait / 1000) }, 200, origin);
        }
      }
      return json({ error: 'ruta' }, 404, origin);
    } catch (err) {
      console.log('error', err && err.stack ? err.stack : String(err));
      return json({ error: 'interno' }, 500, origin);
    }
  },
  async scheduled(controller, env, ctx) {
    ctx.waitUntil(hourly(env, new Date(controller.scheduledTime)).then(r => console.log('resumen', JSON.stringify(r))));
  }
};
