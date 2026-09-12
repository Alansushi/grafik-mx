import { describe, it, expect } from 'vitest';
import {
  hexToRgb,
  rgbToHex,
  srgbToLinear,
  relativeLuminance,
  contrastRatio,
  isDarkColor,
  rgbToHsl,
  hslToRgb,
  legibility,
  suggestLogoVariant,
} from '../../estudio/lib/color.js';
import { ValidationError } from '../../estudio/lib/errors.js';
import { formatCentsMXN } from '../../estudio/lib/format.js';

// Generador determinista de colores para los property tests de este archivo.
// Nada de Math.random: cada índice produce siempre el mismo color, así que un
// fallo es reproducible sin depender de una semilla externa.
function deterministicColor(i) {
  return {
    r: (i * 53) % 256,
    g: (i * 97 + 31) % 256,
    b: (i * 131 + 67) % 256,
  };
}

const BRAND_HEX_TOKENS = [
  '#0C0C0C', // negro
  '#181818', // carbon
  '#2E2E2E', // carbon-hi
  '#D02B34', // rojo
  '#A0202A', // rojo-dark
  '#F0F0EE', // blanco
  '#B8B8B8', // plata
  '#25D366', // wa
];

describe('color.js — hexToRgb', () => {
  it('1. convierte un hex de marca con # a {r,g,b}', () => {
    expect(hexToRgb('#D02B34')).toEqual({ r: 208, g: 43, b: 52 });
  });

  it('2. acepta el mismo hex sin #', () => {
    expect(hexToRgb('D02B34')).toEqual({ r: 208, g: 43, b: 52 });
  });

  it('3. expande el shorthand de 3 dígitos', () => {
    expect(hexToRgb('#fff')).toEqual({ r: 255, g: 255, b: 255 });
  });

  it('4. lanza ValidationError INVALID_HEX con caracteres no hex', () => {
    expect(() => hexToRgb('#GG0000')).toThrow(ValidationError);
    try {
      hexToRgb('#GG0000');
      throw new Error('debía lanzar');
    } catch (err) {
      expect(err.code).toBe('INVALID_HEX');
    }
  });

  it('5. lanza INVALID_HEX con cadena vacía o null', () => {
    for (const bad of ['', null]) {
      try {
        hexToRgb(bad);
        throw new Error('debía lanzar');
      } catch (err) {
        expect(err).toBeInstanceOf(ValidationError);
        expect(err.code).toBe('INVALID_HEX');
      }
    }
  });
});

