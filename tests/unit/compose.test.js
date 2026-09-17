import { describe, it, expect } from 'vitest';
import {
  lum,
  clipColor,
  setLum,
  blendColorPixel,
  blendMultiplyPixel,
  grayscaleStats,
  normalizeFoldMapPixels,
  tintPixels,
  dominantColorFromPixels,
  pixelsHaveAlpha,
  samplePixel,
} from '../../estudio/lib/compose.js';
import { hexToRgb } from '../../estudio/lib/color.js';
import { ValidationError } from '../../estudio/lib/errors.js';

// Generador determinista de pares (backdrop, source) para el property test de
// la invariante maestra (caso 3). Nada de Math.random: cada índice produce
// siempre el mismo par, así que un fallo es reproducible sin depender de una
// semilla externa. Los coeficientes son arbitrarios, sólo buscan dispersión.
function deterministicRgb(i) {
  return {
    r: (i * 53) % 256,
    g: (i * 97 + 31) % 256,
    b: (i * 131 + 67) % 256,
  };
}

describe('compose.js — lum', () => {
  it('1. lum({255,255,255}) === 255', () => {
    expect(lum({ r: 255, g: 255, b: 255 })).toBe(255);
  });

  it('2. lum({0,0,0}) === 0', () => {
    expect(lum({ r: 0, g: 0, b: 0 })).toBe(0);
  });
});

describe('compose.js — blendColorPixel', () => {
  it('3. INVARIANTE MAESTRA: lum(blendColorPixel(cb,cs)) ≈ lum(cb) — property con 100 pares deterministas, ±1', () => {
    let maxError = 0;
    for (let i = 0; i < 100; i++) {
      const cb = deterministicRgb(i);
      const cs = deterministicRgb(i + 250); // offset para decorrelar cb de cs
      const blended = blendColorPixel(cb, cs);
      const error = Math.abs(lum(blended) - lum(cb));
      maxError = Math.max(maxError, error);
      expect(error).toBeLessThanOrEqual(1);
    }
    // Log informativo para el reporte de TDD: el error máximo real observado.
    // eslint-disable-next-line no-console
    console.log(`[compose.test] caso 3 — error máximo observado sobre 100 pares: ${maxError}`);
  });

  it('4. con fuente gris {128,128,128}, el resultado es gris y su lum === lum(cb)', () => {
    for (let i = 0; i < 10; i++) {
      const cb = deterministicRgb(i);
      const result = blendColorPixel(cb, { r: 128, g: 128, b: 128 });
      expect(result.r).toBeCloseTo(result.g, 6);
      expect(result.g).toBeCloseTo(result.b, 6);
      expect(lum(result)).toBeCloseTo(lum(cb), 6);
    }
  });

  it('5. blendColorPixel({128,128,128}, {255,0,0}) → rojo con lum≈128, r>g y r>b', () => {
    const result = blendColorPixel({ r: 128, g: 128, b: 128 }, { r: 255, g: 0, b: 0 });
    expect(lum(result)).toBeCloseTo(128, 0);
    expect(result.r).toBeGreaterThan(result.g);
    expect(result.r).toBeGreaterThan(result.b);
  });

  it('6. blendColorPixel({0,0,0}, cualquiera) → {0,0,0} — el negro no se puede teñir', () => {
    const backdrop = { r: 0, g: 0, b: 0 };
    for (const source of [
      { r: 255, g: 0, b: 0 },
      { r: 10, g: 200, b: 30 },
      { r: 128, g: 128, b: 128 },
      hexToRgb('#D02B34'),
    ]) {
      const result = blendColorPixel(backdrop, source);
      expect(result.r).toBeCloseTo(0, 9);
      expect(result.g).toBeCloseTo(0, 9);
      expect(result.b).toBeCloseTo(0, 9);
    }
  });

  it('7. blendColorPixel({255,255,255}, cualquiera) → {255,255,255} — el blanco no se puede teñir', () => {
    const backdrop = { r: 255, g: 255, b: 255 };
    for (const source of [
      { r: 255, g: 0, b: 0 },
      { r: 10, g: 200, b: 30 },
      { r: 128, g: 128, b: 128 },
      hexToRgb('#D02B34'),
    ]) {
      const result = blendColorPixel(backdrop, source);
      expect(result.r).toBeCloseTo(255, 9);
      expect(result.g).toBeCloseTo(255, 9);
      expect(result.b).toBeCloseTo(255, 9);
    }
  });

  it('8. con backdrop muy oscuro y source saturado, ningún canal sale de [0,255] (valida clipColor)', () => {
    const backdrop = { r: 5, g: 5, b: 6 };
    const source = { r: 255, g: 0, b: 0 };
    const result = blendColorPixel(backdrop, source);
    for (const channel of [result.r, result.g, result.b]) {
      expect(channel).toBeGreaterThanOrEqual(-1e-6);
      expect(channel).toBeLessThanOrEqual(255 + 1e-6);
    }
  });
});

