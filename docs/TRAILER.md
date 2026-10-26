# Teaser web de Pendientes (portafolio)

Video en loop para la página personal de Esteban, más capturas en bruto de la app. Todo sale de la app real
(`index.html` de la raíz, versión web) manejada cuadro a cuadro con Playwright; nada se redibuja de memoria.

## Versiones

| Versión | Fecha | Qué cambió |
|---|---|---|
| v0 | 26 oct 2026 | Borrador: Muro → Hoy → anotar → completar → Mes → Muro. Mostraba funciones, no el problema. |
| v1 | 26 oct 2026 | Guion nuevo centrado en el problema real (postergar, cosas sin hacer, el teléfono que distrae): el loop es **un día**, de aviso de la mañana a aviso de la mañana siguiente. |

## Especificación

- MP4 1920×1080, 30 fps, **16 s (480 cuadros)**, H.264 high, crf 14, yuv420p, `+faststart`, **sin pista de audio**.
- Loop perfecto: el último cuadro empalma con el primero sin fundido ni corte (ver "Control de calidad").
- Sin texto añadido en pantalla: lo único escrito es la propia UI (la app y la pantalla bloqueada).
- Capturas: `pendientes-1.png` … `pendientes-5.png`, iPhone 15 Pro Max (430×932 a 3× = 1290×2796), sin marco.

## Guion v1 (el loop es un día)

| Tiempo | Qué se ve | Qué cuenta |
|---|---|---|
| 0,0–1,4 s | Teléfono bloqueado a las 8:00 flotando sobre un fondo lleno de post-its; cinco tienen cinta roja y sello (lo postergado). La cámara se acerca al aviso «Hoy te quedan 3 tareas · 1 atrasada». | El teléfono no te distrae: te dice qué te queda hoy. |
| 1,4–2,1 s | Toque en el aviso; la app se abre desde el aviso (como en iOS), en Hoy. | Un toque y estás en tu día. |
| 2,1–4,4 s | Paneo hasta la atrasada: «Pagar la cuenta de la luz · Hace 6 días · +1 mes». Se completa deslizando. Los post-its rojos del fondo se van flotando. | La app no deja que lo postergado se esconda. |
| 4,8–7,9 s | Anotar escribiendo «Prueba de Estadística el jueves»: la app entiende fecha (jue 29 oct), tipo (evaluación) y ramo (Estadística). | Anotar cuesta 2 segundos, así nada queda en la cabeza. |
| 8,2–10,0 s | Se completa lo de hoy (toque y deslizar). El anillo llega a 4/4 y el fondo se despeja. | Avanzas y lo ves. |
| 10,0–11,4 s | «¡Listo por hoy!». El fondo se aclara. | La recompensa: el día despejado. |
| 11,6–13,4 s | Mes: el clavo con 24 post-its, más que los 18 de septiembre. | Eres más productivo que el mes pasado. |
| 13,5–14,2 s | La pantalla bloqueada baja y tapa la app (el día terminó). | Sueltas el teléfono. |
| 13,6–16,0 s | Vuelven los post-its (un día nuevo) y llega el aviso de la mañana siguiente, que se asienta en el cuadro 0. | Mañana, lo mismo: el hábito. |

Movimiento continuo en todo el loop: el teléfono se mece con una rotación 3D periódica (período = 16 s) y los
post-its flotan con funciones periódicas, así que todo vuelve exacto al cuadro 0.

## Qué es real y qué es compuesto

- **Real (sale del código de la app):** cada pantalla de la app (capturas de `index.html` con datos de ejemplo), los
  toques y gestos (eventos reales del mouse sobre la app), el texto del aviso (se calcula con `morningSummary` del
  bloque `CORE` del `index.html`, el mismo que usa el service worker) y el ícono (`icon-180.png`).
- **Compuesto:** el teléfono genérico sin marca, la pantalla bloqueada (reloj, fecha, fondo azul, botones), la
  barra de estado, el círculo del toque, los post-its del fondo y las transiciones abrir/bloquear.
