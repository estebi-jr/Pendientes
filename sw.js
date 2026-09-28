/* Pendientes: funciona sin internet. La versión cambia sola en cada actualización. */
const CORE='pend-core-8d4c09a3';
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
const CATS={
  universidad:{name:'Universidad',icon:'cap'},
  deporte:{name:'Deporte',icon:'glove'},
  ocio:{name:'Ocio',icon:'pad'},
  trabajo:{name:'Trabajo',icon:'case'},
  dinero:{name:'Dinero',icon:'money'},
  personal:{name:'Personal',icon:'person'}
};
const CAT_ORDER=['universidad','deporte','ocio','trabajo','dinero','personal'];
const KINDS={tarea:'Tarea',evaluacion:'Evaluación',entrega:'Entrega'};
const DAYS_LONG=['domingo','lunes','martes','miércoles','jueves','viernes','sábado'];
const DAYS_SHORT=['dom','lun','mar','mié','jue','vie','sáb'];
const MONTHS=['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'];
const MONTHS_SHORT=['ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic'];
const WEEK_COLOR=['','azul','verde','amarillo','rosa'];
const WEEK_RANGE=['','1–7','8–14','15–21','22–fin'];

/* ---- fechas (siempre en hora local, a mediodía para esquivar cambios de horario) ---- */
function pad2(n){return (n<10?'0':'')+n}
function ymd(d){return d.getFullYear()+'-'+pad2(d.getMonth()+1)+'-'+pad2(d.getDate())}
function parseYMD(s){const p=String(s).split('-');return new Date(+p[0],+p[1]-1,+p[2],12,0,0)}
function isYMD(s){return typeof s==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(s)&&ymd(parseYMD(s))===s}
function todayStr(){return ymd(new Date())}
function addDays(s,n){const d=parseYMD(s);d.setDate(d.getDate()+n);return ymd(d)}
function diffDays(a,b){return Math.round((parseYMD(b)-parseYMD(a))/864e5)}
function dow(s){return parseYMD(s).getDay()}
function weekStart(s){return addDays(s,-((dow(s)+6)%7))}
function weekEnd(s){return addDays(weekStart(s),6)}
function monthStart(s){return s.slice(0,8)+'01'}
function monthEnd(s){const d=parseYMD(s);return ymd(new Date(d.getFullYear(),d.getMonth()+1,0,12))}
function addMonths(s,n){const d=parseYMD(s);return ymd(new Date(d.getFullYear(),d.getMonth()+n,1,12))}
function postWeek(s){const day=+String(s).slice(8,10);return day<=7?1:day<=14?2:day<=21?3:4}
function localDate(iso){const d=new Date(iso);return isNaN(d)?null:ymd(d)}
function fmtShort(s){const d=parseYMD(s);return d.getDate()+' '+MONTHS_SHORT[d.getMonth()]}
function fmtDay(s){const d=parseYMD(s);return DAYS_SHORT[d.getDay()]+' '+d.getDate()+' '+MONTHS_SHORT[d.getMonth()]}
function fmtLong(s){const d=parseYMD(s);return DAYS_LONG[d.getDay()]+' '+d.getDate()+' de '+MONTHS[d.getMonth()]}
function cap1(s){s=String(s||'');return s?s.charAt(0).toUpperCase()+s.slice(1):s}

