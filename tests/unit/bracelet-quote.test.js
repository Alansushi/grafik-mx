import { describe, it, expect } from 'vitest';
import { validateQuoteItemInput, validTechniqueForGarment, validBraceletBreakdown, validateCatalogBreakdown } from '../../api/submit-quote.js';

const draft = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const item = {
  garment_type_id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
  garment_variant_id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
  technique_id: null,
  logo_path: `2026/10/${draft}/imagen.png`,
  preview_path: `2026/10/${draft}/item-0-preview.png`,
  logo_transform: { x: 500, y: 216, scaleX: 1, scaleY: 1, rotation: 0 },
};

describe('pedido de pulsera', () => {
  it('exige original, preview y transform del borrador propio', () => {
    expect(validateQuoteItemInput(item, draft)).toBeNull();
    expect(validateQuoteItemInput({ ...item, logo_path: '' }, draft)).toEqual({ error: 'PATH_NOT_IN_DRAFT', field: 'logo_path' });
    expect(validateQuoteItemInput({ ...item, preview_path: item.preview_path.replace(draft, 'dddddddd-dddd-4ddd-8ddd-dddddddddddd') }, draft))
      .toEqual({ error: 'PATH_NOT_IN_DRAFT', field: 'preview_path' });
    expect(validateQuoteItemInput({ ...item, logo_transform: null }, draft)).toEqual({ error: 'MISSING_TRANSFORM' });
  });

  it('admite técnica pendiente únicamente en pulsera', () => {
    const technique = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
    expect(validTechniqueForGarment(null, 'bracelet')).toBe(true);
    expect(validTechniqueForGarment(null, 'garment')).toBe(false);
    expect(validTechniqueForGarment(technique, 'garment')).toBe(true);
    expect(validTechniqueForGarment(technique, 'bracelet')).toBe(false);
  });

  it('requiere una cantidad única positiva', () => {
    expect(validBraceletBreakdown({ U: 48 })).toBe(true);
    expect(validBraceletBreakdown({})).toBe(false);
    expect(validBraceletBreakdown({ U: 0 })).toBe(false);
    expect(validBraceletBreakdown({ U: 12, M: 1 })).toBe(false);
  });

  it('aplica el mínimo del catálogo sólo a pulseras', () => {
    const bracelet = { render_type: 'bracelet', allowed_sizes: ['U'], min_qty: 100 };
    for (const qty of [99, 100, 101]) {
      const result = validateCatalogBreakdown({ U: qty }, bracelet);
      expect(result.valid, `Pulsera ${qty}`).toBe(qty >= 100);
      if (qty === 99) expect(result.errors).toContainEqual({ code: 'BELOW_MIN', min: 100, got: 99 });
    }
    for (const garment of [
      { render_type: 'garment', allowed_sizes: ['S', 'M'], min_qty: 12 },
      { render_type: 'garment', allowed_sizes: ['U'], min_qty: 12 },
    ]) {
      const size = garment.allowed_sizes[0];
      expect(validateCatalogBreakdown({ [size]: 1 }, garment).valid).toBe(true);
    }
  });
});
