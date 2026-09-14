import { describe, it, expect } from 'vitest';
import {
  MAX_LOGO_BYTES,
  MAX_PREVIEW_BYTES,
  logoObjectPath,
  previewObjectPath,
  isAllowedLogoMime,
  isAllowedPreviewMime,
  isAllowedSize,
} from '../../api/_lib/storage-paths.js';
import { ValidationError } from '../../estudio/lib/errors.js';

// nowMs fijo (11 de septiembre de 2026, la fecha del propio spec) construido
// con Date.UTC para que year/month salgan siempre iguales sin importar el
// huso horario de la máquina que corre el test — el servidor de Vercel y
// Storage bucketean por UTC, así que logoObjectPath/previewObjectPath deben
// derivar year/month en UTC, no en hora local.
const D = Date.UTC(2026, 8, 11);

// NOTA DE CONTRATO: las rutas NO llevan el nombre del bucket como prefijo.
// La primera version devolvia 'logos/2026/...' y se subia al bucket 'logos', asi
// que el objeto terminaba en logos/logos/2026/... — una carpeta 'logos' dentro
// del bucket 'logos'. Se detecto verificando en vivo contra Storage. Importa
// corregirlo ahora y no despues: estas rutas se guardan en
// order_items.logo_object_path, y cambiarlas con pedidos reales encima exigiria
// una migracion. El bucket lo elige api/upload-url.js y viaja aparte.

describe('storage-paths.js — constantes de tamaño', () => {
  it('MAX_LOGO_BYTES es 8 MiB', () => {
    expect(MAX_LOGO_BYTES).toBe(8 * 1024 * 1024);
  });

  it('MAX_PREVIEW_BYTES es 4 MiB', () => {
    expect(MAX_PREVIEW_BYTES).toBe(4 * 1024 * 1024);
  });
});

describe('storage-paths.js — logoObjectPath', () => {
  it('1. construye la ruta con slug, año/mes de nowMs y extensión en minúsculas', () => {
    const path = logoObjectPath({
      draftId: 'a1b2',
      filename: 'Mi Logo (final).PNG',
      nowMs: D,
      rand: 'xk91',
    });
    expect(path).toBe('2026/09/a1b2/mi-logo-final-xk91.png');
  });

  it('2. path traversal con "../": el último segmento ("passwd") no tiene extensión, así que se rechaza igual que cualquier nombre sin extensión — nunca hay un resultado del que pueda fugarse ".." o "/"', () => {
    const call = () =>
      logoObjectPath({ draftId: 'a1b2', filename: '../../etc/passwd', nowMs: D, rand: 'xk91' });
    expect(call).toThrow(ValidationError);
    try {
      call();
      throw new Error('debía lanzar');
    } catch (err) {
      expect(err.code).toBe('NO_EXTENSION');
    }
  });

  it('2b. path traversal con "..\\" pero con extensión real: el resultado nunca contiene ".." ni separadores de ruta', () => {
    // '..\..\windows\system32\evil.exe' — construido con fromCharCode para
    // que la barra invertida quede inequívoca en el código fuente.
    const bs = String.fromCharCode(92);
    const filename = `..${bs}..${bs}windows${bs}system32${bs}evil.exe`;
    const path = logoObjectPath({ draftId: 'a1b2', filename, nowMs: D, rand: 'xk91' });
    expect(path).not.toMatch(/\.\./);
    expect(path).not.toContain(bs);
    // Sólo deben existir los 4 segmentos de la estructura
    // (YYYY/MM/draftId/archivo); ninguna barra extra colada desde filename.
    // Eran 5 cuando la ruta llevaba el nombre del bucket como prefijo.
    expect(path.split('/').length).toBe(4);
    expect(path).toBe('2026/09/a1b2/evil-xk91.exe');
  });

  it('2c. bytes nulos en el nombre: el byte nulo no sobrevive al resultado', () => {
    const filename = 'a' + String.fromCharCode(0) + 'b.png';
    const path = logoObjectPath({ draftId: 'a1b2', filename, nowMs: D, rand: 'xk91' });
    expect(path).not.toContain(String.fromCharCode(0));
    expect(path).toBe('2026/09/a1b2/a-b-xk91.png');
  });

  it('2d. nombre que empieza con punto: el punto líder no sobrevive, no se cuela como archivo oculto', () => {
    const path = logoObjectPath({ draftId: 'a1b2', filename: '.secret.png', nowMs: D, rand: 'xk91' });
    expect(path).toBe('2026/09/a1b2/secret-xk91.png');
  });

  it('3. filename de 300 caracteres produce un slug de a lo más 60 caracteres', () => {
    const filename = 'a'.repeat(300) + '.png';
    const path = logoObjectPath({ draftId: 'a1b2', filename, nowMs: D, rand: 'xk91' });
    const slugSegment = path.split('/').pop(); // "<slug>-xk91.png"
    const slug = slugSegment.replace(/-xk91\.png$/, '');
    expect(slug.length).toBeLessThanOrEqual(60);
  });

  it('4. filename sin extensión lanza ValidationError NO_EXTENSION', () => {
    const call = () =>
      logoObjectPath({ draftId: 'a1b2', filename: 'archivo-sin-extension', nowMs: D, rand: 'xk91' });
    expect(call).toThrow(ValidationError);
    try {
      call();
      throw new Error('debía lanzar');
    } catch (err) {
      expect(err.code).toBe('NO_EXTENSION');
    }
  });
});

