/* Pendientes: funciona sin internet. La versión cambia sola en cada actualización. */
const CORE='pend-core-__VERSION__';
const FONTS='pend-fonts';
const FILES=['./','./index.html','./manifest.webmanifest','./icon-180.png','./icon-192.png','./icon-512.png','./icon-maskable-512.png'];

self.addEventListener('install',e=>{
  e.waitUntil(caches.open(CORE).then(c=>c.addAll(FILES)).then(()=>self.skipWaiting()));
});
self.addEventListener('activate',e=>{
  e.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k.startsWith('pend-core-')&&k!==CORE).map(k=>caches.delete(k)))).then(()=>self.clients.claim()));
});
function timeout(ms){return new Promise((_,rej)=>setTimeout(()=>rej(new Error('timeout')),ms))}
self.addEventListener('fetch',e=>{
  const req=e.request;
  if(req.method!=='GET')return;
  const url=new URL(req.url);
  // La app: primero internet (para recibir actualizaciones), si no hay, la copia guardada.
  if(req.mode==='navigate'){
    e.respondWith((async()=>{
      try{
        const res=await Promise.race([fetch(req),timeout(4000)]);
        if(res&&res.ok){const c=await caches.open(CORE);c.put('./index.html',res.clone())}
        return res;
      }catch(err){
        return (await caches.match('./index.html'))||(await caches.match('./'))||Response.error();
      }
    })());
    return;
  }
  // Íconos y manifest: copia guardada primero.
  if(url.origin===self.location.origin){
    e.respondWith(caches.match(req).then(hit=>hit||fetch(req).then(res=>{if(res.ok){const copy=res.clone();caches.open(CORE).then(c=>c.put(req,copy))}return res})));
    return;
  }
  // Tipografías: copia guardada al instante y se actualiza por detrás.
  if(url.hostname==='fonts.googleapis.com'||url.hostname==='fonts.gstatic.com'){
    e.respondWith(caches.open(FONTS).then(async c=>{
      const hit=await c.match(req);
      const net=fetch(req).then(res=>{if(res&&(res.ok||res.type==='opaque'))c.put(req,res.clone());return res}).catch(()=>hit);
      return hit||net;
    }));
  }
});

/* ---- Resumen de la mañana ----
   El servidor solo "despierta" al teléfono (push sin contenido). El resumen se arma aquí, con la copia de lo pendiente
   que la app guarda en IndexedDB, usando la misma lógica de fechas de la app (build.py copia el bloque CORE). */
let PC=null; /* si algo de esto fallara en un navegador viejo, el modo sin internet igual sigue funcionando */
try{PC=(()=>{
/*__CORE__*/
return {todayStr,morningSummary};
})()}catch(e){PC=null}
function idbGet(key){
  return new Promise(res=>{
    let rq;try{rq=indexedDB.open('pendientes',1)}catch(e){res(null);return}
    rq.onupgradeneeded=()=>{try{rq.result.createObjectStore('kv')}catch(e){}};
    rq.onerror=()=>res(null);
    rq.onsuccess=()=>{const db=rq.result;try{const g=db.transaction('kv','readonly').objectStore('kv').get(key);g.onsuccess=()=>{db.close();res(g.result||null)};g.onerror=()=>{db.close();res(null)}}catch(e){db.close();res(null)}};
  });
}
async function showSummary(){
  let snap=null;try{snap=await idbGet('snapshot')}catch(e){}
  let msg={title:'Pendientes',body:'Abre la app para ver lo que te queda hoy.',n:null};
  try{if(PC&&snap&&Array.isArray(snap.tasks))msg=PC.morningSummary(snap.tasks,PC.todayStr())}catch(e){}
  /* iOS exige mostrar una notificación por cada push: si no, quita el permiso */
  const jobs=[self.registration.showNotification(msg.title,{body:msg.body,tag:'pend-resumen',renotify:true,icon:'icon-192.png',data:{url:'./'}})];
  /* el número del ícono nunca debe dejar colgado el aviso: se espera como máximo 3 segundos */
  if(snap&&snap.badge&&msg.n!=null&&self.navigator&&('setAppBadge' in self.navigator)){try{const b=msg.n?self.navigator.setAppBadge(msg.n):self.navigator.clearAppBadge();jobs.push(Promise.race([Promise.resolve(b).catch(()=>{}),new Promise(r=>setTimeout(r,3000))]))}catch(e){}}
  await Promise.all(jobs);
}
self.addEventListener('push',e=>{e.waitUntil(showSummary())});
self.addEventListener('notificationclick',e=>{
  e.notification.close();
  e.waitUntil(self.clients.matchAll({type:'window',includeUncontrolled:true}).then(list=>{for(const c of list){if('focus' in c)return c.focus()}return self.clients.openWindow?self.clients.openWindow('./'):null}));
});
