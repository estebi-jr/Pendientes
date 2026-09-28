// Pruebas del servidor de avisos (servidor/pendientes-push.js). Correr desde la raíz: node fuente/pruebas/worker.test.mjs
import fs from 'fs'; import crypto from 'crypto'; import path from 'path'; import { fileURLToPath } from 'url';
const SRC=path.join(path.dirname(fileURLToPath(import.meta.url)),'..','..','servidor','pendientes-push.js');
const tmp='/tmp/worker-under-test.mjs';
fs.writeFileSync(tmp, fs.readFileSync(SRC,'utf8')+'\nexport const _t={reset:()=>{VAPID=null;JWTS.clear();LAST_TEST.clear()},localHour};\n');
const W=(await import(tmp+'?'+Date.now()));
let fails=0,n=0;
const ok=(c,m)=>{n++;if(!c)fails++;console.log((c?'OK   ':'FALLA')+' '+m)};

class KV{constructor(){this.m=new Map();this.ops={get:0,put:0,list:0,del:0}}
  async get(k,t){this.ops.get++;const e=this.m.get(k);if(!e)return null;return t==='json'?JSON.parse(e.v):e.v}
  async getWithMetadata(k){const e=this.m.get(k);return e?{value:e.v,metadata:e.meta}:{value:null,metadata:null}}
  async put(k,v,o={}){this.ops.put++;this.m.set(k,{v,meta:o.metadata||null,ttl:o.expirationTtl})}
  async delete(k){this.ops.del++;this.m.delete(k)}
  async list({prefix='',cursor}={}){this.ops.list++;return {keys:[...this.m.keys()].filter(k=>k.startsWith(prefix)).map(k=>({name:k,metadata:this.m.get(k).meta})),list_complete:true}}}
const sent=[];let statusFor=()=>201;
globalThis.fetch=async(url,init={})=>{sent.push({url,init});return new Response(statusFor(url)===201?'':'{"reason":"X"}',{status:statusFor(url)})};
const env={SUBS:new KV(),TEST_DELAY_MS:'0'};
const pending=[];const ctx={waitUntil:p=>pending.push(p)};
const ORIGIN='https://estebi-jr.github.io';
const req=(method,path,body,origin=ORIGIN)=>W.default.fetch(new Request('https://pendientes-push.esteban-lands.workers.dev'+path,{method,headers:origin?{Origin:origin,'Content-Type':'text/plain'}:{},body:body===undefined?undefined:(typeof body==='string'?body:JSON.stringify(body))}),env,ctx);
const j=async r=>({s:r.status,b:await r.json(),h:r.headers});
// suscripción "real": llaves de un navegador ficticio
const ua=crypto.generateKeyPairSync('ec',{namedCurve:'P-256'});
const p256dh=Buffer.from(ua.publicKey.export({format:'jwk'}).x,'base64url');
const rawPub=Buffer.concat([Buffer.from([4]),Buffer.from(ua.publicKey.export({format:'jwk'}).x,'base64url'),Buffer.from(ua.publicKey.export({format:'jwk'}).y,'base64url')]).toString('base64url');
const auth=crypto.randomBytes(16).toString('base64url');
const sub=(e)=>({endpoint:e,expirationTime:null,keys:{p256dh:rawPub,auth}});
const APPLE='https://web.push.apple.com/QPU8aHzaTestTokenPendientes01',FCM='https://fcm.googleapis.com/fcm/send/abc:def123',MOZ='https://updates.push.services.mozilla.com/wpush/v2/gAAAAAB-test';

