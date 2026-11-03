import Link from 'next/link';
import { requireAdmin } from '@/lib/auth';
import { money } from '@/lib/metrics';

export default async function Activity() {
  const { supabase } = await requireAdmin();
  const [activity, orders, opportunities, intents] = await Promise.all([
    supabase.from('sales_activity').select('id,opportunity_id,actor,kind,old_stage,new_stage,old_amount,new_amount,created_at').order('created_at',{ascending:false}).limit(100),
    supabase.from('orders').select('id,short_code,created_at').order('created_at',{ascending:false}).limit(500),
    supabase.from('sales_opportunities').select('id,order_id,quote_intent_id,folio,merged_into').limit(500),
    supabase.from('quote_intents').select('id,email,channel,started_at').order('started_at',{ascending:false}).limit(500),
  ]);
  if (activity.error || orders.error || opportunities.error || intents.error) throw new Error('No se pudo cargar actividad');
  const linked = new Set(opportunities.data.map(x=>x.order_id));
  const unmatched = orders.data.filter(x=>!linked.has(x.id));
  const byIntent = new Map(opportunities.data.map(x=>[x.quote_intent_id,x]));
  const candidates: {a:{id:string;folio:string};b:{id:string;folio:string}}[] = [];
  for (let i=0;i<intents.data.length && candidates.length<30;i++) for (let j=i+1;j<intents.data.length && candidates.length<30;j++) {
    const a=intents.data[i], b=intents.data[j];
    if (a.channel===b.channel || a.email.toLowerCase()!==b.email.toLowerCase()
      || Math.abs(Date.parse(a.started_at)-Date.parse(b.started_at))>7*86400000) continue;
    const x=byIntent.get(a.id), y=byIntent.get(b.id);
    if (x && y && !x.merged_into && !y.merged_into) candidates.push({a:x,b:y});
  }
  return <><div className="page-head"><p className="eyebrow">CONTROL</p><h1>Actividad</h1><p>Cambios comerciales y pedidos del Estudio pendientes de conciliación.</p></div>
    <section className="panel"><h2>Posibles solicitudes duplicadas</h2><p className="note">Mismo correo en Contacto y Estudio dentro de siete días. Revisa los trabajos antes de conciliar; pueden ser pedidos distintos.</p>
      {candidates.length ? <ul className="anomalies">{candidates.map(({a,b})=><li key={`${a.id}:${b.id}`}><Link href={`/oportunidades/${a.id}`}>{a.folio}</Link> ↔ <Link href={`/oportunidades/${b.id}`}>{b.folio}</Link></li>)}</ul> : <p className="empty">No hay candidatos entre las 500 solicitudes más recientes.</p>}</section>
    <section className="panel"><h2>Pedidos sin oportunidad vinculada</h2>
      {unmatched.length ? <ul className="anomalies">{unmatched.map(x=><li key={x.id}>Pedido {x.short_code} · {new Date(x.created_at).toLocaleDateString('es-MX')}</li>)}</ul> : <p className="empty">No hay pedidos sin vínculo entre los 500 más recientes.</p>}</section>
    <section className="panel table-wrap"><h2>Cambios recientes</h2><table><thead><tr><th>Fecha</th><th>Actor</th><th>Oportunidad</th><th>Cambio</th><th>Estado</th><th>Importe</th></tr></thead>
      <tbody>{activity.data.map(x=><tr key={x.id}><td>{new Date(x.created_at).toLocaleString('es-MX',{timeZone:'America/Mexico_City'})}</td>
        <td>{x.actor ? x.actor.slice(0,8) : 'sistema'}</td>
        <td>{x.opportunity_id ? <Link href={`/oportunidades/${x.opportunity_id}`}>Abrir folio</Link> : '—'}</td>
        <td>{x.kind}</td><td>{x.old_stage || '—'} → {x.new_stage || '—'}</td>
        <td>{money(Number(x.old_amount || 0))} → {money(Number(x.new_amount || 0))}</td></tr>)}</tbody></table>
      {!activity.data.length && <p className="empty">Aún no hay cambios registrados.</p>}</section></>;
}
