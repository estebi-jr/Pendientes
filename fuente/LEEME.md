# Pendientes: guía de desarrollo

Léela entera antes de tocar código. Complementa la skill **phone-app-builder** (estándar de calidad, pruebas y entrega). Esta guía tiene lo específico de Pendientes.

## Qué es y dónde vive

App de tareas de Esteban con post-its de colores por semana. Una sola fuente genera dos versiones:

| Versión | Dónde | Datos | Cómo se actualiza |
|---|---|---|---|
| Conectada a Claude (MODE `db`) | Artifact https://claude.ai/artifact/BNp85hY4xrpYtkhZciHisr | Base de datos del artifact (solo el dueño) | Publicar `dist/pendientes-claude.html` con la herramienta Artifact, pasando ese `url` y SIN `capabilities` (se mantienen las reglas de solo-dueño) |
| Web instalable (MODE `web`) | https://estebi-jr.github.io/Pendientes/ (repo `estebi-jr/Pendientes`) | localStorage de cada teléfono (su polola y amigos) | Esteban sube a GitHub los archivos cambiados que le entregues |
| Servidor de avisos | Cloudflare Worker https://pendientes-push.esteban-lands.workers.dev (cuenta de Esteban, plan gratis) | KV `SUBS`: solo suscripciones push (dirección, hora, zona horaria) y las llaves VAPID. Nunca tareas | Esteban pega `servidor/pendientes-push.js` en **Edit Code** y **Deploy** |

