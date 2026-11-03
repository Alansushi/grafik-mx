import { salesData } from '@/lib/data';
import { campaignRows, money } from '@/lib/metrics';
import { saveSpend } from '@/app/actions';

export default async function Campaigns() {
  const { opportunities, spend } = await salesData();
  const rows = campaignRows(opportunities, spend);
  return <><div className="page-head"><p className="eyebrow">ATRIBUCIÓN</p><h1>Campañas</h1>
    <p>Gasto mensual frente a oportunidades, ventas e ingresos cobrados del primer origen conocido.</p></div>
    <section className="panel"><h2>Cargar gasto mensual</h2><form action={saveSpend} className="spend-form">
      <label>Mes<input name="month" type="month" required /></label><label>Origen UTM<input name="source" maxLength={100} placeholder="google" required /></label>
      <label>Campaña UTM<input name="campaign" maxLength={100} placeholder="temporada" required /></label>
      <label>Gasto MXN<input name="amount" type="number" min="0" step="0.01" required /></label><button>Guardar gasto</button></form>
      <p className="note">El mismo mes, origen y campaña actualiza el importe existente. Usa los mismos valores que en los enlaces UTM.</p></section>
    <section className="panel table-wrap"><h2>Resultados por campaña</h2><table><thead><tr><th>Mes</th><th>Origen / campaña</th><th>Gasto</th><th>Oportunidades</th><th>Ventas</th><th>Ingresos</th><th>Costo/oportunidad</th><th>Costo/venta</th><th>Retorno</th></tr></thead>
      <tbody>{rows.map(x=><tr key={`${x.month}:${x.source}:${x.campaign}`}><td>{x.month}</td><td>{x.source}<br/><small>{x.campaign}</small></td>
        <td>{money(x.spend)}</td><td>{x.opportunities}</td><td>{x.sales}</td><td>{money(x.revenue)}</td>
        <td>{x.opportunities && x.spend ? money(x.spend/x.opportunities) : '—'}</td>
        <td>{x.sales && x.spend ? money(x.spend/x.sales) : '—'}</td>
        <td>{x.spend ? `${(x.revenue/x.spend).toFixed(2)}×` : '—'}</td></tr>)}</tbody></table>
      {!rows.length && <p className="empty">Aún no hay campañas ni gasto cargado.</p>}
      <p className="note">El retorno es ingresos cobrados / gasto publicitario. No es utilidad.</p></section></>;
}
