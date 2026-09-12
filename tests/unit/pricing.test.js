import { describe, it, expect } from 'vitest';
import {
  sortTiers,
  validateTiers,
  resolveTier,
  unitPriceCents,
  sizeSurchargeCents,
  quote,
  quoteCart,
  isTestAccessToken,
  assertChargeable,
} from '../../estudio/lib/pricing.js';
import { PricingError, MpConfigError } from '../../estudio/lib/errors.js';
import { formatCentsMXN } from '../../estudio/lib/format.js';

// Tiers de referencia usados en varios casos: [1-11],[12-49],[50-99],[100-null].
const TIERS = [
  { min_qty: 1, max_qty: 11, unit_price_cents: 15000 },
  { min_qty: 12, max_qty: 49, unit_price_cents: 12000 },
  { min_qty: 50, max_qty: 99, unit_price_cents: 10000 },
  { min_qty: 100, max_qty: null, unit_price_cents: 8000 },
];

function makeRule(overrides = {}) {
  return {
    id: 'rule-1',
    garment_type_id: 'garment-1',
    technique_id: 'technique-1',
    tiers: TIERS,
    technique_surcharge_cents: 0,
    size_surcharges_cents: {},
    currency: 'MXN',
    is_placeholder: false,
    ...overrides,
  };
}

describe('pricing.js — resolveTier', () => {
  it('1. qty 1 y 11 resuelven al tier 1', () => {
    expect(resolveTier(TIERS, 1)).toBe(TIERS[0]);
    expect(resolveTier(TIERS, 11)).toBe(TIERS[0]);
  });

  it('2. qty 12/49 → tier 2, 50/99 → tier 3, 100/1000 → tier 4', () => {
    expect(resolveTier(TIERS, 12)).toBe(TIERS[1]);
    expect(resolveTier(TIERS, 49)).toBe(TIERS[1]);
    expect(resolveTier(TIERS, 50)).toBe(TIERS[2]);
    expect(resolveTier(TIERS, 99)).toBe(TIERS[2]);
    expect(resolveTier(TIERS, 100)).toBe(TIERS[3]);
    expect(resolveTier(TIERS, 1000)).toBe(TIERS[3]);
  });

  it('3. qty 0 lanza PricingError QTY_ZERO', () => {
    try {
      resolveTier(TIERS, 0);
      throw new Error('debía lanzar');
    } catch (err) {
      expect(err).toBeInstanceOf(PricingError);
      expect(err.code).toBe('QTY_ZERO');
    }
  });

  it('4. qty negativo lanza QTY_NEGATIVE', () => {
    try {
      resolveTier(TIERS, -5);
      throw new Error('debía lanzar');
    } catch (err) {
      expect(err.code).toBe('QTY_NEGATIVE');
    }
  });

  it('5. sin tiers lanza NO_TIERS', () => {
    try {
      resolveTier([], 10);
      throw new Error('debía lanzar');
    } catch (err) {
      expect(err.code).toBe('NO_TIERS');
    }
  });

  it('6. qty fuera de todos los tiers lanza NO_TIER_FOR_QTY con details.qty', () => {
    try {
      resolveTier([{ min_qty: 1, max_qty: 10, unit_price_cents: 1000 }], 50);
      throw new Error('debía lanzar');
    } catch (err) {
      expect(err.code).toBe('NO_TIER_FOR_QTY');
      expect(err.details.qty).toBe(50);
    }
  });

  it('7. funciona igual con tiers desordenados en la entrada', () => {
    const shuffled = [TIERS[2], TIERS[0], TIERS[3], TIERS[1]];
    expect(resolveTier(shuffled, 30)).toEqual(resolveTier(TIERS, 30));
    expect(resolveTier(shuffled, 5)).toEqual(resolveTier(TIERS, 5));
  });
});

describe('pricing.js — sortTiers (soporte de resolveTier)', () => {
  it('ordena tiers ascendentemente por min_qty', () => {
    const shuffled = [TIERS[2], TIERS[0], TIERS[3], TIERS[1]];
    expect(sortTiers(shuffled)).toEqual(TIERS);
  });
});

