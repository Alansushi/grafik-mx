import { salesData } from '@/lib/data';
import { money, pct, summary } from '@/lib/metrics';
import Link from 'next/link';

export default async function Home() {
  const data = await salesData();
  const m = summary(data.opportunities, data.spend);
  return <><div className="page-head"><p className="eyebrow">GRAFIK / ADMIN</p><h1>Resumen de ventas</h1>
    <p>Del clic registrado al importe cobrado. Un clic no confirma que se envió un mensaje.</p></div>
    <section className="cards" aria-label="Embudo">
      <div className="card"><small>Clics de WhatsApp</small><strong>{m.clicks}</strong></div>
      <div className="card"><small>Oportunidades</small><strong>{m.opportunities}</strong></div>
      <div className="card"><small>Conversaciones confirmadas</small><strong>{m.conversations}</strong></div>
      <div className="card"><small>Contactadas</small><strong>{m.contacted}</strong></div>
      <div className="card"><small>Cotizadas</small><strong>{m.quoted}</strong></div>
      <div className="card accent"><small>Ventas ganadas</small><strong>{m.won}</strong></div>
    </section>
    <section className="cards financial" aria-label="Importes">
      <div className="card"><small>Importe cobrado</small><strong>{money(m.revenue)}</strong></div>
      <div className="card"><small>Gasto publicitario cargado</small><strong>{money(m.spend)}</strong></div>
      <div className="card"><small>Retorno publicitario (ingresos / gasto)</small><strong>{m.roas === null ? '—' : `${m.roas.toFixed(2)}×`}</strong></div>
    </section>
    <section className="panel"><h2>Conversión y costos</h2><div className="metric-grid">
      <p>Tasa de contacto <b>{pct(m.contactRate)}</b></p><p>Tasa de venta <b>{pct(m.winRate)}</b></p>
      <p>Costo por oportunidad <b>{m.costPerOpportunity === null ? '—' : money(m.costPerOpportunity)}</b></p>
      <p>Costo por venta <b>{m.costPerSale === null ? '—' : money(m.costPerSale)}</b></p></div>
      <p className="note">El retorno publicitario compara ingresos cobrados con gasto cargado; no representa utilidad. Atribución al primer origen conocido de cada oportunidad.</p>
      <p><Link href="/historico">Ver visitas, clics, solicitudes y pedidos históricos →</Link></p></section></>;
}