Existe también un artifact antiguo "Pendientes (local)" (https://claude.ai/artifact/YXcu1YeiFhywEhy17KNYoK). Está obsoleto: no lo actualices.

## Estructura del repositorio

```
index.html, sw.js, manifest.webmanifest, icon-*.png   ← versión web publicada (generada, no editar a mano)
fuente/pendientes.src.html   ← LA fuente. Todo cambio se hace aquí.
fuente/build.py              ← genera la web (raíz) y dist/pendientes-claude.html
fuente/sw.template.js        ← service worker (caché 'pend-core-<versión>' + resumen de la mañana; build.py le copia el bloque CORE)
fuente/pruebas/              ← pruebas: core.test.js, worker.test.mjs, worker_server.mjs, avisos_flows.py
servidor/pendientes-push.js  ← servidor de avisos (Cloudflare Worker, sin dependencias)
fuente/icon.svg, icon.js     ← ícono (solo si cambia su diseño)
fuente/LEEME.md              ← esta guía
```

## Flujo de un cambio

1. `git clone --depth 1 https://github.com/estebi-jr/Pendientes.git` en `/home/claude/`.
2. Comprueba que el repo está al día: `python fuente/build.py` sin cambios no debe modificar `index.html` (revisa con `git status`). Si lo modifica, la fuente y lo publicado no coinciden: avísale a Esteban antes de seguir.
3. Edita `fuente/pendientes.src.html`.
4. `python fuente/build.py`.
5. Prueba (ver abajo). No entregues nada con fallas.
6. Publica `dist/pendientes-claude.html` en el artifact de Esteban (url de arriba).
7. Entrégale los archivos cambiados para GitHub, normalmente `index.html`, `sw.js` y `fuente/pendientes.src.html` (más `fuente/sw.template.js`, `fuente/build.py`, `fuente/pruebas/` o `servidor/` si cambiaron), en un zip con la misma estructura de carpetas. Si en el chat hay una herramienta de GitHub con permiso de escritura, Esteban autorizó usarla para subir los cambios directamente cuando sea más eficiente (en sep 2026 no había ninguna disponible). Si cambió `servidor/`, entrégale también ese archivo suelto para pegarlo en Cloudflare. Él los sube con **Add file > Upload files**, arrastrando el contenido del zip (la carpeta `fuente` incluida), y **Commit changes**.
8. Cuando te avise que subió, vuelve a clonar y compara el hash de `index.html` con tu build.

## Pruebas

- **Lógica pura:** está entre `/*CORE-START*/` y `/*CORE-END*/` (fechas, clasificador, parser de fechas en español). Pruébala en Node con `TZ=America/Santiago`, extrayendo ese bloque. Casos que siempre deben pasar: "el jueves" (siguiente jueves), "el finde" (horizonte `finde`, domingo de esa semana), "el próximo finde", "pasado mañana", "15/3" (año siguiente si ya pasó), "en la mañana" no es fecha, el cruce de horario del 6 de septiembre, "control médico" es personal y "pagar el gym" es dinero.
- **Scripts en el repo (córrelos desde la raíz, después de `build.py`):** `TZ=America/Santiago node fuente/pruebas/core.test.js` (lógica: fechas, parser, lo que queda hoy, resumen de la mañana), `node fuente/pruebas/worker.test.mjs` (servidor: validaciones, hora local por zona, JWT verificado con la llave pública, 410, prueba, desuscripción) y `python3 fuente/pruebas/avisos_flows.py . /tmp/capturas` (app + servidor real corriendo local).
- **Avisos en Playwright (lo que aprendimos):** simula la app instalada (`navigator.standalone`), `Notification`, `PushManager` y `navigator.setAppBadge`; redirige `pendientes-push.*.workers.dev` al Worker local (`worker_server.mjs`). Lanza Chromium con `TZ=America/Santiago` en el entorno (el service worker no recibe `timezone_id`) y crea el contexto con `timezone_id='America/Santiago'`. Chromium headless se cae al mostrar notificaciones reales y al llamar `setAppBadge` dentro del service worker: intercepta ambos dentro del worker y llama a `showSummary()` directamente.
- **Automáticas:** `smoke_test.py` de la skill, con `web .` (la raíz del repo) y `claude dist/pendientes-claude.html`. Para la versión Claude, siembra datos con `--seed`: documentos `tasks/<id>` con el esquema de abajo, incluidas tareas hechas este mes (para el clavo) y atrasadas.
- **Flujos:** agregar escribiendo fecha en el texto, completar tocando y deslizando, posponer deslizando a la izquierda, deshacer, editar, pasar atrasadas a hoy, Muro, Mes con el clavo. Revisa las capturas en claro y oscuro.

## Lo que NUNCA se rompe

- **Claves de datos del navegador:** `pendientes:*` (local, theme, tip, install-hint, last-backup, cache, celebrated, tab, badge, avisos-card, daily, push-key). Si cambian, los datos de su polola y sus amigos quedan huérfanos.
- **Caché del service worker:** prefijo `pend-core-`.
- **IndexedDB `pendientes`** (almacén `kv`, clave `snapshot`): copia mínima de lo pendiente que lee el service worker para el resumen. Nombre, almacén y clave no cambian.
- **Servidor de avisos:** nunca borres ni regeneres la entrada `vapid` del KV (si cambia la llave, todas las suscripciones dejan de servir). `PUSH_URL` en la fuente debe ser la URL del Worker, y `APP_ORIGINS` en el Worker debe incluir el origen de la app.
- **Esquema de la base de datos** (lo usan el chat y las instrucciones del proyecto):
  - `tasks/{id}`: title, category (universidad|deporte|ocio|trabajo|dinero|personal), subject (solo universidad), kind (tarea|evaluacion|entrega), horizon (dia|finde|semana|mes|algun), due (YYYY-MM-DD|null: día / domingo del finde / domingo de la semana / último día del mes / null), notes, created (fecha local, define el color, nunca cambia), createdAt, done, doneAt, source (app|claude), updatedAt.
  - `meta/config` {subjects}, `meta/learning` (solo la app), `archive/YYYY-MM` (completadas de más de 75 días).
  - Si un cambio toca el esquema, entrégale a Esteban las líneas nuevas para las instrucciones del proyecto.
- **Reglas del producto:**
  - El color del post-it depende de `created`: 1–7 azul, 8–14 verde, 15–21 amarillo, 22–fin rosa.
  - "+1 mes" aparece a los 28 días.
  - Las semanas van de lunes a domingo.
  - El finde vale sábado o domingo y pasa a atrasado el lunes.
  - Solo el papel tiene sombra. El color se reserva para las semanas y el rojo para lo atrasado; las categorías usan íconos, nunca color.
- **Versión Claude:** nada importante en localStorage (en iPhone se borra dentro del visor). La guía de primera vez solo existe en la versión web.

## Mapa de la fuente (`pendientes.src.html`)

- **CSS:** tokens de tema en 5 bloques, 2 claros y 3 oscuros, que deben coincidir entre sí (usa el chequeo de temas del smoke test). Después: header, filas, clavo, Muro, barra inferior, panel de agregar, modales, toast.
- **JS, en orden:**
  - `CORE` (fechas, lo que queda hoy con `forToday`/`leftToday`, resumen de la mañana con `morningSummary`, clasificador, parser). El service worker lleva una copia.
  - `APP`: constante `MODE`, íconos, estado `S`.
  - Modelo: `normTask`/`toDoc`.
  - Conexión y persistencia: `connect`, `subscribe`, `putTask`, `maybeArchive`.
  - Textos de fecha (`dueInfo`).
  - Render principal: `viewHoy`, `viewSemana`, `viewMes`, `viewMuro`.
  - Clavo: `spikeNotes`, `spikeSVG`, `spikeHTML`.
  - Acciones: completar, posponer, `haptic`.
  - Agregar rápido (`computeQuick`) y editar.
  - Ajustes y respaldo.
  - Eventos.
  - Deslizar filas.
  - App instalable.
  - Avisos: número en el ícono y resumen de la mañana (`syncBadge`, `syncSnapshot`, `enableDaily`, `dailyResync`, tarjeta "Nuevo" en Hoy, sección Avisos de Ajustes). Solo actúa en la web instalada.
  - Inicio.
- **Redibujo:** solo reemplaza el DOM si el HTML cambió (`lastViewHTML`). Si agregas una animación, verifica que sobrevive al redibujo que dispara la base de datos.

## Servidor de avisos (Cloudflare Worker)

- **Qué hace:** guarda suscripciones push y, con un Cron Trigger cada hora (`0 * * * *`, en UTC), despierta a los teléfonos cuya hora local coincide con la elegida. El push va **sin contenido**; el service worker del teléfono arma el resumen con la copia en IndexedDB.
- **Rutas:** `GET /` (estado: `listo`), `GET /setup` (crea las llaves VAPID una sola vez; es idempotente), `GET /key`, `POST /subscribe`, `POST /unsubscribe`, `POST /test` (re-registra y manda una prueba a los 6 segundos). Los POST solo se aceptan desde el origen de la app.
- **Configuración en Cloudflare:** namespace KV enlazado con nombre de variable `SUBS`, el Cron Trigger y haber abierto `/setup` una vez.
- **Para cambiarlo:** edita `servidor/pendientes-push.js`, corre `worker.test.mjs` y `avisos_flows.py`, y Esteban lo pega en **Edit Code** y **Deploy**. Comprueba con `GET /` que responde `listo: true`.
- **Límites del plan gratis:** 100.000 solicitudes al día, 10 ms de CPU por ejecución, 50 subrequests por ejecución (el Worker manda hasta 45 avisos por hora; sobra para el grupo actual) y 5 Cron Triggers por cuenta. Si falla una ejecución, Cloudflare no la reintenta.

## Historial de decisiones

- **Arquitectura:** artifact con base de datos para Esteban y chat. La versión web (GitHub Pages) es para compartir, porque las apps con base de datos no se pueden compartir fuera de su cuenta y guardar datos en artifacts es de pago.
- **Finde:** horizonte propio, agregado a pedido.
- **Guía de primera vez:** quitada de la versión Claude, porque volvía a aparecer al borrarse localStorage.
- **Clavo (clavapapeles):** en Mes, entre el calendario y la lista. Es idea de Esteban, a partir del video de post-its que inspiró la app.
- **Gestos:** deslizar a la derecha completa; a la izquierda pospone según el horizonte.
- **Dominio:** se decidió no usar dominio propio.
- **Widgets de iPhone (sep 2026):** no existen para apps web; solo apps nativas con WidgetKit (revisado con iOS 27 y Safari 27). App nativa descartada: USD 99 al año y requiere Mac. Todo lo que se agregue debe ser gratis. En su lugar, en este orden: 1) número en el ícono, 2) resumen diario por notificación.
- **Número en el ícono (sep 2026):** muestra lo que queda hoy = atrasadas + para hoy (el finde cuenta desde el sábado), la misma regla del anillo del encabezado (`leftToday`, un solo lugar). En iOS va amarrado al permiso de notificaciones, que solo se puede pedir con un toque: tarjeta "Nuevo" en Hoy (una sola vez, después de la guía de primera vez) e interruptor en Ajustes › Avisos. Si el permiso se rechaza, no se insiste: se explica cómo activarlo en Ajustes del iPhone. Sin servidor, el número solo se recalcula con la app abierta (al usarla, al volver a ella y a medianoche). Solo versión web instalada; la versión Claude se ve igual que antes.
- **Resumen de la mañana (sep 2026):** Cloudflare Worker gratis (sin tarjeta). El servidor solo guarda la dirección de notificaciones, la hora y la zona horaria; nunca ve tareas. El push va sin contenido (Apple lo permite) y el service worker arma el resumen con la misma lógica de la app: título con lo que queda hoy y las atrasadas, hasta 3 tareas, y la próxima evaluación o entrega de la semana. En iOS cada push debe mostrar una notificación (no hay push silencioso), así que los días sin nada dice "Día despejado". Hora a elección entre 6:00 y 11:00 (por defecto 8:00). "Probar ahora" espera 6 segundos para alcanzar a bloquear el teléfono. Apple pide llamar a `subscribe` apenas se toca el botón, por eso la app deja precargada la llave del servidor. Al abrir la app se confirma la suscripción y, una vez por semana, se le recuerda al servidor; si Apple responde 404 o 410, el servidor la borra. El JWT se reutiliza 12 horas (Apple pide no renovarlo más de una vez por hora). El número del ícono, dentro del service worker, espera como máximo 3 segundos para no dejar colgado el aviso.
- **Una sola tarjeta para los dos avisos:** el número en el ícono no alcanzó a publicarse solo, así que la tarjeta "Nuevo: tu día en la pantalla bloqueada" activa ambos con un solo permiso. Si el teléfono no tiene push, ofrece solo el número.
