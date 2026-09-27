# Pendientes: guía de desarrollo

Léela entera antes de tocar código. Complementa la skill **phone-app-builder** (estándar de calidad, pruebas y entrega). Esta guía tiene lo específico de Pendientes.

## Qué es y dónde vive

App de tareas de Esteban con post-its de colores por semana. Una sola fuente genera dos versiones:

| Versión | Dónde | Datos | Cómo se actualiza |
|---|---|---|---|
| Conectada a Claude (MODE `db`) | Artifact https://claude.ai/artifact/BNp85hY4xrpYtkhZciHisr | Base de datos del artifact (solo el dueño) | Publicar `dist/pendientes-claude.html` con la herramienta Artifact, pasando ese `url` y SIN `capabilities` (se mantienen las reglas de solo-dueño) |
| Web instalable (MODE `web`) | https://estebi-jr.github.io/Pendientes/ (repo `estebi-jr/Pendientes`) | localStorage de cada teléfono (su polola y amigos) | Esteban sube a GitHub los archivos cambiados que le entregues |

Existe también un artifact antiguo "Pendientes (local)" (https://claude.ai/artifact/YXcu1YeiFhywEhy17KNYoK). Está obsoleto: no lo actualices.

## Estructura del repositorio

```
index.html, sw.js, manifest.webmanifest, icon-*.png   ← versión web publicada (generada, no editar a mano)
fuente/pendientes.src.html   ← LA fuente. Todo cambio se hace aquí.
fuente/build.py              ← genera la web (raíz) y dist/pendientes-claude.html
fuente/sw.template.js        ← service worker (caché 'pend-core-<versión>')
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
7. Entrégale los archivos cambiados para GitHub, normalmente `index.html`, `sw.js` y `fuente/pendientes.src.html`, en un zip con la misma estructura de carpetas. Él los sube con **Add file > Upload files**, arrastrando el contenido del zip (la carpeta `fuente` incluida), y **Commit changes**.
8. Cuando te avise que subió, vuelve a clonar y compara el hash de `index.html` con tu build.

## Pruebas

- **Lógica pura:** está entre `/*CORE-START*/` y `/*CORE-END*/` (fechas, clasificador, parser de fechas en español). Pruébala en Node con `TZ=America/Santiago`, extrayendo ese bloque. Casos que siempre deben pasar: "el jueves" (siguiente jueves), "el finde" (horizonte `finde`, domingo de esa semana), "el próximo finde", "pasado mañana", "15/3" (año siguiente si ya pasó), "en la mañana" no es fecha, el cruce de horario del 6 de septiembre, "control médico" es personal y "pagar el gym" es dinero.
- **Automáticas:** `smoke_test.py` de la skill, con `web .` (la raíz del repo) y `claude dist/pendientes-claude.html`. Para la versión Claude, siembra datos con `--seed`: documentos `tasks/<id>` con el esquema de abajo, incluidas tareas hechas este mes (para el clavo) y atrasadas.
- **Flujos:** agregar escribiendo fecha en el texto, completar tocando y deslizando, posponer deslizando a la izquierda, deshacer, editar, pasar atrasadas a hoy, Muro, Mes con el clavo. Revisa las capturas en claro y oscuro.

## Lo que NUNCA se rompe

- **Claves de datos del navegador:** `pendientes:*` (local, theme, tip, install-hint, last-backup, cache, celebrated, tab). Si cambian, los datos de su polola y sus amigos quedan huérfanos.
- **Caché del service worker:** prefijo `pend-core-`.
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
  - `CORE` (fechas, clasificador, parser).
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
  - Inicio.
- **Redibujo:** solo reemplaza el DOM si el HTML cambió (`lastViewHTML`). Si agregas una animación, verifica que sobrevive al redibujo que dispara la base de datos.

## Historial de decisiones

- **Arquitectura:** artifact con base de datos para Esteban y chat. La versión web (GitHub Pages) es para compartir, porque las apps con base de datos no se pueden compartir fuera de su cuenta y guardar datos en artifacts es de pago.
- **Finde:** horizonte propio, agregado a pedido.
- **Guía de primera vez:** quitada de la versión Claude, porque volvía a aparecer al borrarse localStorage.
- **Clavo (clavapapeles):** en Mes, entre el calendario y la lista. Es idea de Esteban, a partir del video de post-its que inspiró la app.
- **Gestos:** deslizar a la derecha completa; a la izquierda pospone según el horizonte.
- **Dominio:** se decidió no usar dominio propio.
