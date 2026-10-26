"""Datos de ejemplo para el teaser y las capturas de Pendientes.

Todo es inventado (ramos genéricos de Ingeniería Comercial, tareas cotidianas).
"Hoy" es el lunes 26 de octubre de 2026, 8:00 (hora de Chile, la del resumen de la mañana): semana rosa.
"""
import datetime as dt

TODAY = '2026-10-26'
CLOCK_ISO = '2026-10-26T08:00:00-03:00'   # reloj falso de la página
SUBJECTS = ['Estadística', 'Finanzas', 'Marketing', 'Microeconomía']


def _task(title, category, created, horizon='algun', due=None, kind='tarea', subject=None,
          done=False, done_at=None, created_at=None):
    return {
        'title': title, 'category': category, 'subject': subject, 'kind': kind,
        'horizon': horizon, 'due': due, 'notes': '', 'created': created,
        'createdAt': created_at or (created + 'T12:00:00.000Z'),
        'done': done, 'doneAt': done_at, 'source': 'app', 'updatedAt': '2026-10-26T12:00:00.000Z',
    }


def pending():
    # Las tres que se completan en el teaser: A (atrasada, +1 mes), B y C (para hoy).
    return {
        'tA': _task('Pagar la cuenta de la luz', 'dinero', '2026-09-25', 'dia', '2026-10-20'),
        'tB': _task('Entregar informe de Marketing', 'universidad', '2026-10-14', 'dia', TODAY,
                    kind='entrega', subject='Marketing'),
        'tC': _task('Estudiar para el control de Micro', 'universidad', '2026-10-19', 'dia', TODAY),
        # Lo que viene (no se toca en el video)
        'tE': _task('Control de Microeconomía', 'universidad', '2026-10-07', 'dia', '2026-10-28',
                    kind='evaluacion', subject='Microeconomía'),
        'tF': _task('Renovar la licencia de conducir', 'personal', '2026-09-22'),
        'tG': _task('Comprar regalo de cumpleaños', 'ocio', '2026-10-10', 'finde', '2026-11-01'),
        'tH': _task('Revisar el presupuesto del mes', 'dinero', '2026-10-02', 'mes', '2026-10-31'),
        'tI': _task('Postular a la práctica de verano', 'trabajo', '2026-10-16', 'semana', '2026-11-01'),
        'tJ': _task('Ordenar el escritorio', 'personal', '2026-10-23'),
        'tK': _task('Leer capítulo 4 de Finanzas', 'universidad', '2026-10-05', 'dia', '2026-10-30',
                    subject='Finanzas'),
        'tL': _task('Partido de fútbol con los del curso', 'deporte', '2026-10-21', 'dia', '2026-10-31'),
    }


DONE_TITLES = [
    'Pagar el arriendo', 'Lavar la ropa', 'Resumen de Finanzas', 'Ir al gimnasio', 'Comprar útiles',
    'Llamar al banco', 'Taller de Estadística', 'Correr 5 km', 'Leer paper de Marketing', 'Ir al médico',
    'Pagar la tarjeta', 'Guía de Micro', 'Trámite de la beca', 'Reunión de grupo', 'Comprar regalo',
    'Ordenar fotos', 'Preparar presentación', 'Lavar el auto', 'Revisar correo', 'Inscribir ramos',
    'Pagar el teléfono', 'Ir a la feria', 'Tarea de Microeconomía',
]


def done_tasks():
    """Completadas: 18 en septiembre y 20 en octubre (antes de hoy), más 1 hoy temprano.
    Con las 3 del video el clavo de octubre llega a 24 y supera las 18 de septiembre."""
    out = {}
    i = 0
    # septiembre: 18
    for k in range(18):
        day = 1 + (k * 29) // 18
        created = '2026-09-%02d' % max(1, day - 2)
        out['ds%02d' % k] = _task(DONE_TITLES[i % len(DONE_TITLES)], 'personal', created, done=True,
                                  done_at='2026-09-%02dT18:00:00.000Z' % min(30, day + 1))
        i += 1
    # octubre antes de hoy: 20, con creadas de distintas semanas (y algunas de septiembre)
    created_days = ['2026-09-26', '2026-09-29', '2026-10-01', '2026-10-02', '2026-10-03', '2026-10-05',
                    '2026-10-06', '2026-10-08', '2026-10-09', '2026-10-11', '2026-10-12', '2026-10-13',
                    '2026-10-15', '2026-10-16', '2026-10-17', '2026-10-19', '2026-10-20', '2026-10-22',
                    '2026-10-23', '2026-10-24']
    for k, cr in enumerate(created_days):
        d = dt.date.fromisoformat(cr) + dt.timedelta(days=2)
        d = min(d, dt.date(2026, 10, 25))
        if d.month != 10:
            d = dt.date(2026, 10, 1 + k % 3)
        out['do%02d' % k] = _task(DONE_TITLES[i % len(DONE_TITLES)], 'universidad' if k % 3 == 0 else 'personal',
                                  cr, done=True, done_at=d.isoformat() + 'T19:30:00.000Z')
        i += 1
    # hoy temprano: 1 (el anillo parte en 1/4)
    out['dt00'] = _task('Responder el correo del profesor', 'universidad', '2026-10-21', 'dia', TODAY,
                        done=True, done_at='2026-10-26T10:40:00.000Z')
    return out


def local_store():
    """Contenido de localStorage['pendientes:local:v1'] (versión web)."""
    tasks = {}
    tasks.update(done_tasks())
    tasks.update(pending())
    return {'tasks': tasks, 'config': {'subjects': SUBJECTS}, 'learning': {'tokens': {}, 'phrases': {}},
            'archive': {}}


def local_storage(tab='muro'):
    return {
        'pendientes:local:v1': local_store(),
        'pendientes:theme': 'light',
        'pendientes:tip:v1': True,
        'pendientes:install-hint': True,
        'pendientes:avisos-card': True,
        'pendientes:tab': tab,
    }