function whenFor(key,today){
  switch(key){
    case 'hoy':return {horizon:'dia',due:today};
    case 'manana':return {horizon:'dia',due:addDays(today,1)};
    case 'finde':return {horizon:'finde',due:weekEnd(today)};
    case 'semana':return {horizon:'semana',due:weekEnd(today)};
    case 'proxsemana':return {horizon:'semana',due:addDays(weekEnd(today),7)};
    case 'mes':return {horizon:'mes',due:monthEnd(today)};
    case 'proxmes':return {horizon:'mes',due:monthEnd(addMonths(today,1))};
    default:return {horizon:'algun',due:null};
  }
}
function whenKey(w,today){
  if(!w||w.horizon==='algun'||!w.due)return 'algun';
  if(w.horizon==='dia'){if(w.due===today)return 'hoy';if(w.due===addDays(today,1))return 'manana';return 'fecha'}
  if(w.horizon==='finde')return w.due===weekEnd(today)?'finde':'fecha';
  if(w.horizon==='semana'){if(w.due===weekEnd(today))return 'semana';if(w.due===addDays(weekEnd(today),7))return 'proxsemana';return 'fecha'}
  if(w.horizon==='mes'){if(w.due===monthEnd(today))return 'mes';if(w.due===monthEnd(addMonths(today,1)))return 'proxmes';return 'fecha'}
  return 'fecha';
}
function whenText(w,today){
  if(!w||w.horizon==='algun'||!w.due)return 'sin fecha';
  if(w.horizon==='dia'){const dd=diffDays(today,w.due);if(dd===0)return 'hoy';if(dd===1)return 'mañana';if(dd===2)return 'pasado mañana';return fmtDay(w.due)}
  if(w.horizon==='finde'){if(w.due===weekEnd(today))return 'el finde';if(w.due===addDays(weekEnd(today),7))return 'el próximo finde';return 'el finde del '+fmtShort(addDays(w.due,-1))}
  if(w.horizon==='semana'){if(w.due===weekEnd(today))return 'esta semana';if(w.due===addDays(weekEnd(today),7))return 'la próxima semana';return 'la semana del '+fmtShort(weekStart(w.due))}
  if(w.horizon==='mes'){if(w.due.slice(0,7)===today.slice(0,7))return 'este mes';return MONTHS[parseYMD(w.due).getMonth()]}
  return '';
}

/* ---- lo que queda hoy (anillo del encabezado y número del ícono) ---- */
function forToday(t,today){return !!t.due&&(t.due===today||(t.horizon==='finde'&&t.due===addDays(today,1)))}
function leftToday(tasks,today){let n=0;for(const t of tasks)if(t&&!t.done&&t.due&&(t.due<=today||forToday(t,today)))n++;return n}
/* ---- resumen de la mañana (lo arma el service worker al llegar el aviso, con los datos del teléfono) ---- */
function clipText(s,n){s=String(s||'').replace(/\s+/g,' ').trim();return s.length>n?s.slice(0,n-1).trimEnd()+'…':s}
function inDaysText(d){return d===1?'mañana':'en '+d+' días'}
function morningSummary(tasks,today){
  const pend=(tasks||[]).filter(t=>t&&!t.done),byDue=(a,b)=>a.due<b.due?-1:a.due>b.due?1:0,rank=k=>k==='evaluacion'?0:k==='entrega'?1:2;
  const late=pend.filter(t=>t.due&&t.due<today).sort(byDue);
  const hoy=pend.filter(t=>forToday(t,today)).sort((a,b)=>rank(a.kind)-rank(b.kind));
  const next=pend.filter(t=>t.kind!=='tarea'&&t.due&&t.due>today&&!forToday(t,today)&&diffDays(today,t.due)<=7).sort(byDue)[0];
  const nextLine=next?clipText(next.title,48)+' '+inDaysText(diffDays(today,next.due)):'';
  const n=late.length+hoy.length;
  if(!n)return {n:0,late:0,title:next?'Nada para hoy':'Día despejado',body:next?nextLine+'.':'No tienes nada para hoy.'};
  let title=n===1?'Hoy te queda 1 tarea':'Hoy te quedan '+n+' tareas';
  if(late.length)title+=' · '+late.length+(late.length===1?' atrasada':' atrasadas');
  const list=late.concat(hoy),lines=list.slice(0,3).map(t=>clipText(t.title,42));
  if(list.length>3)lines.push('y '+(list.length-3)+' más');
  if(next)lines.push(nextLine);
  return {n,late:late.length,title,body:lines.join('\n')};
}