describe('color.js — rgbToHex', () => {
  it('6. devuelve #RRGGBB en mayúsculas', () => {
    expect(rgbToHex({ r: 208, g: 43, b: 52 })).toBe('#D02B34');
  });

  it('7. round-trip hexToRgb → rgbToHex sobre los 8 tokens de marca', () => {
    for (const token of BRAND_HEX_TOKENS) {
      expect(rgbToHex(hexToRgb(token))).toBe(token.toUpperCase());
    }
  });

  // compose.js (incremento 3) alimenta rgbToHex con valores CALCULADOS, no
  // leídos de un hex: clipColor puede devolver canales fuera de [0,255] y
  // dominantColorFromPixels construye el color desde buckets. Sin acotar, un
  // canal de 300 produce '#12C...' (3 dígitos) y el hex sale corrupto en
  // silencio — justo el tipo de fallo que no se nota hasta el snapshot.
  it('7b. acota canales fuera de rango en vez de emitir un hex corrupto', () => {
    expect(rgbToHex({ r: 300, g: -20, b: 128 })).toBe('#FF0080');
    expect(rgbToHex({ r: 255.6, g: 0.4, b: 127.5 })).toMatch(/^#[0-9A-F]{6}$/);
  });

  it('7c. siempre devuelve exactamente 7 caracteres', () => {
    for (let i = 0; i < 30; i++) {
      expect(rgbToHex(deterministicColor(i))).toMatch(/^#[0-9A-F]{6}$/);
    }
  });
});

describe('color.js — relativeLuminance', () => {
  it('8. negro puro → 0', () => {
    expect(relativeLuminance({ r: 0, g: 0, b: 0 })).toBe(0);
  });

  it('9. blanco puro → 1 (±1e-9)', () => {
    expect(relativeLuminance({ r: 255, g: 255, b: 255 })).toBeCloseTo(1, 9);
  });
});

describe('color.js — srgbToLinear (soporte de relativeLuminance)', () => {
  it('linealiza el canal 0 a 0 y el canal 255 a 1', () => {
    expect(srgbToLinear(0)).toBe(0);
    expect(srgbToLinear(255)).toBeCloseTo(1, 9);
  });
});

describe('color.js — contrastRatio', () => {
  it('10. negro vs blanco → 21 (±0.01, como exige el spec)', () => {
    expect(contrastRatio('#000000', '#FFFFFF')).toBeCloseTo(21, 2);
  });

  it('11. blanco vs blanco → 1', () => {
    expect(contrastRatio('#FFFFFF', '#FFFFFF')).toBeCloseTo(1, 9);
  });

  it('12. es simétrico — property test con 20 pares deterministas', () => {
    for (let i = 0; i < 20; i++) {
      const a = rgbToHex(deterministicColor(i));
      const b = rgbToHex(deterministicColor(i + 100));
      expect(contrastRatio(a, b)).toBeCloseTo(contrastRatio(b, a), 9);
    }
  });
});

describe('color.js — isDarkColor', () => {
  it('13. negro de marca es oscuro, blanco de marca no', () => {
    expect(isDarkColor('#0C0C0C')).toBe(true);
    expect(isDarkColor('#F0F0EE')).toBe(false);
  });

  it('14. el rojo de marca (#D02B34) es oscuro', () => {
    expect(isDarkColor('#D02B34')).toBe(true);
  });
});

describe('color.js — legibility', () => {
  it("15. negro sobre carbon → level 'fail' (ratio < 3)", () => {
    const result = legibility('#0C0C0C', '#181818');
    expect(result.level).toBe('fail');
    expect(result.ratio).toBeLessThan(3);
  });

  it("16. negro sobre plata → level 'ok' (ratio >= 4.5)", () => {
    const result = legibility('#0C0C0C', '#B8B8B8');
    expect(result.level).toBe('ok');
    expect(result.ratio).toBeGreaterThanOrEqual(4.5);
  });

  it('17. message es un string no vacío, en español, sin "undefined"', () => {
    for (const [garment, logo] of [
      ['#0C0C0C', '#181818'],
      ['#0C0C0C', '#B8B8B8'],
      ['#D02B34', '#F0F0EE'],
    ]) {
      const { message } = legibility(garment, logo);
      expect(typeof message).toBe('string');
      expect(message.length).toBeGreaterThan(0);
      expect(message).not.toContain('undefined');
      // Señal mínima de español: al menos una vocal acentuada o palabra clave conocida.
      expect(/contraste/i.test(message)).toBe(true);
    }
  });
});

describe('color.js — rgbToHsl / hslToRgb', () => {
  it('18. rojo puro → {h:0, s:1, l:0.5}', () => {
    const hsl = rgbToHsl({ r: 255, g: 0, b: 0 });
    expect(hsl.h).toBeCloseTo(0, 9);
    expect(hsl.s).toBeCloseTo(1, 9);
    expect(hsl.l).toBeCloseTo(0.5, 9);
  });

  it('19. hslToRgb(rgbToHsl(c)) ≈ c — property con 30 colores deterministas, ±1 por canal', () => {
    for (let i = 0; i < 30; i++) {
      const original = deterministicColor(i);
      const roundTripped = hslToRgb(rgbToHsl(original));
      expect(Math.abs(roundTripped.r - original.r)).toBeLessThanOrEqual(1);
      expect(Math.abs(roundTripped.g - original.g)).toBeLessThanOrEqual(1);
      expect(Math.abs(roundTripped.b - original.b)).toBeLessThanOrEqual(1);
    }
  });

  it('20. gris → saturación cero', () => {
    expect(rgbToHsl({ r: 128, g: 128, b: 128 }).s).toBe(0);
  });
});

describe('color.js — suggestLogoVariant', () => {
  it("21. prenda negra → 'claro'", () => {
    expect(suggestLogoVariant('#0C0C0C')).toBe('claro');
  });
});

describe('format.js — formatCentsMXN', () => {
  it("123400 → '$1,234.00'", () => {
    expect(formatCentsMXN(123400)).toBe('$1,234.00');
  });

  it("0 → '$0.00'", () => {
    expect(formatCentsMXN(0)).toBe('$0.00');
  });

  it("-500 → '-$5.00'", () => {
    expect(formatCentsMXN(-500)).toBe('-$5.00');
  });

  it("50 → '$0.50'", () => {
    expect(formatCentsMXN(50)).toBe('$0.50');
  });
});
