import { describe, it, expect } from 'vitest';
import {
  SIZE_ORDER,
  normalizeBreakdown,
  totalUnits,
  validateBreakdown,
  breakdownToLabel,
  mergeBreakdowns,
  sortSizes,
} from '../../estudio/lib/sizes.js';
import { ValidationError } from '../../estudio/lib/errors.js';

describe('sizes.js — normalizeBreakdown', () => {
  it('1. mayúsculas, trim y descarta ceros', () => {
    expect(normalizeBreakdown({ m: 2, L: 0, ' s ': 1 })).toEqual({ S: 1, M: 2 });
  });

  it('2. las claves salen en orden de SIZE_ORDER, no de inserción', () => {
    expect(Object.keys(normalizeBreakdown({ XL: 1, S: 1, M: 1 }))).toEqual(['S', 'M', 'XL']);
  });

  it('3. objeto vacío → objeto vacío', () => {
    expect(normalizeBreakdown({})).toEqual({});
  });

  it('4. coerciona strings numéricos de enteros', () => {
    expect(normalizeBreakdown({ M: '3' })).toEqual({ M: 3 });
  });

  it('5. cantidad no numérica lanza ValidationError NON_NUMERIC_QTY', () => {
    expect(() => normalizeBreakdown({ M: 'abc' })).toThrow(ValidationError);
    try {
      normalizeBreakdown({ M: 'abc' });
      throw new Error('debía lanzar');
    } catch (err) {
      expect(err.code).toBe('NON_NUMERIC_QTY');
    }
  });
});

describe('sizes.js — totalUnits', () => {
  it('6. suma todas las cantidades', () => {
    expect(totalUnits({ S: 2, M: 4, L: 6 })).toBe(12);
  });
});

describe('sizes.js — validateBreakdown', () => {
  it('7. cantidad negativa → error NEGATIVE_QTY', () => {
    const result = validateBreakdown({ M: -1 }, { minTotal: 1 });
    expect(result.errors).toContainEqual({ code: 'NEGATIVE_QTY', size: 'M' });
  });

  it('8. cantidad no entera → error NON_INTEGER', () => {
    const result = validateBreakdown({ M: 2.5 }, {});
    expect(result.errors).toContainEqual({ code: 'NON_INTEGER', size: 'M' });
  });

  it('9. talla desconocida → error UNKNOWN_SIZE', () => {
    const result = validateBreakdown({ XXXXL: 1 }, { allowedSizes: SIZE_ORDER });
    expect(result.errors).toEqual([{ code: 'UNKNOWN_SIZE', size: 'XXXXL' }]);
  });

  it('10. breakdown vacío bajo el mínimo', () => {
    expect(validateBreakdown({}, { minTotal: 12 })).toEqual({
      valid: false,
      total: 0,
      errors: [{ code: 'BELOW_MIN', min: 12, got: 0 }],
    });
  });

  it('11. por debajo del mínimo con got correcto', () => {
    const result = validateBreakdown({ M: 5 }, { minTotal: 12 });
    expect(result.errors).toContainEqual({ code: 'BELOW_MIN', min: 12, got: 5 });
  });

  it('12. exactamente en el mínimo, bajo el máximo → válido', () => {
    expect(validateBreakdown({ M: 12 }, { minTotal: 12, maxTotal: 500 })).toEqual({
      valid: true,
      total: 12,
      errors: [],
    });
  });

  it('13. por encima del máximo → error ABOVE_MAX', () => {
    const result = validateBreakdown({ M: 501 }, { maxTotal: 500 });
    expect(result.errors).toContainEqual({ code: 'ABOVE_MAX', max: 500, got: 501 });
  });

  it('14. dos tallas excediendo maxPerSize → dos errores MAX_PER_SIZE', () => {
    const result = validateBreakdown({ M: 400, L: 400 }, { maxPerSize: 300 });
    const maxPerSizeErrors = result.errors.filter((e) => e.code === 'MAX_PER_SIZE');
    expect(maxPerSizeErrors).toHaveLength(2);
    expect(maxPerSizeErrors.map((e) => e.size).sort()).toEqual(['L', 'M']);
  });

  it('15. los errores acumulan, no cortocircuitan', () => {
    // Sin allowedSizes explícito: por defecto se valida contra SIZE_ORDER,
    // así que XXXXL sí produce UNKNOWN_SIZE aquí.
    const result = validateBreakdown({ M: -1, XXXXL: 2 }, {});
    expect(result.errors).toHaveLength(2);
    expect(result.errors).toContainEqual({ code: 'NEGATIVE_QTY', size: 'M' });
    expect(result.errors).toContainEqual({ code: 'UNKNOWN_SIZE', size: 'XXXXL' });
  });
});

describe('sizes.js — breakdownToLabel', () => {
  it('16. etiqueta legible con total y desglose ordenado', () => {
    expect(breakdownToLabel({ S: 2, M: 4 })).toBe('6 pzas · S×2 M×4');
  });
});

describe('sizes.js — mergeBreakdowns', () => {
  it('17. suma cantidades por talla', () => {
    expect(mergeBreakdowns({ S: 1 }, { S: 2, M: 1 })).toEqual({ S: 3, M: 1 });
  });
});

describe('sizes.js — sortSizes (soporte de las pruebas anteriores)', () => {
  it('ordena según SIZE_ORDER independientemente del orden de entrada', () => {
    expect(sortSizes(['XXL', 'S', 'M'])).toEqual(['S', 'M', 'XXL']);
  });
});