describe('pricing.js — validateTiers', () => {
  it('8. detecta hueco (GAP) entre tiers', () => {
    const result = validateTiers([
      { min_qty: 1, max_qty: 10, unit_price_cents: 1000 },
      { min_qty: 12, max_qty: null, unit_price_cents: 900 },
    ]);
    expect(result.errors).toEqual([{ code: 'GAP', at: 11 }]);
    expect(result.valid).toBe(false);
  });

  it('9. detecta solape (OVERLAP) entre tiers', () => {
    const result = validateTiers([
      { min_qty: 1, max_qty: 20, unit_price_cents: 1000 },
      { min_qty: 10, max_qty: null, unit_price_cents: 900 },
    ]);
    expect(result.errors).toEqual([{ code: 'OVERLAP', at: 10 }]);
    expect(result.valid).toBe(false);
  });

  it('10. el primer tier debe empezar en 1 (MUST_START_AT_1)', () => {
    const result = validateTiers([{ min_qty: 5, max_qty: null, unit_price_cents: 1000 }]);
    expect(result.errors).toEqual([{ code: 'MUST_START_AT_1' }]);
  });

  it('11. falta el tier abierto final (MISSING_OPEN_TIER)', () => {
    const result = validateTiers([{ min_qty: 1, max_qty: 10, unit_price_cents: 1000 }]);
    expect(result.errors).toEqual([{ code: 'MISSING_OPEN_TIER' }]);
  });

  it('12. precio negativo (NEGATIVE_PRICE)', () => {
    const result = validateTiers([{ min_qty: 1, max_qty: 10, unit_price_cents: -5 }]);
    expect(result.errors).toContainEqual({ code: 'NEGATIVE_PRICE' });
    expect(result.valid).toBe(false);
  });

  it('13. set de tiers completo y válido', () => {
    expect(validateTiers(TIERS)).toEqual({ valid: true, errors: [] });
  });
});

describe('pricing.js — unitPriceCents', () => {
  it('14. precio del tier + recargo de técnica', () => {
    const rule = makeRule({ technique_surcharge_cents: 500 });
    expect(unitPriceCents(rule, 12)).toBe(TIERS[1].unit_price_cents + 500);
  });
});

describe('pricing.js — sizeSurchargeCents', () => {
  it('15. suma recargos por talla multiplicados por cantidad', () => {
    const rule = makeRule({ size_surcharges_cents: { XXL: 2000 } });
    expect(sizeSurchargeCents(rule, { M: 10, XXL: 2 })).toBe(4000);
  });

  it('16. talla sin recargo configurado → 0', () => {
    const rule = makeRule({ size_surcharges_cents: {} });
    expect(sizeSurchargeCents(rule, { S: 5 })).toBe(0);
  });
});

describe('pricing.js — quote', () => {
  it('17. resuelve qty y tier correctos a partir del breakdown', () => {
    const rule = makeRule();
    const q = quote({ rule, breakdown: { S: 2, M: 4, L: 6 } });
    expect(q.qty).toBe(12);
    expect(q.tier_applied).toEqual(TIERS[1]);
  });

  it('18. invariante total_cents === subtotal + size_surcharge en 20 casos', () => {
    for (let i = 0; i < 20; i++) {
      const rule = makeRule({
        technique_surcharge_cents: i * 10,
        size_surcharges_cents: { XL: i * 100 },
      });
      const breakdown = { M: 5 + i, XL: i % 4 };
      const q = quote({ rule, breakdown });
      expect(q.total_cents).toBe(q.subtotal_cents + q.size_surcharge_cents);
    }
  });

  it('19. sin drift de float: unit 3333 × 7 exacto, Number.isInteger en todos los casos', () => {
    const rule = makeRule({
      tiers: [
        { min_qty: 1, max_qty: 10, unit_price_cents: 3333 },
        { min_qty: 11, max_qty: null, unit_price_cents: 3333 },
      ],
    });
    const q = quote({ rule, breakdown: { M: 7 } });
    expect(q.total_cents).toBe(23331);
    expect(Number.isInteger(q.total_cents)).toBe(true);

    for (let i = 0; i < 30; i++) {
      const r = makeRule({
        tiers: [{ min_qty: 1, max_qty: null, unit_price_cents: 1000 + i * 37 }],
        technique_surcharge_cents: i,
        size_surcharges_cents: { S: i * 3 },
      });
      const b = { S: 1 + i, M: i };
      const qi = quote({ rule: r, breakdown: b });
      expect(Number.isInteger(qi.total_cents)).toBe(true);
      expect(Number.isInteger(qi.subtotal_cents)).toBe(true);
      expect(Number.isInteger(qi.unit_price_cents)).toBe(true);
    }
  });

  it('20. propaga is_placeholder de la regla', () => {
    const rule = makeRule({ is_placeholder: true });
    const q = quote({ rule, breakdown: { M: 12 } });
    expect(q.is_placeholder).toBe(true);
  });

  it('23. quote.lines suma exactamente total_cents', () => {
    for (let i = 0; i < 15; i++) {
      const rule = makeRule({ size_surcharges_cents: { XL: i * 50 } });
      const breakdown = { M: 12 + i, XL: i };
      const q = quote({ rule, breakdown });
      const linesSum = q.lines.reduce((sum, line) => sum + line.amount_cents, 0);
      expect(linesSum).toBe(q.total_cents);
    }
  });
});