describe('compose.js — blendMultiplyPixel', () => {
  it('9. blendMultiplyPixel({200,200,200},{255,255,255}) === {200,200,200}', () => {
    const result = blendMultiplyPixel({ r: 200, g: 200, b: 200 }, { r: 255, g: 255, b: 255 });
    expect(result.r).toBeCloseTo(200, 6);
    expect(result.g).toBeCloseTo(200, 6);
    expect(result.b).toBeCloseTo(200, 6);
  });

  it('10. blendMultiplyPixel(x,{0,0,0}) === {0,0,0} sin importar el backdrop', () => {
    for (const backdrop of [
      { r: 255, g: 255, b: 255 },
      { r: 128, g: 64, b: 32 },
      { r: 1, g: 1, b: 1 },
    ]) {
      const result = blendMultiplyPixel(backdrop, { r: 0, g: 0, b: 0 });
      expect(result.r).toBeCloseTo(0, 6);
      expect(result.g).toBeCloseTo(0, 6);
      expect(result.b).toBeCloseTo(0, 6);
    }
  });
});

describe('compose.js — grayscaleStats', () => {
  it('11. array uniforme de 128 → {mean:128, min:128, max:128}', () => {
    const data = new Uint8ClampedArray([
      128, 128, 128, 255,
      128, 128, 128, 255,
      128, 128, 128, 255,
      128, 128, 128, 255,
    ]);
    const stats = grayscaleStats(data);
    expect(stats.mean).toBe(128);
    expect(stats.min).toBe(128);
    expect(stats.max).toBe(128);
    // Cobertura adicional sobre el mismo fixture (no relajamos el caso, lo
    // completamos): con las 4 muestras totalmente opacas, alphaMean debe ser
    // 255 y opaqueCount debe contar las 4.
    expect(stats.alphaMean).toBe(255);
    expect(stats.opaqueCount).toBe(4);
  });
});

describe('compose.js — normalizeFoldMapPixels', () => {
  // Un fold map REAL, con el rango de una foto de prenda en escala de grises:
  // tela plana alrededor de 180, pliegue medio 120, arruga profunda 80.
  // No un fixture de varianza casi nula — eso haría pasar cualquier
  // implementación y no diría nada sobre la que de verdad se va a usar.
  const FOLD_MAP_REAL = new Uint8ClampedArray([
    180, 180, 180, 255, // tela plana
    180, 180, 180, 255,
    180, 180, 180, 255,
    120, 120, 120, 255, // pliegue
    80, 80, 80, 255,    // arruga profunda
  ]);

  it('12. lleva el nivel de tela plana a 255, para que multiply no oscurezca nada ahí', () => {
    // El fold map se aplica con multiply sobre el logo. Un píxel a 255 es
    // factor 1.0: no altera nada. Por eso lo que tiene que aterrizar en 255 es
    // la TELA PLANA, no la media del mapa — la media incluye los pliegues, y
    // llevarla a 255 obligaría a recortar toda la información de sombra.
    const out = normalizeFoldMapPixels(FOLD_MAP_REAL, 255);
    expect(out[0]).toBe(255); // la tela plana queda neutra
  });

  it('12b. preserva las razones de atenuación del original — es lo que hace que los pliegues se vean', () => {
    // multiply es una operación multiplicativa: lo que importa no son los
    // valores absolutos sino cuánto atenúa cada pliegue RESPECTO a la tela
    // plana. Si el pliegue era el 0.667 del brillo de la tela, tras normalizar
    // debe seguir atenuando 0.667 — si no, los pliegues se aplanan y el logo
    // vuelve a verse como sticker pegado encima.
    const out = normalizeFoldMapPixels(FOLD_MAP_REAL, 255);
    const flat = out[0] / 255;
    const fold = out[3 * 4] / 255;
    const crease = out[4 * 4] / 255;

    expect(flat).toBeCloseTo(1, 2);
    expect(fold).toBeCloseTo(120 / 180, 2);   // 0.667
    expect(crease).toBeCloseTo(80 / 180, 2);  // 0.444
  });

  it('12c. un mapa uniforme queda completamente neutro (multiply no hace nada)', () => {
    const uniform = new Uint8ClampedArray([
      128, 128, 128, 255,
      128, 128, 128, 255,
    ]);
    const out = normalizeFoldMapPixels(uniform, 255);
    expect(out[0]).toBe(255);
    expect(out[4]).toBe(255);
  });

  it('13. preserva el canal alfa intacto (byte 3 de cada píxel)', () => {
    const data = new Uint8ClampedArray([
      80, 80, 80, 0,
      120, 120, 120, 128,
      160, 160, 160, 255,
    ]);
    const out = normalizeFoldMapPixels(data);
    const n = data.length / 4;
    for (let i = 0; i < n; i++) {
      expect(out[i * 4 + 3]).toBe(data[i * 4 + 3]);
    }
  });

  it('14. preserva el orden relativo: si a<b en la entrada, a\'<=b\' en la salida', () => {
    const grays = [10, 50, 90, 130, 170, 210, 250];
    const data = new Uint8ClampedArray(grays.length * 4);
    grays.forEach((v, i) => {
      data[i * 4] = v;
      data[i * 4 + 1] = v;
      data[i * 4 + 2] = v;
      data[i * 4 + 3] = 255;
    });
    const out = normalizeFoldMapPixels(data);
    const outGrays = grays.map((_, i) => out[i * 4]);
    for (let i = 0; i < grays.length; i++) {
      for (let j = 0; j < grays.length; j++) {
        if (grays[i] < grays[j]) {
          expect(outGrays[i]).toBeLessThanOrEqual(outGrays[j]);
        }
      }
    }
  });
});

