// Uso: node tools/generate-mail-previews.mjs [directorio-de-salida]
// El destino predeterminado queda fuera de la raíz pública del sitio.
import { copyFile, mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { renderQuoteMail } from '../api/_lib/quote-mail-template.js';

const output = process.argv[2] || join(tmpdir(), 'grafik-email-previews');
const baseUrl = 'http://localhost:8099';
const sample = {
  name: 'Ana', return_token: 'vista-local', unsubscribe_token: 'vista-local',
};
const variants = [
  ['confirmacion', 'confirmation', 'contacto'],
  ['recordatorio-contacto', 'reminder', 'contacto'],
  ['recordatorio-estudio', 'reminder', 'estudio'],
];

await mkdir(output, { recursive: true });
await mkdir(join(output, 'assets'), { recursive: true });
await copyFile(fileURLToPath(new URL('../assets/grafik-favicon-512.png', import.meta.url)), join(output, 'assets/grafik-favicon-512.png'));
for (const [file, kind, channel] of variants) {
  const { html } = renderQuoteMail({ kind, intent: { ...sample, channel }, baseUrl });
  await writeFile(join(output, `${file}.html`), html, 'utf8');
}
const links = variants.map(([file]) => `<li><a href="${file}.html">${file}</a></li>`).join('\n');
await writeFile(join(output, 'index.html'), `<!doctype html><html lang="es"><meta charset="utf-8"><title>Vistas de correos GRAFIK</title><body><h1>Vistas locales de correos GRAFIK</h1><ul>${links}</ul></body></html>`, 'utf8');
console.log(`Vistas creadas en ${output}`);
console.log('Para abrirlas: python3 -m http.server 8099 --directory "' + output + '"');