// --- antes de /setup
let r=await j(await req('GET','/',undefined,null));ok(r.s===200&&r.b.listo===false,'GET / avisa que falta /setup');
r=await j(await req('GET','/key'));ok(r.s===503,'GET /key sin setup → 503');
// --- setup
r=await j(await req('GET','/setup',undefined,null));const KEY=r.b.key;
ok(r.b.creado===true&&Buffer.from(KEY,'base64url').length===65&&Buffer.from(KEY,'base64url')[0]===4,'setup crea llave pública P-256 (65 bytes, 0x04)');
W._t.reset();
r=await j(await req('GET','/setup',undefined,null));ok(r.b.creado===false&&r.b.key===KEY,'setup es idempotente: no cambia la llave (aunque se reinicie el servidor)');
r=await j(await req('GET','/key'));ok(r.s===200&&r.b.key===KEY&&r.h.get('Access-Control-Allow-Origin')===ORIGIN,'GET /key entrega la llave con CORS para la app');
// --- validaciones
r=await j(await req('POST','/subscribe',{subscription:sub(APPLE),hour:8},'https://malo.example'));ok(r.s===403,'otro origen → 403');
r=await j(await req('POST','/subscribe',{subscription:sub('https://evil.example.com/x'),hour:8}));ok(r.s===400&&r.b.error==='endpoint','endpoint que no es de un servicio push → 400');
r=await j(await req('POST','/subscribe',{subscription:{endpoint:APPLE,keys:{p256dh:'abc',auth:'x'}},hour:8}));ok(r.s===400&&r.b.error==='llaves','llaves inválidas → 400');
r=await j(await req('POST','/subscribe','{no es json'));ok(r.s===400,'JSON roto → 400');
r=await j(await req('POST','/subscribe','x'.repeat(5000)));ok(r.s===413,'cuerpo gigante → 413');
// --- suscripciones válidas
r=await j(await req('POST','/subscribe',{subscription:sub(APPLE),hour:8,tz:'America/Santiago'}));ok(r.s===200&&r.b.hora===8,'suscripción Apple a las 8 (Chile)');
await req('POST','/subscribe',{subscription:sub(FCM),hour:9,tz:'America/Santiago'});
await req('POST','/subscribe',{subscription:sub(MOZ),hour:8,tz:'Europe/Madrid'});
r=await j(await req('POST','/subscribe',{subscription:sub(APPLE),hour:99,tz:'Marte/Base'}));
const keys=[...env.SUBS.m.keys()].filter(k=>k.startsWith('sub:'));
const appleMeta=[...env.SUBS.m.values()].map(e=>e.meta).find(m=>m&&m.e===APPLE);
ok(keys.length===3&&appleMeta.h===8&&appleMeta.tz==='America/Santiago','re-suscribir actualiza la misma entrada; hora y zona inválidas caen en 8:00 Chile');
await req('POST','/subscribe',{subscription:sub(APPLE),hour:8,tz:'America/Santiago'});
// --- cron: solo a quien le toca
const run=async iso=>{sent.length=0;W._t.reset();await W.default.scheduled({scheduledTime:Date.parse(iso),cron:'0 * * * *'},env,ctx);await Promise.all(pending.splice(0));return sent.map(s=>s.url)};
let u=await run('2026-09-28T11:00:00Z');ok(u.length===1&&u[0]===APPLE,'11:00 UTC en septiembre = 8:00 en Chile: solo el de las 8 de Chile ('+u.length+')');
const p=sent[0];
ok(p.init.method==='POST'&&p.init.body===undefined,'push sin contenido (POST sin body)');
const H=p.init.headers;ok(H.TTL==='14400'&&H.Urgency==='high'&&H.Topic==='resumen','headers TTL/Urgency/Topic válidos para Apple');
const m=/^vapid t=([^,]+), k=(.+)$/.exec(H.Authorization);ok(!!m&&m[2]===KEY,'Authorization "vapid t=…, k=…" con la llave pública del servidor');
const [h64,c64,s64]=m[1].split('.');const hdr=JSON.parse(Buffer.from(h64,'base64url')),cl=JSON.parse(Buffer.from(c64,'base64url'));
const now=Math.floor(Date.now()/1000);
ok(hdr.alg==='ES256'&&cl.aud==='https://web.push.apple.com'&&cl.sub==='https://estebi-jr.github.io/Pendientes/'&&cl.exp-now<=86400&&cl.exp-now>3600,'JWT: ES256, aud = origen del servicio, sub = URL, vence en < 24 h');
const pub=Buffer.from(KEY,'base64url');const pk=crypto.createPublicKey({key:{kty:'EC',crv:'P-256',x:pub.subarray(1,33).toString('base64url'),y:pub.subarray(33).toString('base64url')},format:'jwk'});
ok(crypto.verify('sha256',Buffer.from(h64+'.'+c64),{key:pk,dsaEncoding:'ieee-p1363'},Buffer.from(s64,'base64url')),'firma del JWT verificada con la llave pública (Node crypto, independiente)');
u=await run('2026-09-28T12:00:00Z');ok(u.length===1&&u[0]===FCM,'12:00 UTC = 9:00 Chile: solo el de las 9');
u=await run('2026-06-15T12:00:00Z');ok(u.length===1&&u[0]===APPLE,'en invierno (UTC-4) 12:00 UTC = 8:00 Chile: horario de Chile bien calculado');
u=await run('2026-09-28T06:00:00Z');ok(u.length===1&&u[0]===MOZ,'zona de otro tester (Madrid 8:00) también funciona');
u=await run('2026-09-28T03:00:00Z');ok(u.length===0,'a medianoche no se manda nada');
// JWT reutilizado (Apple pide no renovarlo más de 1 vez por hora)
const puts0=env.SUBS.ops.put;await run('2026-09-28T11:00:00Z');const t1=sent[0].init.headers.Authorization;await run('2026-09-28T11:00:00Z');const t2=sent[0].init.headers.Authorization;
ok(t1===t2&&env.SUBS.ops.put===puts0,'el JWT se reutiliza entre ejecuciones (guardado en KV), sin escrituras extra');
// 410: teléfono que ya no existe → se borra
statusFor=url=>url===APPLE?410:201;await run('2026-09-28T11:00:00Z');statusFor=()=>201;
ok(![...env.SUBS.m.values()].some(e=>e.meta&&e.meta.e===APPLE),'si Apple responde 410, la suscripción se borra sola');
// prueba inmediata
r=await j(await req('POST','/test',{subscription:sub(APPLE),hour:7,tz:'America/Santiago'}));sent.length=0;await Promise.all(pending.splice(0));
ok(r.s===200&&sent.length===1&&sent[0].url===APPLE&&sent[0].init.headers.TTL==='120','Probar ahora: re-registra y manda un push de prueba (TTL corto)');
ok([...env.SUBS.m.values()].some(e=>e.meta&&e.meta.e===APPLE&&e.meta.h===7),'la prueba también deja guardada la hora elegida');
r=await j(await req('POST','/test',{subscription:sub(APPLE),hour:7}));ok(r.s===429,'dos pruebas seguidas: la segunda espera (429)');
// desuscribir
r=await j(await req('POST','/unsubscribe',{endpoint:APPLE}));ok(r.s===200&&![...env.SUBS.m.values()].some(e=>e.meta&&e.meta.e===APPLE),'desactivar borra la suscripción');
// varios
let rr=await W.default.fetch(new Request('https://x.workers.dev/subscribe',{method:'OPTIONS',headers:{Origin:ORIGIN}}),env,ctx);ok(rr.status===204&&rr.headers.get('Access-Control-Allow-Origin')===ORIGIN,'preflight CORS');
r=await j(await req('GET','/nada'));ok(r.s===404,'ruta desconocida → 404');
rr=await W.default.fetch(new Request('https://x.workers.dev/'),{},ctx);ok(rr.status===500&&(await rr.json()).error.includes('SUBS'),'sin binding KV avisa qué falta');
ok(W._t.localHour(new Date('2026-09-06T04:30:00Z'),'America/Santiago')===1,'hora local en el cambio de horario de Chile (6/9)');
console.log(n+' pruebas, '+fails+' fallas');process.exit(fails?1:0);