describe('compose.js — tintPixels', () => {
  // Reconstruye el mismo redondeo/clamp que hará tintPixels internamente al
  // escribir en un Uint8ClampedArray, para no re-implementar a mano la regla
  // de redondeo de ECMAScript (round-half-to-even) y arriesgar un desfase de
  // ±1 artificial entre el test y la implementación.
  function expectedTintedRgb(backdropRgb, sourceRgb) {
    const blended = blendColorPixel(backdropRgb, sourceRgb);
    const tmp = new Uint8ClampedArray([blended.r, blended.g, blended.b, 255]);
    return { r: tmp[0], g: tmp[1], b: tmp[2] };
  }

  it('15. cada píxel === blendColorPixel(basePixel, hexToRgb(hex))', () => {
    const base = new Uint8ClampedArray([
      100, 100, 100, 255,
      200, 200, 200, 255,
      40, 40, 40, 255,
    ]);
    const hex = '#D02B34';
    const source = hexToRgb(hex);
    const out = tintPixels(base, hex);
    const n = base.length / 4;
    for (let i = 0; i < n; i++) {
      const backdrop = { r: base[i * 4], g: base[i * 4 + 1], b: base[i * 4 + 2] };
      const expected = expectedTintedRgb(backdrop, source);
      expect(out[i * 4]).toBe(expected.r);
      expect(out[i * 4 + 1]).toBe(expected.g);
      expect(out[i * 4 + 2]).toBe(expected.b);
      expect(out[i * 4 + 3]).toBe(255);
    }
  });

  it('16. ignora píxeles con a===0: salida alfa 0, RGB intacto', () => {
    const base = new Uint8ClampedArray([
      77, 88, 99, 0, // transparente: no se tiñe
      100, 100, 100, 255, // opaco: sí se tiñe
    ]);
    const hex = '#D02B34';
    const out = tintPixels(base, hex);

    expect(out[3]).toBe(0);
    expect(out[0]).toBe(77);
    expect(out[1]).toBe(88);
    expect(out[2]).toBe(99);

    const source = hexToRgb(hex);
    const expected = expectedTintedRgb({ r: 100, g: 100, b: 100 }, source);
    expect(out[4]).toBe(expected.r);
    expect(out[5]).toBe(expected.g);
    expect(out[6]).toBe(expected.b);
    expect(out[7]).toBe(255);
  });
});

describe('compose.js — dominantColorFromPixels', () => {
  it("17. 90% rojo puro + 10% transparente → '#FF0000'", () => {
    const pixels = [];
    for (let i = 0; i < 9; i++) pixels.push(255, 0, 0, 255);
    pixels.push(0, 0, 0, 0); // 10% transparente, no debe contar
    const data = new Uint8ClampedArray(pixels);
    expect(dominantColorFromPixels(data)).toBe('#FF0000');
  });

  it('18. todos los píxeles por debajo del umbral de alfa → lanza ValidationError NO_OPAQUE_PIXELS', () => {
    const data = new Uint8ClampedArray([
      255, 0, 0, 0,
      0, 255, 0, 0,
      0, 0, 255, 3,
    ]);
    try {
      dominantColorFromPixels(data);
      throw new Error('debía lanzar');
    } catch (err) {
      expect(err).toBeInstanceOf(ValidationError);
      expect(err.code).toBe('NO_OPAQUE_PIXELS');
    }
  });
});

describe('compose.js — pixelsHaveAlpha', () => {
  it('19. PNG con alfa parcial → true; JPG opaco (alfa 255 uniforme) → false', () => {
    const pngLike = new Uint8ClampedArray([
      10, 20, 30, 255,
      40, 50, 60, 128,
      70, 80, 90, 255,
    ]);
    const jpgLike = new Uint8ClampedArray([
      10, 20, 30, 255,
      40, 50, 60, 255,
      70, 80, 90, 255,
    ]);
    expect(pixelsHaveAlpha(pngLike)).toBe(true);
    expect(pixelsHaveAlpha(jpgLike)).toBe(false);
  });
});

describe('compose.js — samplePixel', () => {
  it('20. samplePixel(data, 10, 3, 2) lee el offset (2*10+3)*4 === 92', () => {
    const width = 10;
    const height = 3;
    const data = new Uint8ClampedArray(width * height * 4);
    const offset = (2 * width + 3) * 4;
    expect(offset).toBe(92);
    data[offset] = 11;
    data[offset + 1] = 22;
    data[offset + 2] = 33;
    data[offset + 3] = 44;
    expect(samplePixel(data, width, 3, 2)).toEqual({ r: 11, g: 22, b: 33, a: 44 });
  });
});
