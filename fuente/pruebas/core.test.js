// Pruebas de la lógica pura (CORE). Correr desde la raíz: TZ=America/Santiago node fuente/pruebas/core.test.js
const fs=require('fs');
const file=process.argv[2]||require('path').join(__dirname,'..','pendientes.src.html');
const src=fs.readFileSync(file,'utf8').split('/*CORE-START*/')[1].split('/*CORE-END*/')[0];
const C=new Function(src+';return {parseWhen,classify,addDays,weekEnd,todayStr,'+
  '"leftToday":typeof leftToday==="function"?leftToday:null,"forToday":typeof forToday==="function"?forToday:null,"morningSummary":typeof morningSummary==="function"?morningSummary:null};')();
let fails=0,n=0;
const eq=(l,g,e)=>{n++;const ok=JSON.stringify(g)===JSON.stringify(e);if(!ok)fails++;console.log((ok?'OK   ':'FALLA')+' '+l+(ok?'':'  → obtuve '+JSON.stringify(g)+' esperaba '+JSON.stringify(e)))};
const W=(t,today)=>{const r=C.parseWhen(t,today);return r?r.when:null};
console.log('TZ',process.env.TZ,'| hoy real',C.todayStr());
// Casos del LEEME que siempre deben pasar
eq('"el jueves" desde domingo 27/9',W('prueba el jueves','2026-09-27'),{horizon:'dia',due:'2026-10-01'});
eq('"el jueves" un jueves = el siguiente',W('prueba el jueves','2026-10-01'),{horizon:'dia',due:'2026-10-08'});
eq('"el finde" (miércoles)',W('asado el finde','2026-09-23'),{horizon:'finde',due:'2026-09-27'});
eq('"el próximo finde"',W('asado el próximo finde','2026-09-23'),{horizon:'finde',due:'2026-10-04'});
eq('"pasado mañana"',W('llamar pasado mañana','2026-09-28'),{horizon:'dia',due:'2026-09-30'});
eq('"15/3" ya pasó → año siguiente',W('pagar el 15/3','2026-09-27'),{horizon:'dia',due:'2027-03-15'});
eq('"en la mañana" no es fecha',W('llamar en la mañana','2026-09-27'),null);
eq('cambio de hora 6/9: addDays',C.addDays('2026-09-05',1),'2026-09-06');
eq('cambio de hora 6/9: "mañana"',W('correr mañana','2026-09-05'),{horizon:'dia',due:'2026-09-06'});
eq('"control médico" es personal',C.classify('control médico',null,[]).category,'personal');
eq('"pagar el gym" es dinero',C.classify('pagar el gym',null,[]).category,'dinero');
// Número del ícono: lo que queda hoy (atrasadas + para hoy, finde incluido el sábado)
if(C.leftToday){
  const T=(o)=>Object.assign({done:false,due:null,horizon:'dia'},o);
  const tasks=[
    T({id:'late',due:'2026-09-25'}),                       // atrasada
    T({id:'hoy',due:'2026-09-28'}),                        // hoy (lunes)
    T({id:'manana',due:'2026-09-29'}),                     // futuro
    T({id:'algun',horizon:'algun',due:null}),              // sin fecha
    T({id:'hecha',due:'2026-09-28',done:true}),            // completada
    T({id:'finde',horizon:'finde',due:'2026-10-04'}),      // finde de esa semana
    T({id:'semana',horizon:'semana',due:'2026-10-04'}),    // esta semana (vence domingo)
  ];
  eq('lunes 28/9: atrasada + hoy',C.leftToday(tasks,'2026-09-28'),2);
  eq('viernes 2/10: finde aún no cuenta',C.leftToday(tasks,'2026-10-02'),3);   // late,hoy,manana (atrasadas)
  eq('sábado 3/10: cuenta el finde',C.leftToday(tasks,'2026-10-03'),4);
  eq('domingo 4/10: finde + semana',C.leftToday(tasks,'2026-10-04'),5);
  eq('lunes 5/10: todo lo vencido sigue contando',C.leftToday(tasks,'2026-10-05'),5);
  eq('lista vacía',C.leftToday([],'2026-09-28'),0);
  eq('sábado del cambio de hora 5/9 con finde al 6/9',C.leftToday([T({horizon:'finde',due:'2026-09-06'})],'2026-09-05'),1);
  eq('forToday sigue igual (finde el sábado)',C.forToday(T({horizon:'finde',due:'2026-10-04'}),'2026-10-03'),true);
  eq('forToday: día normal de mañana no es hoy',C.forToday(T({due:'2026-10-04'}),'2026-10-03'),false);
}else console.log('(sin leftToday todavía: se omiten esas pruebas)');

