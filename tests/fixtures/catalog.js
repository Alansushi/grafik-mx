// Respuesta de /api/catalog congelada para los tests del canvas.
//
// Los valores replican los del seed real (supabase/seed/0001_catalog_placeholder.sql)
// para que el test hable de la misma prenda que el sistema de verdad, pero como
// fixture: así el proyecto "canvas" de Playwright corre hermético, sin Supabase,
// sin red y sin cuentas. Los ids son uuid fijos y no los reales de la base —
// nada en el motor de canvas depende de su valor, sólo de su forma.

export const CATALOG_FIXTURE = {
  garments: [
    {
      id: '11111111-1111-4111-8111-111111111111',
      slug: 'playera',
      name: 'Playera cuello redondo',
      base_mockup_url: 'procedural:tee',
      print_area: { x: 0.3, y: 0.26, width: 0.4, height: 0.34 },
      canvas_size: { width: 900, height: 900 },
      allowed_sizes: ['S', 'M', 'L', 'XL', 'XXL'],
      min_qty: 12,
      max_qty: 1000,
      sort_order: 1,
      variants: [
        { id: 'a1', garment_type_id: '11111111-1111-4111-8111-111111111111', color_hex: '#FFFFFF', color_name: 'Blanco', sort_order: 1 },
        { id: 'a2', garment_type_id: '11111111-1111-4111-8111-111111111111', color_hex: '#0C0C0C', color_name: 'Negro', sort_order: 2 },
        { id: 'a3', garment_type_id: '11111111-1111-4111-8111-111111111111', color_hex: '#9A9A9A', color_name: 'Gris Oxford', sort_order: 3 },
        { id: 'a4', garment_type_id: '11111111-1111-4111-8111-111111111111', color_hex: '#C1272D', color_name: 'Rojo', sort_order: 4 },
        { id: 'a5', garment_type_id: '11111111-1111-4111-8111-111111111111', color_hex: '#1B2A4A', color_name: 'Azul Marino', sort_order: 5 },
        { id: 'a6', garment_type_id: '11111111-1111-4111-8111-111111111111', color_hex: '#1F4FA3', color_name: 'Azul Rey', sort_order: 6 },
        { id: 'a7', garment_type_id: '11111111-1111-4111-8111-111111111111', color_hex: '#1E6B3A', color_name: 'Verde Bandera', sort_order: 7 },
        { id: 'a8', garment_type_id: '11111111-1111-4111-8111-111111111111', color_hex: '#F2C200', color_name: 'Amarillo', sort_order: 8 },
      ],
    },
    {
      id: '22222222-2222-4222-8222-222222222222',
      slug: 'gorra',
      name: 'Gorra',
      base_mockup_url: 'procedural:cap',
      print_area: { x: 0.32, y: 0.38, width: 0.36, height: 0.2 },
      canvas_size: { width: 900, height: 900 },
      allowed_sizes: ['U'],
      min_qty: 12,
      max_qty: 1000,
      sort_order: 2,
      variants: [
        { id: 'b1', garment_type_id: '22222222-2222-4222-8222-222222222222', color_hex: '#0C0C0C', color_name: 'Negro', sort_order: 1 },
        { id: 'b2', garment_type_id: '22222222-2222-4222-8222-222222222222', color_hex: '#FFFFFF', color_name: 'Blanco', sort_order: 2 },
        { id: 'b3', garment_type_id: '22222222-2222-4222-8222-222222222222', color_hex: '#1B2A4A', color_name: 'Azul Marino', sort_order: 3 },
      ],
    },
  ],
  techniques: [
    { id: 't1', slug: 'dtf', name: 'DTF', notes: 'Full color, buen detalle.', sort_order: 1 },
    { id: 't2', slug: 'bordado', name: 'Bordado', notes: 'La vista previa es referencial.', sort_order: 2 },
    { id: 't3', slug: 'sublimacion', name: 'Sublimación', notes: 'Sólo sobre tela clara.', sort_order: 3 },
  ],
};