- **Oculto solo en el video:** el aviso «Día despejado» de la app desde el cambio a Mes, porque tapaba el clavo.

## Datos de ejemplo

`seed.py`: todo inventado (ramos genéricos de Ingeniería Comercial, tareas cotidianas). «Hoy» es el lunes
26 de octubre de 2026 a las 8:00 (hora de Chile, la del resumen de la mañana). 18 completadas en septiembre y
21 en octubre antes del video, así el clavo llega a 24 y supera al mes anterior.

## Cómo regenerarlo

Requisitos: Python 3 con `playwright`, `numpy` y `Pillow`; Chromium de Playwright; `ffmpeg`. Las fuentes de la
app están en `tools/teaser-web/fonts/` (Bricolage Grotesque y Caveat, de `@fontsource-variable`); la pantalla
bloqueada usa Inter / Inter Display del sistema.

```bash
cd tools/teaser-web
python3 capture.py            # 1) app real cuadro a cuadro -> out/screen/*.jpg + out/timeline.json (~2 min)
python3 compose.py sheet      # 2) hoja de contactos rápida (un cuadro por segundo) -> out/sheet.png
python3 compose.py sheet 0,45,95,380   # o cuadros elegidos
python3 compose.py all        # 3) 480 cuadros 1920x1080 + out/pendientes-teaser.mp4 (~5 min)
python3 qc.py                 # 4) ffprobe, tirones, empalme del loop y hoja de contactos del MP4 codificado
python3 screenshots.py        # capturas en bruto out/pendientes-1..5.png
```

Archivos:

- `guion.py`: tiempos, eventos sobre la app, cámara, fases de la pantalla bloqueada y momentos en que se van los post-its.
- `seed.py`: datos de ejemplo.
- `appdrive.py`: abre la app como iPhone 15 Pro Max con reloj y animaciones en tiempo virtual.
- `capture.py`: maneja la app según el guion y guarda cada cuadro.
- `compositor.html` + `compose.py`: teléfono, pantalla bloqueada, fondo, toques, cámara y codificación.
- `qc.py`: control de calidad. `screenshots.py`: capturas para el portafolio.

Si la app cambia y un selector deja de existir, `capture.py` se detiene con «FALLA: no encontré …». Ajusta el
selector en `guion.py`. Si un gesto falla (la fila no se completa), suele ser porque apuntó mientras la fila
anterior todavía se estaba yendo: dale 0,1–0,2 s más de aire.

## Control de calidad v1

Medido con `qc.py` sobre el MP4 ya codificado (cuadros reducidos a 480×270 en gris, diferencia media absoluta 0–255):

- **ffprobe:** 1920×1080, 30 fps, H.264 High, yuv420p, 480 cuadros, 16,000 s, **0 pistas de audio**, 10,4 MB.
- **Tirones:** ninguno.
- **Empalme del loop:** último → primer cuadro = **0,39**. Cuadros consecutivos alrededor del empalme (15 antes y
  15 después): media 0,56, máximo 1,92. En todo el video: mediana 1,13, media 2,40. El salto del empalme es
  menor que un paso normal entre cuadros, así que no se nota.
- **Hoja de contactos** del MP4 codificado (`out/pendientes-teaser-contactos.png`): sin textos encimados ni
  cuadros vacíos; el cuadro 479 calza con el 0.
- Revisión a resolución completa del aviso (cuadro 40) y de la atrasada (cuadro 100): nítidos y legibles.

## Textos para la web

- **Link:** https://estebi-jr.github.io/Pendientes/
- **Línea:** Deja de postergar. Empieza por hoy.
- **Descripción:** Pendientes te dice cada mañana qué te queda para hoy, te deja anotar cualquier cosa en segundos
  escribiendo como hablas y te muestra sin rodeos lo que llevas postergando. Marcas lo hecho con un toque, ves cómo
  se llena tu mes y dejas de cargar con cosas sin hacer.
