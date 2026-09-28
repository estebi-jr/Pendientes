// Corre el Worker real en local para las pruebas de la app. Uso: node worker_server.mjs <worker.js> <puerto>
import http from 'http'; import fs from 'fs';
const [SRC, PORT] = [process.argv[2], +process.argv[3]];
const tmp = '/tmp/worker-srv-' + PORT + '.mjs'; fs.writeFileSync(tmp, fs.readFileSync(SRC, 'utf8'));
const W = await import(tmp);
class KV { constructor() { this.m = new Map(); }
  async get(k, t) { const e = this.m.get(k); if (!e) return null; return t === 'json' ? JSON.parse(e.v) : e.v; }
  async put(k, v, o = {}) { this.m.set(k, { v, meta: o.metadata || null }); }
  async delete(k) { this.m.delete(k); }
  async list({ prefix = '' } = {}) { return { keys: [...this.m.keys()].filter(k => k.startsWith(prefix)).map(k => ({ name: k, metadata: this.m.get(k).meta })), list_complete: true }; } }
const env = { SUBS: new KV(), TEST_DELAY_MS: '0' };
const sent = []; const realFetch = globalThis.fetch;
globalThis.fetch = async (url, init = {}) => {
  const u = new URL(String(url));
  if (/push\.apple\.com|googleapis\.com|mozilla\.com/.test(u.hostname)) { sent.push({ url: String(url), headers: init.headers }); return new Response('', { status: 201 }); }
  return realFetch(url, init);
};
const pending = []; const ctx = { waitUntil: p => pending.push(p) };
http.createServer(async (req, res) => {
  const chunks = []; for await (const c of req) chunks.push(c); const body = Buffer.concat(chunks);
  const url = new URL(req.url, 'http://x');
  const out = (o) => { res.setHeader('content-type', 'application/json'); res.end(JSON.stringify(o)); };
  if (url.pathname === '/__sent') return out(sent);
  if (url.pathname === '/__kv') return out([...env.SUBS.m.entries()].filter(([k]) => k.startsWith('sub:')).map(([k, e]) => ({ key: k, meta: e.meta })));
  if (url.pathname === '/__cron') { await W.default.scheduled({ scheduledTime: Date.parse(url.searchParams.get('at')) }, env, ctx); await Promise.all(pending.splice(0)); return out({ ok: true }); }
  const headers = {}; for (const k of ['origin', 'content-type']) if (req.headers[k]) headers[k] = req.headers[k];
  const r = await W.default.fetch(new Request('https://pendientes-push.esteban-lands.workers.dev' + req.url, { method: req.method, headers, body: ['GET', 'HEAD', 'OPTIONS'].includes(req.method) ? undefined : body }), env, ctx);
  await Promise.all(pending.splice(0));
  res.statusCode = r.status; r.headers.forEach((v, k) => res.setHeader(k, v)); res.end(Buffer.from(await r.arrayBuffer()));
}).listen(PORT, '127.0.0.1', () => console.log('listo ' + PORT));
