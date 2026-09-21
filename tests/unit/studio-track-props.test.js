import { describe, it, expect } from 'vitest';
import { logoFormat, safeCode, quoteErrorCode, trackedQty, MAX_TRACKED_QTY, rejectedKind, REJECTED_KINDS } from '../../estudio/lib/track-props.js';

// Ayudantes puros que convierten lo que hay en el estudio (un File, un Error, la
// respuesta de /api/quote) en los valores CERRADOS que acepta el servidor de
// analítica. Existen para que un dato raro no cueste el evento entero, y para
// que jamás salga de aquí algo que el usuario escribió o nombró.

describe('track-props.js — logoFormat', () => {
  it.each([
    [{ type: 'image/png', name: 'a.png' }, 'png'],
    [{ type: 'image/jpeg', name: 'a.jpg' }, 'jpeg'],
    [{ type: 'image/webp', name: 'a.webp' }, 'webp'],
    [{ type: 'image/svg+xml', name: 'a.svg' }, 'svg'],
  ])('1. por mime: %j → %s', (file, esperado) => {
    expect(logoFormat(file)).toBe(esperado);
  });

  it.each([
    [{ type: '', name: 'LOGO.PNG' }, 'png'],
    [{ type: '', name: 'foto.jpeg' }, 'jpeg'],
    [{ type: '', name: 'foto.JPG' }, 'jpeg'],
    [{ type: '', name: 'vector.svg' }, 'svg'],
    [{ type: '', name: 'anim.webp' }, 'webp'],
  ])('2. sin mime (algunos gestores de archivos de Android/iOS no lo rellenan) cae a la extensión: %j → %s', (file, esperado) => {
    expect(logoFormat(file)).toBe(esperado);
  });

  it('3. lo desconocido, vacío o mal formado es "other" y nunca lanza', () => {
    for (const f of [{ type: 'application/pdf', name: 'a.pdf' }, { type: '', name: '' }, {}, null, undefined, { type: 5, name: 7 }]) {
      expect(logoFormat(f)).toBe('other');
    }
  });

  it('4. el mime manda sobre la extensión (un .png que en realidad es jpeg)', () => {
    expect(logoFormat({ type: 'image/jpeg', name: 'engaño.png' })).toBe('jpeg');
  });

  it('5. PRIVACIDAD: el resultado es siempre de una lista cerrada, nunca parte del nombre', () => {
    const cerrada = ['png', 'jpeg', 'webp', 'svg', 'other'];
    for (const name of ['logo-CLIENTE-secreto.png', 'ana ruiz.svg', 'x.exe.png', '../../etc/passwd']) {
      expect(cerrada).toContain(logoFormat({ type: '', name }));
    }
  });
});

describe('track-props.js — safeCode', () => {
  it('6. conserva códigos de error con la forma UPPER_SNAKE', () => {
    for (const c of ['NETWORK', 'BELOW_MIN', 'UPLOAD_FAILED', 'NO_OPAQUE_PIXELS', 'E2']) {
      expect(safeCode(c, 'X')).toBe(c);
    }
  });

  it('7. lo demás cae al valor de respaldo: DOMException.code numérico, minúsculas, mensajes, textos largos', () => {
    for (const malo of [8, 0, 'boom', 'Network error', 'a'.repeat(50), 'A'.repeat(41), '', null, undefined, {}, 'BAD CODE']) {
      expect(safeCode(malo, 'UNKNOWN')).toBe('UNKNOWN');
    }
  });
});

describe('track-props.js — quoteErrorCode', () => {
  it('8. prefiere el código accionable del primer detalle (BELOW_MIN) al genérico', () => {
    expect(quoteErrorCode({ error: 'INVALID_BREAKDOWN', details: [{ code: 'BELOW_MIN' }] })).toBe('BELOW_MIN');
  });

  it('9. sin detalles usa el código del error', () => {
    expect(quoteErrorCode({ error: 'PRICING_RULE_NOT_FOUND' })).toBe('PRICING_RULE_NOT_FOUND');
  });

  it('10. respuesta inservible → UNKNOWN, nunca lanza', () => {
    for (const d of [null, undefined, {}, { error: 'raro' }, { details: [] }, { details: [{}] }, 'texto']) {
      expect(quoteErrorCode(d)).toBe('UNKNOWN');
    }
  });
});

describe('track-props.js — trackedQty', () => {
  it('11. enteros positivos pasan tal cual', () => {
    for (const n of [1, 12, 250, MAX_TRACKED_QTY]) expect(trackedQty(n)).toBe(n);
  });

  it('12. una cantidad absurda se ACOTA en vez de perder el evento (el servidor descarta lo que excede su tope)', () => {
    expect(trackedQty(MAX_TRACKED_QTY + 1)).toBe(MAX_TRACKED_QTY);
    expect(trackedQty(5_000_000)).toBe(MAX_TRACKED_QTY);
  });

  it('13. lo que no es una cantidad válida → undefined (el evento no se emite con basura)', () => {
    for (const malo of [0, -3, 1.5, '12', null, undefined, NaN, Infinity, {}]) {
      expect(trackedQty(malo), String(malo)).toBeUndefined();
    }
  });
});

describe('track-props.js — rejectedKind (qué archivos intenta subir la gente y se rechazan)', () => {
  it.each([
    [{ type: 'application/pdf', name: 'diseño.pdf' }, 'pdf'],
    [{ type: '', name: 'LOGO FINAL.AI' }, 'ai'],
    [{ type: '', name: 'marca.cdr' }, 'cdr'],
    [{ type: '', name: 'vector.eps' }, 'eps'],
    [{ type: 'image/vnd.adobe.photoshop', name: 'capas.psd' }, 'psd'],
    [{ type: 'image/tiff', name: 'foto.tiff' }, 'tif'],
    [{ type: '', name: 'foto.TIF' }, 'tif'],
    [{ type: 'image/heic', name: 'IMG_0001.HEIC' }, 'heic'],
    [{ type: '', name: 'IMG_0002.heif' }, 'heic'],
    [{ type: 'image/gif', name: 'anim.gif' }, 'gif'],
    [{ type: 'image/bmp', name: 'viejo.bmp' }, 'bmp'],
  ])('14. formatos típicos de imprenta que hoy se rechazan: %j → %s', (file, esperado) => {
    expect(rejectedKind(file)).toBe(esperado);
  });

  it('15. un formato ACEPTADO se devuelve tal cual (el rechazo fue por tamaño, no por tipo)', () => {
    expect(rejectedKind({ type: 'image/png', name: 'enorme.png' })).toBe('png');
    expect(rejectedKind({ type: 'image/svg+xml', name: 'x.svg' })).toBe('svg');
  });

  it('16. lo desconocido o mal formado es "other" y nunca lanza', () => {
    for (const f of [{ type: 'application/x-msdownload', name: 'a.exe' }, {}, null, undefined, { type: 5, name: 7 }, { name: 'sin-extension' }]) {
      expect(rejectedKind(f)).toBe('other');
    }
  });

  it('17. PRIVACIDAD: siempre de una lista cerrada; el nombre del archivo nunca sale', () => {
    for (const name of ['CLIENTE-secreto.pdf', 'ana ruiz.ai', '../../etc/passwd', 'x.constructor', 'x.__proto__']) {
      const k = rejectedKind({ type: '', name });
      expect(REJECTED_KINDS, name).toContain(k);
      expect(k).not.toMatch(/CLIENTE|ana|etc|passwd/i);
    }
  });
});