describe('storage-paths.js — previewObjectPath', () => {
  // El spec no trae un caso explícito para previewObjectPath en la tabla del
  // §2.13 (sólo logoObjectPath aparece con un ejemplo concreto), pero la
  // firma exportada lo exige. Se prueba por simetría con logoObjectPath: no
  // recibe filename (el snapshot no tiene nombre de cliente, sólo un índice
  // de posición en el carrito), así que no hay superficie de path traversal
  // aquí — itemIndex es un entero controlado por el propio servidor/estado.
  it('construye la ruta con year/month de nowMs, itemIndex y rand, siempre en .png', () => {
    const path = previewObjectPath({ draftId: 'a1b2', itemIndex: 0, nowMs: D, rand: 'xk91' });
    expect(path).toBe('2026/09/a1b2/item-0-xk91.png');
  });

  it('itemIndex distinto produce rutas distintas', () => {
    const p0 = previewObjectPath({ draftId: 'a1b2', itemIndex: 0, nowMs: D, rand: 'xk91' });
    const p1 = previewObjectPath({ draftId: 'a1b2', itemIndex: 1, nowMs: D, rand: 'xk91' });
    expect(p0).not.toBe(p1);
  });
});

describe('storage-paths.js — isAllowedLogoMime', () => {
  it('5. acepta png, jpeg, webp y svg+xml', () => {
    expect(isAllowedLogoMime('image/png')).toBe(true);
    expect(isAllowedLogoMime('image/jpeg')).toBe(true);
    expect(isAllowedLogoMime('image/webp')).toBe(true);
    expect(isAllowedLogoMime('image/svg+xml')).toBe(true);
  });

  it('6. rechaza gif, pdf y html', () => {
    expect(isAllowedLogoMime('image/gif')).toBe(false);
    expect(isAllowedLogoMime('application/pdf')).toBe(false);
    expect(isAllowedLogoMime('text/html')).toBe(false);
  });
});

describe('storage-paths.js — isAllowedPreviewMime', () => {
  it('7. acepta png', () => {
    expect(isAllowedPreviewMime('image/png')).toBe(true);
  });

  it('7b. rechaza svg+xml: el snapshot siempre sale rasterizado de toDataURL, nunca SVG', () => {
    expect(isAllowedPreviewMime('image/svg+xml')).toBe(false);
  });
});

describe('storage-paths.js — isAllowedSize', () => {
  it('acepta un tamaño por debajo del máximo', () => {
    expect(isAllowedSize(1000, MAX_LOGO_BYTES)).toBe(true);
  });

  it('acepta exactamente el máximo', () => {
    expect(isAllowedSize(MAX_LOGO_BYTES, MAX_LOGO_BYTES)).toBe(true);
  });

  it('rechaza un tamaño por encima del máximo', () => {
    expect(isAllowedSize(MAX_LOGO_BYTES + 1, MAX_LOGO_BYTES)).toBe(false);
  });

  it('rechaza tamaños no positivos', () => {
    expect(isAllowedSize(0, MAX_LOGO_BYTES)).toBe(false);
    expect(isAllowedSize(-1, MAX_LOGO_BYTES)).toBe(false);
  });
});
