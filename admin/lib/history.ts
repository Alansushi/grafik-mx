import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { requireAdmin } from './auth';

export type HistoryRow = Record<string, unknown>;

async function allRows(client: SupabaseClient, table: string, columns: string, order: string) {
  const rows: HistoryRow[] = [];
  for (let offset = 0; ; offset += 1000) {
    const page = await client.from(table).select(columns).order(order, { ascending: false }).range(offset, offset + 999);
    if (page.error) throw new Error(`No se pudo cargar el histórico de ${table}`);
    rows.push(...page.data as unknown as HistoryRow[]);
    if (page.data.length < 1000) break;
  }
  return rows;
}

export async function historyData() {
  const { supabase } = await requireAdmin();
  const [events, firstEvent, directClicks, studioClicks, legacyClicks, eventTypes, emailHistory,
    daily, sources, ctas, sections, form, studio, problems, quotes, orders] = await Promise.all([
    supabase.from('site_events').select('id', { count: 'exact', head: true }),
    supabase.from('site_events').select('ts').order('ts', { ascending: true }).limit(1),
    supabase.from('site_events').select('id', { count: 'exact', head: true }).eq('event', 'direct_whatsapp_click'),
    supabase.from('site_events').select('id', { count: 'exact', head: true }).eq('event', 'studio_whatsapp_click'),
    supabase.from('v_sales_legacy_whatsapp_clicks').select('clics_sin_folio').single(),
    allRows(supabase, 'v_sales_event_history', 'event,eventos,sesiones,primer_evento,ultimo_evento', 'eventos'),
    allRows(supabase, 'v_sales_email_history', 'tipo,categoria,resultado,registros', 'registros'),
    allRows(supabase, 'v_intent_daily', 'dia,sesiones,sesiones_con_cta,pct_intencion,mediana_ms_primer_cta', 'dia'),
    allRows(supabase, 'v_source_intent', 'fuente,utm_medium,utm_campaign,device,sesiones,sesiones_con_cta,pct_intencion', 'sesiones'),
    allRows(supabase, 'v_cta_performance', 'cta_id,kind,clics,sesiones,pct_de_clics', 'clics'),
    allRows(supabase, 'v_section_reach', 'seccion,sesiones_que_la_vieron,pct_de_sesiones', 'sesiones_que_la_vieron'),
    allRows(supabase, 'v_form_funnel', 'dia,device,sesiones,vieron_contacto,empezaron,eligieron_servicio,enviaron', 'dia'),
    allRows(supabase, 'v_studio_funnel', 'dia,device,sesiones,listos,subieron_logo,colocaron_logo,pusieron_tallas,enviaron', 'dia'),
    allRows(supabase, 'v_studio_problems', 'tipo,donde,detalle,veces,sesiones', 'veces'),
    allRows(supabase, 'v_quote_funnel', 'dia,channel,device,fuente,intentos,solicitudes,recordatorios,regresos,pedidos', 'dia'),
    allRows(supabase, 'orders', 'short_code,status,created_at,total_cents,priced_with_placeholder', 'created_at'),
  ]);
  if (events.error || firstEvent.error || directClicks.error || studioClicks.error || legacyClicks.error)
    throw new Error('No se pudo cargar la cobertura histórica');
  return { eventCount: events.count ?? 0, firstEventAt: firstEvent.data[0]?.ts ?? null,
    directClickCount: directClicks.count ?? 0, studioClickCount: studioClicks.count ?? 0,
    legacyClickCount: Number(legacyClicks.data.clics_sin_folio), eventTypes, emailHistory,
    daily, sources, ctas, sections, form, studio, problems, quotes, orders };
}
