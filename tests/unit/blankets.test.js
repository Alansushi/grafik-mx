import { describe, it, expect } from 'vitest';
import {
  BLANKET_SIZES, blanketSize, coverTransform, clampBlanketTransform,
  blanketQuality, buildBlanketItems, validateBlanketItems,
} from '../../estudio/lib/blankets.js';

describe('frazadas', () => {
  it('expone las tres medidas y sus precios base por pieza', () => {
    expect(BLANKET_SIZES.map(({ code, widthCm, heightCm, priceCents }) =>
      [code, widthCm, heightCm, priceCents])).toEqual([
      ['P', 100, 150, 41000], ['I', 200, 150, 53000], ['M', 220, 150, 63000],
    ]);
    expect(blanketSize('XL')).toBeNull();
  });

  it('cubre el lienzo y limita el arrastre para no dejar tela vacía', () => {
    expect(coverTransform({ width: 600, height: 600 }, { width: 600, height: 900 }))
      .toEqual({ x: -150, y: 0, scaleX: 1.5, scaleY: 1.5, rotation: 0 });
    expect(clampBlanketTransform({ x: 50, y: -5000, scaleX: 1.5, scaleY: 1.5, rotation: 0 },
      { width: 600, height: 600 }, { width: 600, height: 900 }))
      .toEqual({ x: 0, y: 0, scaleX: 1.5, scaleY: 1.5, rotation: 0 });
  });

  it('advierte cuando la imagen queda bajo 100 dpi en la medida física', () => {
    expect(blanketQuality({ width: 1200, height: 1800 }, 'P').level).toBe('fail');
    expect(blanketQuality({ width: 10000, height: 15000 }, 'P').level).toBe('ok');
  });

  it('crea una línea por medida solicitada y conserva los recortes independientes', () => {
    const transforms = {
      P: { x: -100, y: 0, scaleX: 1, scaleY: 1, rotation: 0 },
      M: { x: -30, y: -20, scaleX: 2, scaleY: 2, rotation: 0 },
    };
    expect(buildBlanketItems({ garmentId: 'g', variantId: 'v', breakdown: { P: 1, I: 0, M: 2 },
      originalPath: 'original', previews: { P: 'preview-p', M: 'preview-m' }, transforms }))
      .toEqual([
        { garment_type_id: 'g', garment_variant_id: 'v', technique_id: null,
          size_breakdown: { P: 1 }, logo_path: 'original', preview_path: 'preview-p', logo_transform: transforms.P },
        { garment_type_id: 'g', garment_variant_id: 'v', technique_id: null,
          size_breakdown: { M: 2 }, logo_path: 'original', preview_path: 'preview-m', logo_transform: transforms.M },
      ]);
  });

  it('rechaza medidas repetidas, cantidades inválidas y originales distintos', () => {
    const line = (size, qty, path = 'same') => ({ size_breakdown: { [size]: qty }, logo_path: path, preview_path: `preview-${size}` });
    expect(validateBlanketItems([line('P', 1), line('I', 2)]).valid).toBe(true);
    expect(validateBlanketItems([line('P', 1), line('P', 2)]).valid).toBe(false);
    expect(validateBlanketItems([line('P', 0)]).valid).toBe(false);
    expect(validateBlanketItems([line('P', 1), line('I', 1, 'other')]).valid).toBe(false);
    expect(validateBlanketItems([line('XL', 1)]).valid).toBe(false);
    expect(validateBlanketItems([line('P', 1), line('I', 1, 'same')
      .valueOf()].map((it) => ({ ...it, preview_path: 'duplicate' }))).valid).toBe(false);
  });
});
