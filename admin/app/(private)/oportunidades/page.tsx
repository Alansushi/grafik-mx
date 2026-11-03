import Link from 'next/link';
import { salesData } from '@/lib/data';
import { money } from '@/lib/metrics';

export default async function Opportunities() {
  const { opportunities } = await salesData();
  const rows = opportunities.filter(x => !x.merged_into);
  return <><div className="page-head"><p className="eyebrow">SEGUIMIENTO</p><h1>Oportunidades</h1>
    <p>Abre un folio para ver los datos de contacto, confirmar la conversación y registrar el cobro.</p></div>
    <div className="panel table-wrap"><table><thead><tr><th>Folio</th><th>Fecha</th><th>Canal</th><th>Origen</th><th>Estado</th><th>Cobrado</th></tr></thead>
      <tbody>{rows.map(x => <tr key={x.id}><td><Link href={`/oportunidades/${x.id}`}>{x.folio}</Link></td>
        <td>{new Date(x.created_at).toLocaleDateString('es-MX', {timeZone:'America/Mexico_City'})}</td>
        <td>{x.channel}</td><td>{x.source || 'Desconocido'}</td><td><span className="pill">{x.stage}</span></td>
        <td>{money(Number(x.amount_collected))}</td></tr>)}</tbody></table>
      {!rows.length && <p className="empty">Aún no hay oportunidades registradas.</p>}</div></>;
}
