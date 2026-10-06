// Respuesta de /api/catalog congelada para los tests del canvas.
//
// Replica el catálogo REAL de producción (grafik.mx/api/catalog): mismas fotos
// (copias en tests/fixtures/mockups/), mismos canvas_size, print_area,
// print_area_width_cm y colores. Los ids son uuid fijos y no los reales de la
// base — nada en el motor de canvas depende de su valor, sólo de su forma.
//
// Las fotos son copias de las del bucket `mockups` de Supabase, con el mismo
// nombre versionado. Al cambiar una foto en producción hay que traerla aquí y
// copiar también canvas_size / print_area / print_area_width_cm (ver CLAUDE.md,
// "Mockups de prenda"). El motor ya no tiene mockup procedural en los tests: la
// silueta ilustrada no existe en producción y ocultaba problemas reales (otro
// tamaño de lienzo, otra área imprimible, sombreado de una foto de verdad).

const MOCKUPS = '/tests/fixtures/mockups';

export const CATALOG_FIXTURE = {
  garments: [
    {
      id: '11111111-1111-4111-8111-111111111111',
      slug: 'playera',
      name: 'Playera cuello redondo',
      base_mockup_url: `${MOCKUPS}/playera-front-v3.png`,
      print_area: { x: 0.321, y: 0.19, width: 0.358, height: 0.3 },
      canvas_size: { width: 964, height: 900 },
      print_area_width_cm: 31.6,
      allowed_sizes: ['S', 'M', 'L', 'XL', 'XXL'],
      min_qty: 12,
      max_qty: 1000,
      sort_order: 1,
      // Vista de presentación (espalda): sin print_area, no es imprimible.
      views: [
        { id: 'av1', garment_type_id: '11111111-1111-4111-8111-111111111111', slug: 'back', name: 'Espalda', base_mockup_url: `${MOCKUPS}/playera-back-v1.png`, canvas_size: { width: 964, height: 900 }, sort_order: 1 },
      ],
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
      base_mockup_url: `${MOCKUPS}/gorra-front-v1.png`,
      print_area: { x: 0.388, y: 0.37, width: 0.22, height: 0.16 },
      canvas_size: { width: 1246, height: 700 },
      print_area_width_cm: 11.0,
      allowed_sizes: ['U'],
      min_qty: 12,
      max_qty: 1000,
      sort_order: 2,
      views: [
        { id: 'bv1', garment_type_id: '22222222-2222-4222-8222-222222222222', slug: 'left', name: 'Lado izquierdo', base_mockup_url: `${MOCKUPS}/gorra-left-v1.png`, canvas_size: { width: 1246, height: 700 }, sort_order: 1 },
        { id: 'bv2', garment_type_id: '22222222-2222-4222-8222-222222222222', slug: 'right', name: 'Lado derecho', base_mockup_url: `${MOCKUPS}/gorra-right-v1.png`, canvas_size: { width: 1246, height: 700 }, sort_order: 2 },
      ],
      variants: [
        { id: 'b1', garment_type_id: '22222222-2222-4222-8222-222222222222', color_hex: '#0C0C0C', color_name: 'Negro', sort_order: 1 },
        { id: 'b2', garment_type_id: '22222222-2222-4222-8222-222222222222', color_hex: '#FFFFFF', color_name: 'Blanco', sort_order: 2 },
        { id: 'b3', garment_type_id: '22222222-2222-4222-8222-222222222222', color_hex: '#1B2A4A', color_name: 'Azul Marino', sort_order: 3 },
        { id: 'b4', garment_type_id: '22222222-2222-4222-8222-222222222222', color_hex: '#C1272D', color_name: 'Rojo', sort_order: 4 },
        { id: 'b5', garment_type_id: '22222222-2222-4222-8222-222222222222', color_hex: '#9A9A9A', color_name: 'Gris Oxford', sort_order: 5 },
        { id: 'b6', garment_type_id: '22222222-2222-4222-8222-222222222222', color_hex: '#C3B091', color_name: 'Caqui', sort_order: 6 },
      ],
    },
  ],
  techniques: [
    { id: 't1', slug: 'dtf', name: 'DTF', notes: 'Transferencia directa de película. Full color, buen detalle, sin mínimo de tintas.', sort_order: 1 },
    { id: 't2', slug: 'bordado', name: 'Bordado', notes: 'Acabado en hilo. La vista previa es referencial: la textura real del bordado no se puede replicar en una imagen plana.', sort_order: 2 },
    { id: 't3', slug: 'sublimacion', name: 'Sublimación', notes: 'Sólo sobre tela clara con alto contenido de poliéster. El color de la prenda condiciona el resultado.', sort_order: 3 },
  ],
};