// Resumen de la mañana (lo que muestra la notificación)
if(C.morningSummary){
  const T=(o)=>Object.assign({done:false,due:null,horizon:'dia',kind:'tarea'},o);
  const M=(ts,d)=>C.morningSummary(ts,d);
  const base=[T({title:'Pagar la luz',due:'2026-09-25'}),T({title:'Ir al gym',due:'2026-09-28'}),T({title:'Control de Microeconomía',kind:'evaluacion',due:'2026-09-30'}),T({title:'Ordenar el clóset',horizon:'algun'}),T({title:'Hecha',due:'2026-09-28',done:true})];
  let r=M(base,'2026-09-28');
  eq('resumen: título con atrasadas',r.title,'Hoy te quedan 2 tareas · 1 atrasada');
  eq('resumen: cuerpo (atrasada primero + lo que viene)',r.body,'Pagar la luz\nIr al gym\nControl de Microeconomía en 2 días');
  eq('resumen: n = número del ícono',[r.n,r.late],[2,1]);
  eq('resumen: n coincide con leftToday',r.n,C.leftToday(base,'2026-09-28'));
  r=M([T({title:'Ir al gym',due:'2026-09-28'})],'2026-09-28');
  eq('resumen: singular',[r.title,r.body],['Hoy te queda 1 tarea','Ir al gym']);
  r=M([T({title:'A',due:'2026-09-20'}),T({title:'B',due:'2026-09-21'}),T({title:'C',due:'2026-09-28'}),T({title:'D',due:'2026-09-28'}),T({title:'E',due:'2026-09-28'})],'2026-09-28');
  eq('resumen: máximo 3 tareas y "y N más"',[r.title,r.body],['Hoy te quedan 5 tareas · 2 atrasadas','A\nB\nC\ny 2 más']);
  r=M([T({title:'Control de Micro',kind:'evaluacion',due:'2026-09-29'})],'2026-09-28');
  eq('resumen: nada hoy pero evaluación mañana',[r.title,r.body,r.n],['Nada para hoy','Control de Micro mañana.',0]);
  r=M([T({title:'Ordenar',horizon:'algun'})],'2026-09-28');
  eq('resumen: día despejado',[r.title,r.body],['Día despejado','No tienes nada para hoy.']);
  r=M([T({title:'Asado',horizon:'finde',due:'2026-10-04'})],'2026-10-03');
  eq('resumen: el sábado cuenta el finde',r.title,'Hoy te queda 1 tarea');
  r=M([T({title:'Leer',horizon:'semana',due:'2026-10-04'}),T({title:'Asado',horizon:'finde',due:'2026-10-04'})],'2026-10-04');
  eq('resumen: el domingo cuenta semana y finde',r.n,2);
  r=M([T({title:'Estudiar',due:'2026-09-28'}),T({title:'Solemne',kind:'evaluacion',due:'2026-09-28'})],'2026-09-28');
  eq('resumen: la evaluación de hoy va primero y no se repite abajo',r.body,'Solemne\nEstudiar');
  r=M([T({title:'Ir al gym',due:'2026-09-28'}),T({title:'Examen final',kind:'evaluacion',due:'2026-10-06'})],'2026-09-28');
  eq('resumen: evaluaciones a más de 7 días no aparecen',r.body,'Ir al gym');
  r=M([T({title:'Terminar   el informe de la práctica profesional con anexos',due:'2026-09-28'})],'2026-09-28');
  eq('resumen: títulos largos se cortan con …',r.body,'Terminar el informe de la práctica profes…');
  eq('resumen: lista vacía o nula',[M([],'2026-09-28').title,M(null,'2026-09-28').title],['Día despejado','Día despejado']);
}

console.log(n+' pruebas, '+fails+' fallas');process.exit(fails?1:0);
