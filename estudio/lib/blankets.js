// Medidas públicas de frazada. Son precios base de referencia, no una cotización.
export const BLANKET_SIZES = Object.freeze([
  { code: 'P', name: 'Personal', widthCm: 100, heightCm: 150, priceCents: 41000,
    canvas: { width: 600, height: 900 }, mockup: '/assets/estudio/frazada-personal.png' },
  { code: 'I', name: 'Individual', widthCm: 200, heightCm: 150, priceCents: 53000,
    canvas: { width: 1200, height: 900 }, mockup: '/assets/estudio/frazada-individual.png' },
  { code: 'M', name: 'Matrimonial', widthCm: 220, heightCm: 150, priceCents: 63000,
    canvas: { width: 1320, height: 900 }, mockup: '/assets/estudio/frazada-matrimonial.png' },
]);

export function blanketSize(code) {
  return BLANKET_SIZES.find((size) => size.code === code) ?? null;
}

export function coverTransform(image, canvas) {
  const scale = Math.max(canvas.width / image.width, canvas.height / image.height);
  return { x: (canvas.width - image.width * scale) / 2,
    y: (canvas.height - image.height * scale) / 2,
    scaleX: scale, scaleY: scale, rotation: 0 };
}

export function clampBlanketTransform(raw, image, canvas) {
  const minimum = coverTransform(image, canvas).scaleX;
  const scale = Math.min(Math.max(Number(raw.scaleX) || minimum, minimum), minimum * 4);
  return { x: Math.min(0, Math.max(canvas.width - image.width * scale, Number(raw.x) || 0)),
    y: Math.min(0, Math.max(canvas.height - image.height * scale, Number(raw.y) || 0)),
    scaleX: scale, scaleY: scale, rotation: 0 };
}

export function blanketQuality(image, code, transform) {
  const size = blanketSize(code);
  if (!size || !(image?.width > 0) || !(image?.height > 0)) return null;
  const actual = transform ?? coverTransform(image, size.canvas);
  const dpi = Math.min(size.canvas.width / actual.scaleX / (size.widthCm / 2.54),
    size.canvas.height / actual.scaleY / (size.heightCm / 2.54));
  return { dpi: Math.round(dpi), level: dpi < 100 ? 'fail' : dpi < 150 ? 'warn' : 'ok' };
}

export function buildBlanketItems({ garmentId, variantId, breakdown, originalPath, previews, transforms }) {
  return BLANKET_SIZES.filter(({ code }) => breakdown[code] > 0).map(({ code }) => ({
    garment_type_id: garmentId, garment_variant_id: variantId, technique_id: null,
    size_breakdown: { [code]: breakdown[code] }, logo_path: originalPath,
    preview_path: previews[code], logo_transform: transforms[code],
  }));
}

export function validateBlanketItems(items, maxQty = 1000) {
  if (!Array.isArray(items) || items.length < 1 || items.length > 3) return { valid: false, error: 'INVALID_BREAKDOWN' };
  const used = new Set();
  const previews = new Set();
  let total = 0;
  for (const item of items) {
    const entries = Object.entries(item.size_breakdown ?? {});
    if (entries.length !== 1) return { valid: false, error: 'INVALID_BREAKDOWN' };
    const [code, qty] = entries[0];
    if (!blanketSize(code) || used.has(code) || !Number.isInteger(qty) || qty < 1) {
      return { valid: false, error: 'INVALID_BREAKDOWN' };
    }
    used.add(code);
    total += qty;
    if (item.logo_path !== items[0].logo_path || previews.has(item.preview_path)) {
      return { valid: false, error: 'INVALID_BLANKET_ASSETS' };
    }
    previews.add(item.preview_path);
  }
  return total <= maxQty ? { valid: true, total } : { valid: false, error: 'INVALID_BREAKDOWN' };
}
