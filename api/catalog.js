// GET /api/catalog — prendas, colores, técnicas y área imprimible.
//
// DECISIÓN DE SEGURIDAD: este endpoint usa la ANON KEY, no la service_role.
//
// Podría usar service_role como el resto, y funcionaría igual. Se usa la anon
// key a propósito: con ella, `pricing_rules` no es siquiera alcanzable (devuelve
// 401 por los GRANT de 0003_rls.sql), así que filtrar precios desde aquí es
// estructuralmente imposible — no depende de que yo recuerde no incluirlos en el
// SELECT. Es el mismo principio que hace que /api/checkout re-cotice del lado
// del servidor: quitar la posibilidad, no confiar en la disciplina.
//
// Efecto secundario útil: el navegador nunca recibe ninguna key de Supabase. El
// configurador público no carga supabase-js.

import { readEnv } from './_lib/env.js';
import { json, requireMethod } from './_lib/http.js';
import { buildPostgrestUrl, sbHeaders } from './_lib/supabase.js';
import { logError } from './_lib/log.js';

// Sin cabecera de caché a propósito, aunque el catálogo sea el candidato obvio.
//
// vercel.json pone `Cache-Control: no-store` a TODO /api/*, y esa regla se
// queda así: es la opción segura por defecto. Cachear el catálogo ahorraría
// poco (la consulta es diminuta y Supabase está en la misma región que las
// Functions), mientras que una excepción en el patrón —o un endpoint nuevo que
// caiga fuera de ella por descuido— podría dejar una respuesta con datos de un
// pedido en el CDN. El intercambio no está parejo.
//
// Si algún día el catálogo pesa, se cachea en el cliente, no en el borde.

export default async function handler(req, res) {
  if (!requireMethod(req, res, 'GET')) return;

  let supabaseUrl;
  let anonKey;
  try {
    supabaseUrl = readEnv(process.env, 'SUPABASE_URL', { required: true });
    anonKey = readEnv(process.env, 'SUPABASE_ANON_KEY', { required: true });
  } catch (err) {
    logError('catalog', err);
    return json(res, 503, { error: 'NOT_CONFIGURED' });
  }

  const headers = sbHeaders({ key: anonKey });

  try {
    const [types, variants, techniques] = await Promise.all([
      fetchAll(supabaseUrl, headers, 'garment_types',
        'id,slug,name,base_mockup_url,print_area,canvas_size,print_area_width_cm,allowed_sizes,min_qty,max_qty,sort_order'),
      fetchAll(supabaseUrl, headers, 'garment_variants',
        'id,garment_type_id,color_hex,color_name,sort_order'),
      fetchAll(supabaseUrl, headers, 'print_techniques',
        'id,slug,name,notes,sort_order'),
    ]);

    // Se anidan las variantes bajo su prenda: el configurador siempre las usa
    // juntas y así evita una correlación en el cliente.
    const bySort = (a, b) => a.sort_order - b.sort_order;
    const garments = types.sort(bySort).map((t) => ({
      ...t,
      variants: variants.filter((v) => v.garment_type_id === t.id).sort(bySort),
    }));

    return json(res, 200, {
      garments,
      techniques: techniques.sort(bySort),
    });
  } catch (err) {
    logError('catalog', err);
    return json(res, 502, { error: 'CATALOG_UNAVAILABLE' });
  }
}

async function fetchAll(baseUrl, headers, table, select) {
  const url = buildPostgrestUrl(baseUrl, table, { select, order: 'sort_order.asc' });
  const r = await fetch(url, { headers });
  if (!r.ok) {
    const body = await r.text().catch(() => '(sin cuerpo)');
    throw new Error(`PostgREST ${r.status} en ${table}: ${body.slice(0, 200)}`);
  }
  return r.json();
}
