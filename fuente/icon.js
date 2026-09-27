/* Regenera los íconos desde fuente/icon.svg (solo si cambia el diseño del ícono).
   Ejecutar desde la raíz del repo:  node fuente/icon.js
   Escribe en la raíz: icon-180.png, icon-192.png, icon-512.png, icon-maskable-512.png, y dist/icono-1024.png (para Atajos). */
const fs = require('fs'), path = require('path');
function loadSharp() {
  const tries = ['sharp', '/home/claude/.npm-global/lib/node_modules/sharp'];
  try { tries.push(require('child_process').execSync('npm root -g').toString().trim() + '/sharp'); } catch (e) {}
  for (const t of tries) { try { return require(t); } catch (e) {} }
  console.error('Falta sharp: npm i -g sharp'); process.exit(1);
}
(async () => {
  const sharp = loadSharp(), root = path.join(__dirname, '..');
  const svg = fs.readFileSync(path.join(__dirname, 'icon.svg'), 'utf8');
  /* versión maskable: el mismo arte al 78% (el SVG agrupa el arte en translate(512 540) scale(1)) */
  const masked = svg.replace('translate(512 540) scale(1)', 'translate(512 540) scale(0.78)');
  if (masked === svg) console.warn('AVISO: no encontré el grupo del arte; el ícono maskable quedará igual al normal');
  fs.mkdirSync(path.join(root, 'dist'), { recursive: true });
  await sharp(Buffer.from(svg)).png().toFile(path.join(root, 'dist', 'icono-1024.png'));
  for (const [n, s] of [['icon-512.png', 512], ['icon-192.png', 192], ['icon-180.png', 180]]) await sharp(Buffer.from(svg)).resize(s, s).png().toFile(path.join(root, n));
  await sharp(Buffer.from(masked)).resize(512, 512).png().toFile(path.join(root, 'icon-maskable-512.png'));
  console.log('Íconos listos');
})();
