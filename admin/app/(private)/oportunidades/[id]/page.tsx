import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireAdmin } from '@/lib/auth';
import { mergeOpportunity, updateOpportunity } from '@/app/actions';
import { money } from '@/lib/metrics';

export default async function Detail({ params }: {params: Promise<{id:string}>}) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const { supabase } = await requireAdmin();
  const result = await supabase.from('sales_opportunities').select('id,folio,channel,stage,amount_collected,source,medium,campaign,attribution_note,created_at,whatsapp_clicked_at,conversation_confirmed_at,quote_intent_id,order_id,merged_into').eq('id',id).single();
  if (result.error || !result.data) notFound();
  const item = result.data;
  const [intent, other] = await Promise.all([
    item.quote_intent_id ? supabase.from('quote_intents').select('name,email,phone,service,details').eq('id',item.quote_intent_id).single() : Promise.resolve({data:null}),
    supabase.from('sales_opportunities').select('id,folio').is('merged_into',null).neq('id',id).order('created_at',{ascending:false}).limit(200),
  ]);
  return <><div className="page-head"><Link className="back" href="/oportunidades">← Oportunidades</Link><p className="eyebrow">FOLIO {item.folio}</p>
    <h1>{item.channel === 'whatsapp' ? 'Clic directo de WhatsApp' : 'Solicitud de cotización'}</h1>
    <p>Origen: {item.source || 'desconocido'} · Campaña: {item.campaign || 'sin campaña'} · {item.attribution_note}</p></div>
    {item.merged_into && <p className="notice">Este folio fue conciliado con otra oportunidad y no se cuenta en los reportes.</p>}
    <div className="detail-grid"><section className="panel"><h2>Seguimiento</h2>
      <p>Clic registrado: {item.whatsapp_clicked_at ? 'Sí' : 'No'} · Conversación confirmada: {item.conversation_confirmed_at ? 'Sí' : 'No'}</p>
      <form action={updateOpportunity}><input type="hidden" name="id" value={id} />
        <label>Estado<select name="stage" defaultValue={item.stage}>{['nueva','contactada','cotizada','ganada','perdida'].map(x=><option key={x}>{x}</option>)}</select></label>
        <label>Importe cobrado (MXN, sólo para ganada)<input name="amount" type="number" min="0" max="9999999999.99" step="0.01" defaultValue={item.amount_collected} /></label>
        <label className="checkbox"><input name="confirmed" type="checkbox" defaultChecked={Boolean(item.conversation_confirmed_at)} /> Confirmé la conversación en WhatsApp</label>
        <button disabled={Boolean(item.merged_into)}>Guardar cambios</button></form>
      <p className="note">Cobrado: {money(Number(item.amount_collected))}. El clic por sí solo no significa mensaje enviado.</p></section>
      <section className="panel"><h2>Datos de contacto</h2>{intent.data ? <dl>
        <dt>Nombre</dt><dd>{intent.data.name || '—'}</dd><dt>Correo</dt><dd>{intent.data.email}</dd>
        <dt>Teléfono</dt><dd>{intent.data.phone || '—'}</dd><dt>Servicio</dt><dd>{intent.data.service || '—'}</dd>
        <dt>Detalles</dt><dd>{intent.data.details || '—'}</dd></dl> : <p>El clic directo no capturó datos personales. Busca el folio en WhatsApp.</p>}</section></div>
      {!item.merged_into && <section className="panel"><h2>Conciliar folios</h2><p>Si Contacto y Estudio corresponden al mismo cliente, conserva un folio principal. El folio de origen debe tener importe cobrado igual a cero.</p>
      <form action={mergeOpportunity} className="inline-form"><input type="hidden" name="id" value={id} />
        <select name="target" required defaultValue=""><option value="" disabled>Elegir folio principal</option>{other.data?.map(x=><option key={x.id} value={x.id}>{x.folio}</option>)}</select>
        <button>Conciliar</button></form></section>}</>;
}