describe('pricing.js — quoteCart', () => {
  it('21. is_placeholder se propaga con OR: un placeholder contamina el carrito', () => {
    const placeholderRule = makeRule({ is_placeholder: true });
    const realRule = makeRule({ is_placeholder: false });
    const cart = quoteCart([
      { rule: placeholderRule, breakdown: { M: 12 } },
      { rule: realRule, breakdown: { M: 12 } },
    ]);
    expect(cart.is_placeholder).toBe(true);
  });

  it('22. carrito vacío → total_cents 0', () => {
    expect(quoteCart([]).total_cents).toBe(0);
  });
});

describe('pricing.js — isTestAccessToken', () => {
  it("24. 'TEST-123' es token de prueba, 'APP_USR-1' no", () => {
    expect(isTestAccessToken('TEST-123')).toBe(true);
    expect(isTestAccessToken('APP_USR-1')).toBe(false);
  });
});

describe('pricing.js — assertChargeable (candado de precios placeholder)', () => {
  const placeholderCart = quoteCart([{ rule: makeRule({ is_placeholder: true }), breakdown: { M: 12 } }]);
  const realCart = quoteCart([{ rule: makeRule({ is_placeholder: false }), breakdown: { M: 12 } }]);

  it('25. carrito placeholder + token de producción → lanza PLACEHOLDER_PRICING_IN_LIVE_MODE', () => {
    try {
      assertChargeable(placeholderCart, { accessToken: 'APP_USR-1' });
      throw new Error('debía lanzar');
    } catch (err) {
      expect(err).toBeInstanceOf(PricingError);
      expect(err.code).toBe('PLACEHOLDER_PRICING_IN_LIVE_MODE');
    }
  });

  it('26. carrito placeholder + token TEST- → no lanza', () => {
    expect(() => assertChargeable(placeholderCart, { accessToken: 'TEST-1' })).not.toThrow();
  });

  it('27. carrito real + token de producción → no lanza', () => {
    expect(() => assertChargeable(realCart, { accessToken: 'APP_USR-1' })).not.toThrow();
  });

  it('28. token vacío → lanza MpConfigError MISSING_ACCESS_TOKEN', () => {
    try {
      assertChargeable(realCart, { accessToken: '' });
      throw new Error('debía lanzar');
    } catch (err) {
      expect(err).toBeInstanceOf(MpConfigError);
      expect(err.code).toBe('MISSING_ACCESS_TOKEN');
    }
  });
});

describe('pricing.js — formatCentsMXN (re-verificación en el contrato de pricing)', () => {
  it('29. formatea centavos como pesos mexicanos', () => {
    expect(formatCentsMXN(123400)).toBe('$1,234.00');
    expect(formatCentsMXN(0)).toBe('$0.00');
    expect(formatCentsMXN(-500)).toBe('-$5.00');
    expect(formatCentsMXN(50)).toBe('$0.50');
  });
});

// ── Hallazgos de la puerta de revisión (incrementos 1-4) ──────────────────
describe('pricing.js — huecos de validación detectados en revisión', () => {
  it('T6. validateTiers([]) NO puede ser válido', () => {
    // Una regla de precio sin tramos pasaba la validación y sólo reventaba
    // después, en resolveTier. Si el panel de admin (incremento 13) usa
    // validateTiers para decidir si guarda, guardaría una regla incobrable.
    const { valid, errors } = validateTiers([]);
    expect(valid).toBe(false);
    expect(errors).toContainEqual({ code: 'NO_TIERS' });
  });

  it('T7. un carrito vacío no es cobrable ni con token de producción', () => {
    // Defensa en profundidad: buildPreferenceBody (§2.8) ya rechaza items
    // vacíos, pero el candado no debería dejar pasar una preferencia de $0
    // hasta allá.
    const cart = quoteCart([]);
    try {
      assertChargeable(cart, { accessToken: 'APP_USR-real' });
      throw new Error('debía lanzar');
    } catch (err) {
      expect(err.code).toBe('EMPTY_CART');
    }
  });

  it('T8. un carrito con total 0 tampoco es cobrable', () => {
    const freeRule = {
      id: 'r', garment_type_id: 'g', technique_id: 't',
      tiers: [{ min_qty: 1, max_qty: null, unit_price_cents: 0 }],
      technique_surcharge_cents: 0, size_surcharges_cents: {},
      currency: 'MXN', is_placeholder: false,
    };
    const cart = quoteCart([{ rule: freeRule, breakdown: { M: 12 } }]);
    expect(cart.total_cents).toBe(0);
    try {
      assertChargeable(cart, { accessToken: 'APP_USR-real' });
      throw new Error('debía lanzar');
    } catch (err) {
      expect(err.code).toBe('NON_POSITIVE_TOTAL');
    }
  });
});
