"""Guion del teaser en loop (16 s, 30 fps). Tiempos en segundos.

Idea: el loop es UN DÍA. El teléfono deja de ser la distracción y pasa a ser lo que te ordena.
  0.0  Pantalla bloqueada: llega el resumen de la mañana (texto real de morningSummary). Fondo lleno de
       post-its, varios con cinta roja (lo que llevas postergando).
  1.4  Toque en el aviso -> la app se abre desde el aviso, en Hoy.
  2.9  Acercamiento a la atrasada: "Hace 6 días · +1 mes". Se completa deslizando; se van los post-its rojos.
  5.2  Anotar escribiendo: la app entiende fecha, tipo y ramo.
  8.4  Se completa lo de hoy (toque y deslizar); el anillo se llena y el fondo se despeja.
 10.3  ¡Listo por hoy!
 11.6  Mes: el clavo con 24 post-its, más que el mes anterior.
 13.5  Se baja la pantalla bloqueada (el día terminó); vuelven los post-its (un día nuevo).
 14.8  Llega el aviso de la mañana siguiente y se asienta = cuadro 0. Sin fundidos ni cortes.
"""
FPS = 30
T = 16.0                 # duración del loop
CAPTURE_END = 14.20      # desde aquí la app queda tapada por la pantalla bloqueada
TYPED = 'Prueba de Estadística el jueves'

# Fases compuestas encima de la app (pantalla bloqueada)
LOCK = {
    'tap': 1.40,               # toque en el aviso
    'open': (1.50, 2.08),      # la app se abre desde el aviso
    'down': (13.50, 14.16),    # la pantalla bloqueada baja y tapa la app
    'notif': (14.70, 15.40),   # llega el aviso del día siguiente
}
NOTIF_RECT = (12, 598, 406, 132)   # x, y, ancho, alto del aviso en px CSS de la pantalla (430 x 932)

EVENTS = [
    # toque visible sobre el aviso (no toca la app: está tapada)
    {'do': 'tap', 't': LOCK['tap'], 'xy': (215, 660), 'fake': True},
    {'do': 'mark', 't': 2.60, 'name': 'rowA', 'sel': '.rw[data-id="tA"]'},
    {'do': 'swipe', 't': 3.80, 't2': 4.32, 'sel': '.rw[data-id="tA"]', 'dist': 250},
    {'do': 'tap', 't': 5.20, 'sel': '.fab'},
    {'do': 'type', 't': 5.70, 't2': 6.95, 'text': TYPED},
    {'do': 'mark', 't': 7.05, 'name': 'quick', 'sel': '.quick-card'},
    {'do': 'tap', 't': 7.25, 'sel': '#qAdd'},
    {'do': 'tap', 't': 7.80, 'sel': '.q-done'},
    {'do': 'tap', 't': 8.50, 'sel': '.rw[data-id="tB"] .check'},
    {'do': 'swipe', 't': 9.38, 't2': 9.88, 'sel': '.rw[data-id="tC"]', 'dist': 250},
    {'do': 'mark', 't': 11.05, 'name': 'empty', 'sel': '.empty-note'},
    {'do': 'mark', 't': 11.05, 'name': 'ring', 'sel': '#ring'},
    {'do': 'tap', 't': 11.62, 'sel': '.tab[data-tab="mes"]'},
    # el aviso "Día despejado" taparía el clavo: se oculta en el mismo cuadro en que cambia la pestaña
    {'do': 'js', 't': 11.72, 'code': "document.getElementById('toast').style.visibility='hidden'"},
    {'do': 'mark', 't': 12.60, 'name': 'spike', 'sel': '.spike'},
]

# Cámara: (t, zoom, foco x, foco y) en px CSS de la pantalla (430 x 932). Entre llaves: ease in-out.
CAMERA = [
    (0.00, 1.00, 215, 466),
    (0.20, 1.00, 215, 466),
    (1.35, 1.40, 215, 560),    # se acerca al aviso de la mañana
    (1.60, 1.40, 215, 560),
    (3.05, 1.55, 215, 300),    # paneo continuo hasta la atrasada (+1 mes) mientras se abre la app
    (3.75, 1.55, 215, 300),
    (4.80, 1.22, 215, 440),
    (5.40, 1.22, 215, 440),
    (6.05, 1.45, 215, 262),    # anotar escribiendo
    (7.45, 1.45, 215, 262),
    (8.20, 1.25, 215, 430),    # completar lo de hoy
    (10.05, 1.25, 215, 400),
    (10.70, 1.30, 215, 372),   # ¡Listo por hoy!
    (11.35, 1.30, 215, 372),
    (11.90, 1.12, 215, 520),
    (12.65, 1.60, 215, 690),   # el clavo
    (13.35, 1.60, 215, 690),
    (14.60, 1.00, 215, 466),
    (16.00, 1.00, 215, 466),
]

# Momentos en que se completa una tarea: grupos de post-its del fondo se van flotando.
CLEARS = [4.45, 8.65, 10.02]
RETURN = (13.55, 16.00)   # vuelven (un día nuevo) y llegan justo al empalme