/* ---- normalización ---- */
function norm(s){return String(s||'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]+/g,' ').trim()}
const STOP=new Set('de del la el los las un una unos unas y o a al en con por para que mi mis tu tus su sus lo le les se me te nos este esta estos estas ese esa eso hoy manana pasado semana mes lunes martes miercoles jueves viernes sabado domingo hacer ver ir tener dar sacar poner ya mas muy como sin sobre entre hasta desde antes despues fin tengo hay'.split(' '));
function tokens(n){return n.split(' ').filter(w=>w.length>=3&&!STOP.has(w)&&!/^\d+$/.test(w))}

/* ---- clasificador de categorías ---- */
const RULES=[
 ['universidad',4,'trabajo grupal|trabajo en grupo|grupo de trabajo|trabajo final|trabajo de investigacion|toma de ramos|inscripcion de ramos|control de lectura|guia de ejercicios'],
 ['universidad',3,'prueba|control|examen|solemne|certamen|interrogacion|quiz|estudiar|estudio|repasar|repaso|ayudantia|catedra|webcursos|uai|universidad|facultad|semestre|tesis|seminario|laboratorio|matricula|arancel'],
 ['universidad',2,'clase|ramo|curso|profe|profesor|profesora|apuntes|resumen|materia|lectura|taller|disertacion|exposicion|informe|ensayo|paper|entrega|entregar|nota|biblioteca|guia|ejercicios|la u|titulo|malla|pauta|rubrica'],
 ['universidad',1,'tarea|leer|presentacion|ppt|sala'],
 ['deporte',3,'gym|gimnasio|entrenar|entreno|entrenamiento|muay thai|muay|thai|k1|kickboxing|kick boxing|mma|bjj|jiu jitsu|jiujitsu|boxeo|sparring|pesas|cardio|trotar|trote|correr|running|natacion|nadar|pelea|pesaje|corte de peso|pichanga|futbolito|padel|tenis|hacer ejercicio|dia de pierna'],
 ['deporte',2,'guantes|vendas|bucal|protector bucal|canilleras|creatina|proteina|suplementos|estirar|estiramiento|elongar|elongacion|movilidad|yoga|abdominales|core|dominadas|sentadilla|press banca|peso muerto|kine|kinesiologo|fisioterapia|bicicleta|bici|torneo|competencia|rutina|dieta|nutricionista|macros|futbol|saco|pierna|pecho|brazos|hombros|shadow'],
 ['ocio',4,'ver partido|ver el partido|ver pelicula|ver la pelicula'],
 ['ocio',3,'carrete|asado|concierto|recital|festival|cine|pelicula|peli|serie|netflix|ps5|playstation|xbox|nintendo|videojuego|gaming|fifa|estadio|ski|esquiar|snowboard|vacaciones|paseo|panorama|previa'],
 ['ocio',2,'jugar|juego|partido|salir|junta|juntarse|fiesta|bar|restaurant|restaurante|musica|playlist|viaje|viajar|libro|cumpleanos|cumple'],
 ['trabajo',3,'pega|oficina|cliente|jefe|jefa|entrevista|practica profesional|curriculum|cv|linkedin|postular|postulacion|freelance|turno'],
 ['trabajo',2,'trabajo|reunion|meeting|practica|propuesta|proyecto|planilla|excel|mail|correo|deadline|reporte|kpi|contrato|pitch|startup|emprendimiento'],
 ['dinero',4,'pagar|pago|pague|transferir|transferencia|transferirle|deuda|cobrar|cobro|cobrarle|devolver plata|prestar plata'],
 ['dinero',3,'banco|plata|luca|lucas|prestamo|arriendo|dividendo|cuota|presupuesto|ahorrar|ahorro|invertir|inversion|sueldo|impuestos|sii|reembolso|rendicion|rendir gastos|finanzas personales|tarjeta de credito|credito'],
 ['dinero',2,'tarjeta|boleta|factura|gasto|seguro|patente|tag|cotizar|cotizacion|vender|venta|cuenta de luz|cuenta del agua|cuenta de agua|cuenta del gas|cuentas|cuenta|acciones|cripto'],
 ['dinero',1,'comprar|compra|bencina|finanzas|precio'],
 ['personal',5,'control medico|hora medica|examen de sangre|examenes de sangre|examen medico|examenes medicos|control dental|control con el dentista|control con el doctor|control con la doctora'],
 ['personal',3,'medico|doctor|doctora|dentista|dermatologo|dermatologa|oftalmologo|clinica|farmacia|remedio|remedios|peluqueria|barberia|corte de pelo|cortarme el pelo|tramite|notaria|registro civil|carnet|pasaporte|licencia de conducir|revision tecnica|mantencion del auto|veterinario|pedir hora|psicologo|psicologa|terapia'],
 ['personal',2,'lavar|ropa|limpiar|ordenar|pieza|casa|depto|departamento|supermercado|lider|jumbo|unimarc|tottus|cocinar|mama|papa|familia|abuela|abuelo|hermano|hermana|polola|pololo|regalo|llamar|skincare|dormir|meditar|auto|perro|gato|mudanza|arreglar']
];
let RULE_LIST=null,BASE_WORD=null;
function ruleList(){
  if(RULE_LIST)return RULE_LIST;
  const out=[],seen=new Set();
  for(const [cat,w,src] of RULES){
    for(const raw of src.split('|')){
      const k=norm(raw);if(!k)continue;
      const vs=[k];
      if(k.indexOf(' ')<0){if(!/s$/.test(k))vs.push(k+'s');if(/[^aeious]$/.test(k))vs.push(k+'es')}
      for(const v of vs){if(seen.has(v))continue;seen.add(v);out.push({cat,w,k:v})}
    }
  }
  out.sort((a,b)=>b.k.length-a.k.length||b.w-a.w);
  RULE_LIST=out;return out;
}
function baseWordCat(w){
  if(!BASE_WORD){BASE_WORD={};for(const r of ruleList()){if(r.k.indexOf(' ')<0&&!(r.k in BASE_WORD))BASE_WORD[r.k]=r.cat}}
  return BASE_WORD[w]||null;
}
function matchRules(n){
  let s=' '+n+' ';const scores={};
  for(const r of ruleList()){
    const needle=' '+r.k+' ';let i=s.indexOf(needle);
    while(i!==-1){
      scores[r.cat]=(scores[r.cat]||0)+r.w;
      s=s.slice(0,i+1)+'#'.repeat(r.k.length)+s.slice(i+1+r.k.length);
      i=s.indexOf(needle,i+1);
    }
  }
  return scores;
}
function detectSubject(n,subjects){
  if(!subjects||!subjects.length||!n)return null;
  const s=' '+n+' ';let best=null,bl=0;
  for(const name of subjects){const k=norm(name);if(k&&s.indexOf(' '+k+' ')>=0&&k.length>bl){best=name;bl=k.length}}
  if(best)return best;
  const firsts={};
  for(const name of subjects){const w=norm(name).split(' ').find(x=>x.length>=5&&!STOP.has(x));if(w)(firsts[w]=firsts[w]||[]).push(name)}
  for(const w in firsts){if(firsts[w].length===1&&s.indexOf(' '+w+' ')>=0)return firsts[w][0]}
  return null;
}
function detectKind(n){
  if(/(^| )(medic[oa]s?|doctor[a]?|dentista|sangre|clinica|dental|kine|kinesiologo|dermatolog[oa])( |$)/.test(n))return 'tarea';
  if(/(^| )(estudiar|estudio|repasar|repaso|preparar|resumir|resumen|leer|practicar)( |$)/.test(n))return 'tarea';
  if(/(^| )(pruebas?|control(es)?|examen(es)?|solemnes?|certamen(es)?|quiz|interrogacion(es)?|disertacion|exposicion)( |$)/.test(n))return 'evaluacion';
  if(/(^| )(entregas?|entregar|deadline|informe final|ensayo final|trabajo final)( |$)/.test(n))return 'entrega';
  return 'tarea';
}
function classify(title,learning,subjects){
  const n=norm(title);
  const res={category:'personal',confident:false,subject:null,kind:'tarea',scores:{}};
  if(!n)return res;
  const scores=matchRules(n);
  const subj=detectSubject(n,subjects);
  if(subj)scores.universidad=(scores.universidad||0)+5;
  const lt=(learning&&learning.tokens)||{};
  for(const w of tokens(n)){const e=lt[w];if(!e)continue;for(const c in e){if(CATS[c])scores[c]=(scores[c]||0)+3*Math.min(3,e[c]|0)}}
  let best='personal',bs=0;
  for(const c of CAT_ORDER){const v=scores[c]||0;if(v>bs){best=c;bs=v}}
  const ph=learning&&learning.phrases&&learning.phrases[n];
  if(ph&&CATS[ph]){best=ph;bs=99}
  res.category=best;res.confident=bs>0;res.scores=scores;res.kind=detectKind(n);
  res.subject=best==='universidad'?subj:null;
  return res;
}
function learnCorrection(learning,title,fromCat,toCat){
  const n=norm(title);
  if(!n||!CATS[toCat]||fromCat===toCat)return false;
  learning.tokens=learning.tokens||{};learning.phrases=learning.phrases||{};
  delete learning.phrases[n];learning.phrases[n]=toCat;
  let toks=tokens(n);
  const informative=toks.filter(w=>baseWordCat(w)!==fromCat);
  if(informative.length)toks=informative;
  for(const w of toks){
    const e=learning.tokens[w]||(learning.tokens[w]={});
    e[toCat]=Math.min(9,(e[toCat]||0)+1);
    if(e[fromCat]){e[fromCat]--;if(e[fromCat]<=0)delete e[fromCat]}
  }
  const pk=Object.keys(learning.phrases);if(pk.length>300)pk.slice(0,pk.length-300).forEach(k=>delete learning.phrases[k]);
  const tk=Object.keys(learning.tokens);if(tk.length>600)tk.slice(0,tk.length-600).forEach(k=>delete learning.tokens[k]);
  return true;
}

/* ---- fechas en lenguaje natural ---- */
const RX_WD='lunes|martes|mi[eé]rcoles|jueves|viernes|s[aá]bado|domingo';
const RX_MO='enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|setiembre|octubre|noviembre|diciembre';
const RX_MOS='ene|feb|mar|abr|may|jun|jul|ago|sept|sep|oct|nov|dic';
const B0='(?<![\\p{L}\\p{N}])',B1='(?![\\p{L}\\p{N}])';
const PRE='(?:(?:para|hasta|antes\\s+del?|a\\s+m[aá]s\\s+tardar)\\s+)?(?:(?:el|la|este|esta|del|al)\\s+)?';
function wdIndex(w){return ['domingo','lunes','martes','miercoles','jueves','viernes','sabado'].indexOf(norm(w))}
function monIndex(m){
  const n=norm(m);
  let i=['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'].indexOf(n);
  if(i<0&&n==='setiembre')i=8;
  if(i<0)i=['ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic'].indexOf(n==='sept'?'sep':n);
  return i;
}
function mkDate(y,m,d){const dt=new Date(y,m,d,12);if(dt.getMonth()!==m||dt.getDate()!==d)return null;return ymd(dt)}
function resolveDM(d,m,y,today){
  if(y!=null){if(y<100)y+=2000;return mkDate(y,m,d)}
  const ty=+today.slice(0,4);let s=mkDate(ty,m,d);if(!s)return null;
  if(diffDays(today,s)<-30)s=mkDate(ty+1,m,d);
  return s;
}
function dayOfMonthAhead(d,today){
  let due=null;
  if(d>=+today.slice(8,10))due=mkDate(+today.slice(0,4),+today.slice(5,7)-1,d);
  if(!due){const nm=addMonths(today,1);due=mkDate(+nm.slice(0,4),+nm.slice(5,7)-1,d)}
  return due;
}
const DATE_PATTERNS=[
 {re:new RegExp(B0+PRE+'(?:(?:'+RX_WD+')\\s+)?(\\d{1,2})\\/(\\d{1,2})(?:\\/(\\d{2,4}))?'+B1,'iu'),
  fn:(m,t)=>{const due=resolveDM(+m[1],+m[2]-1,m[3]!=null?+m[3]:null,t);return due&&{horizon:'dia',due}}},
 {re:new RegExp(B0+PRE+'(\\d{4})-(\\d{1,2})-(\\d{1,2})'+B1,'iu'),
  fn:m=>{const due=mkDate(+m[1],+m[2]-1,+m[3]);return due&&{horizon:'dia',due}}},
 {re:new RegExp(B0+PRE+'(\\d{1,2})-(\\d{1,2})-(\\d{4})'+B1,'iu'),
  fn:m=>{const due=mkDate(+m[3],+m[2]-1,+m[1]);return due&&{horizon:'dia',due}}},
 {re:new RegExp(B0+PRE+'(?:(?:'+RX_WD+')\\s+)?(\\d{1,2})\\s+(?:de\\s+)?('+RX_MO+'|'+RX_MOS+')\\.?(?:\\s+(?:de\\s+|del\\s+)?(\\d{4}))?'+B1,'iu'),
  fn:(m,t)=>{const mi=monIndex(m[2]);if(mi<0)return null;const due=resolveDM(+m[1],mi,m[3]?+m[3]:null,t);return due&&{horizon:'dia',due}}},
 {re:new RegExp(B0+PRE+'(?:'+RX_WD+')\\s+(\\d{1,2})'+B1+'(?!\\s*\\/)','iu'),
  fn:(m,t)=>{const d=+m[1];if(d<1||d>31)return null;const due=dayOfMonthAhead(d,t);return due&&{horizon:'dia',due}}},
 {re:new RegExp(B0+'(?:(?:para|hasta|antes)\\s+)?(?:el|del)\\s+(\\d{1,2})'+B1+'(?!\\s*[\\/:.,]\\s*\\d)(?!\\s+al\\s+\\d)(?!\\s+de\\s+(?!(?:'+RX_MO+'|'+RX_MOS+')'+B1+'))','iu'),
  fn:(m,t)=>{const d=+m[1];if(d<1||d>31)return null;const due=dayOfMonthAhead(d,t);return due&&{horizon:'dia',due}}},
 {re:new RegExp(B0+'(?:para\\s+)?pasado\\s+ma[ñn]ana'+B1,'iu'),fn:(m,t)=>({horizon:'dia',due:addDays(t,2)})},
 {re:new RegExp(B0+'(?<!(?:la|esta|una|de|en|por)\\s+)(?:para\\s+)?ma[ñn]ana'+B1,'iu'),fn:(m,t)=>({horizon:'dia',due:addDays(t,1)})},
 {re:new RegExp(B0+'(?:para\\s+)?hoy(?:\\s+d[ií]a)?'+B1,'iu'),fn:(m,t)=>({horizon:'dia',due:t})},
 {re:new RegExp(B0+'(?:(?:para|durante|en)\\s+)?(?:la\\s+)?(?:pr[oó]xima\\s+semana|semana\\s+(?:que\\s+viene|pr[oó]xima))'+B1,'iu'),fn:(m,t)=>({horizon:'semana',due:addDays(weekEnd(t),7)})},
 {re:new RegExp(B0+'(?:(?:para|durante|en)\\s+)?(?:esta|la)\\s+semana'+B1,'iu'),fn:(m,t)=>({horizon:'semana',due:weekEnd(t)})},
 {re:new RegExp(B0+'(?:(?:para|durante|en)\\s+)?(?:el\\s+)?(?:pr[oó]ximo\\s+mes|mes\\s+(?:que\\s+viene|pr[oó]ximo))'+B1,'iu'),fn:(m,t)=>({horizon:'mes',due:monthEnd(addMonths(t,1))})},
 {re:new RegExp(B0+'(?:(?:para|durante|en|antes\\s+de|a)\\s+)?(?:(?:este|el)\\s+mes|fin(?:es)?\\s+de\\s+mes)'+B1,'iu'),fn:(m,t)=>({horizon:'mes',due:monthEnd(t)})},
 {re:new RegExp(B0+'(?:(?:para|este|el)\\s+)?(?:fin\\s+de\\s+semana|finde)'+B1,'iu'),fn:(m,t)=>({horizon:'finde',due:weekEnd(t)})},
 {re:new RegExp(B0+'(?:(?:para|el)\\s+)?(?:pr[oó]ximo\\s+(?:finde|fin\\s+de\\s+semana)|(?:finde|fin\\s+de\\s+semana)\\s+(?:que\\s+viene|pr[oó]ximo))'+B1,'iu'),fn:(m,t)=>({horizon:'finde',due:addDays(weekEnd(t),7)})},
 {re:new RegExp(B0+'(?:(?:para|hasta|antes\\s+del?)\\s+)?(?:(el|este|esta|del|al)\\s+)?(?:(pr[oó]xim[oa])\\s+)?('+RX_WD+')(?:\\s+(pr[oó]xim[oa]|que\\s+viene))?'+B1,'iu'),
  fn:(m,t)=>{const target=wdIndex(m[3]);if(target<0)return null;let delta=(target-dow(t)+7)%7;const art=norm(m[1]||'');const nx=!!(m[2]||m[4]);if(delta===0)delta=((art==='este'||art==='esta')&&!nx)?0:7;return {horizon:'dia',due:addDays(t,delta)}}}
];
function cleanTitle(s){
  s=String(s).replace(/\s+/g,' ').trim();
  let prev;
  do{prev=s;
    s=s.replace(/^[\s,;:.\-–—]+|[\s,;:\-–—]+$/g,'');
    s=s.replace(/\s+(?:para|el|la|de|del|al|hasta|antes|este|esta|y|a|en|que|por)$/i,'');
    s=s.replace(/^(?:para|hasta|y)\s+/i,'');
  }while(s!==prev);
  return s.replace(/\s+([,.;:])/g,'$1');
}
function parseWhen(text,today){
  const cands=[];
  for(const p of DATE_PATTERNS){
    const m=p.re.exec(text);if(!m)continue;
    const r=p.fn(m,today);if(!r)continue;
    cands.push({start:m.index,end:m.index+m[0].length,when:r,match:m[0]});
  }
  if(!cands.length)return null;
  cands.sort((a,b)=>a.start-b.start||(b.end-b.start)-(a.end-a.start));
  const c=cands[0];
  const title=cleanTitle(text.slice(0,c.start)+' '+text.slice(c.end));
  return {when:c.when,match:c.match.trim(),title};
}
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
