import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

// Una clase usada en el marcado que no existe en la hoja de estilo no rompe
// nada: el navegador la ignora y el elemento cae a sus estilos por defecto. Por
// eso ningún test la detecta y la suite sigue en verde.
//
// Y en este proyecto ya costó caro. `.es-btn-outline` y `.es-btn-danger` nunca
// se definieron —el agente que escribió el panel de logo se interrumpió antes
// de añadir su CSS—, así que esos botones cayeron al fondo por defecto del
// navegador (ButtonFace, ~#EFEFEF) conservando el color de texto de `.es-btn`
// (#F0F0EE). Texto blanco sobre fondo blanco: "Ajustar al área", "Quitar logo"
// y "Cambiar" se veían como rectángulos vacíos EN PRODUCCIÓN. Se descubrió
// mirando una captura, no con una aserción.
//
// Este test cierra ese hueco de forma barata.

const RAIZ = fileURLToPath(new URL('../../', import.meta.url));

const CSS = readFileSync(`${RAIZ}estudio/studio.css`, 'utf8');

/** Clases `.es-algo` que la hoja SÍ define. */
const definidas = new Set([...CSS.matchAll(/\.(es-[a-z0-9-]+)/g)].map((m) => m[1]));

/**
 * Clases usadas en el marcado. Se leen sólo de `className:` (React) y
 * `class="..."` (HTML) — NO de cualquier aparición de la cadena, para no
 * confundir una clase con un id de `getElementById` o `aria-labelledby`, que
 * comparten el mismo prefijo y no necesitan regla de estilo.
 */
function clasesUsadas(texto) {
  const encontradas = new Set();

  // className: 'a b' · className: cx('a', cond && 'b') · className: `a ${x}`
  for (const m of texto.matchAll(/className:\s*(?:cx\()?((?:[^,;)]|\([^)]*\))*)/g)) {
    for (const lit of m[1].matchAll(/['"`]([^'"`]*)['"`]/g)) {
      for (const c of lit[1].split(/\s+/)) if (c.startsWith('es-')) encontradas.add(c);
    }
  }
  // class="a b" en HTML
  for (const m of texto.matchAll(/class="([^"]*)"/g)) {
    for (const c of m[1].split(/\s+/)) if (c.startsWith('es-')) encontradas.add(c);
  }
  return encontradas;
}

function archivosDeMarcado() {
  const out = [];
  for (const dir of ['estudio/ui', 'estudio', 'estudio/pedido']) {
    for (const f of readdirSync(`${RAIZ}${dir}`, { withFileTypes: true })) {
      if (!f.isFile()) continue;
      if (!/\.(js|html)$/.test(f.name)) continue;
      out.push(`${dir}/${f.name}`);
    }
  }
  return out;
}

describe('studio.css — toda clase usada está definida', () => {
  it('no hay clases .es-* huérfanas en el marcado', () => {
    const huerfanas = [];
    for (const rel of archivosDeMarcado()) {
      const texto = readFileSync(`${RAIZ}${rel}`, 'utf8');
      for (const c of clasesUsadas(texto)) {
        if (!definidas.has(c)) huerfanas.push(`${c}  (en ${rel})`);
      }
    }
    expect(
      huerfanas,
      `Estas clases se usan pero no existen en studio.css, así que el elemento\n` +
      `cae a los estilos por defecto del navegador sin que nada falle:\n  ` +
      huerfanas.join('\n  '),
    ).toEqual([]);
  });

  it('la hoja define las variantes de botón que el marcado compone con cx()', () => {
    // Guardia explícita sobre el caso concreto que se escapó: son las que se
    // escriben dentro de cx(...) y no como cadena suelta.
    for (const c of ['es-btn', 'es-btn-outline', 'es-btn-danger', 'es-btn-sm', 'es-btn-wa']) {
      expect(definidas.has(c), `falta .${c} en studio.css`).toBe(true);
    }
  });

  it('ningún botón queda con texto y fondo del mismo color por omisión', () => {
    // No se puede computar CSS real aquí, pero sí comprobar que cada variante
    // que redefine el fondo declara también su color de texto — que es la
    // combinación exacta que produjo el blanco sobre blanco.
    for (const variante of ['es-btn-outline', 'es-btn-danger']) {
      const bloque = CSS.match(new RegExp(`\\.${variante}\\s*\\{[^}]*\\}`));
      expect(bloque, `no se encontró el bloque de .${variante}`).not.toBeNull();
      expect(bloque[0], `.${variante} cambia el fondo sin declarar color de texto`).toMatch(/color:/);
    }
  });
});
