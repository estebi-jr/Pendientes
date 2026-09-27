#!/usr/bin/env python3
"""Build de Pendientes. Ejecutar desde la RAÍZ del repositorio:

    python fuente/build.py

Genera desde la fuente única (fuente/pendientes.src.html):
  - index.html, manifest.webmanifest, sw.js   -> versión web, en la raíz (lo que publica GitHub Pages)
  - dist/pendientes-claude.html               -> versión conectada a Claude (publicar con la herramienta
                                                  Artifact pasando el url del artifact existente)
La versión del service worker es un hash de index.html: si el código no cambió, sw.js no cambia.
"""
import hashlib, json, os, sys

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
SRC = os.path.join(ROOT, 'fuente', 'pendientes.src.html')
src = open(SRC, encoding='utf-8').read()
if src.count("const MODE='db';") != 1 or src.count('<!--WEB-HEAD-->\n') != 1:
    sys.exit("FALLA: la fuente debe tener exactamente una línea  const MODE='db';  y el marcador <!--WEB-HEAD-->")

WEB_HEAD = '''<meta name="description" content="Tus tareas en post-its de colores.">
<meta name="theme-color" content="#F2F5FC" media="(prefers-color-scheme: light)">
<meta name="theme-color" content="#070C1C" media="(prefers-color-scheme: dark)">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-title" content="Pendientes">
<meta name="apple-mobile-web-app-status-bar-style" content="default">
<meta name="format-detection" content="telephone=no">
<link rel="manifest" href="manifest.webmanifest">
<link rel="apple-touch-icon" href="icon-180.png">
<link rel="icon" type="image/png" sizes="192x192" href="icon-192.png">
'''
claude = src.replace('<!--WEB-HEAD-->\n', '')
web = src.replace("const MODE='db';", "const MODE='web';").replace('<!--WEB-HEAD-->\n', WEB_HEAD)

os.makedirs(os.path.join(ROOT, 'dist'), exist_ok=True)
open(os.path.join(ROOT, 'dist', 'pendientes-claude.html'), 'w', encoding='utf-8').write(claude)
open(os.path.join(ROOT, 'index.html'), 'w', encoding='utf-8').write(web)
manifest = {"name": "Pendientes", "short_name": "Pendientes", "description": "Tus tareas en post-its de colores.", "lang": "es", "dir": "ltr",
            "start_url": "./", "scope": "./", "display": "standalone", "orientation": "portrait", "background_color": "#F2F5FC", "theme_color": "#F2F5FC",
            "icons": [{"src": "icon-192.png", "sizes": "192x192", "type": "image/png", "purpose": "any"},
                      {"src": "icon-512.png", "sizes": "512x512", "type": "image/png", "purpose": "any"},
                      {"src": "icon-maskable-512.png", "sizes": "512x512", "type": "image/png", "purpose": "maskable"}]}
open(os.path.join(ROOT, 'manifest.webmanifest'), 'w', encoding='utf-8').write(json.dumps(manifest, ensure_ascii=False, indent=2))
ver = hashlib.sha1(web.encode()).hexdigest()[:8]
sw = open(os.path.join(ROOT, 'fuente', 'sw.template.js'), encoding='utf-8').read().replace('__VERSION__', ver)
open(os.path.join(ROOT, 'sw.js'), 'w', encoding='utf-8').write(sw)
print('Listo. Versión web', ver)
print('  web:    index.html, sw.js, manifest.webmanifest (raíz)')
print('  claude: dist/pendientes-claude.html')
