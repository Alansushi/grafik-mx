import type { ReactNode } from 'react';
import { historyData, type HistoryRow } from '@/lib/history';
import { money } from '@/lib/metrics';

const value = (row: HistoryRow, key: string) => String(row[key] ?? '—');
const number = (row: HistoryRow, key: string) => Number(row[key] ?? 0);
const total = (rows: HistoryRow[], key: string) => rows.reduce((sum, row) => sum + number(row, key), 0);
const date = (raw: unknown) => raw ? new Date(String(raw)).toLocaleDateString('es-MX', { timeZone: 'America/Mexico_City' }) : '—';
type Column = { label: string; show: (row: HistoryRow) => ReactNode };

function HistoryTable({ title, note, rows, columns }: { title: string; note?: string; rows: HistoryRow[]; columns: Column[] }) {
  return <section className="panel history-panel"><h2>{title}</h2>{note && <p className="note">{note}</p>}
    {rows.length ? <div className="table-wrap"><table><thead><tr>{columns.map(column => <th key={column.label}>{column.label}</th>)}</tr></thead>
      <tbody>{rows.map((row, index) => <tr key={index}>{columns.map(column => <td key={column.label}>{column.show(row)}</td>)}</tr>)}</tbody></table></div>
      : <p className="empty">Aún no hay registros para esta sección.</p>}</section>;
}

export default async function History() {
  const h = await historyData();
  const siteSessions = total(h.daily, 'sesiones');
  const studioSessions = total(h.studio, 'sesiones');
  const captured = total(h.quotes, 'intentos');
  const completed = total(h.quotes, 'solicitudes');
  const waCtaClicks = h.ctas.filter(row => row.kind === 'whatsapp').reduce((sum, row) => sum + number(row, 'clics'), 0);
  const waClicks = waCtaClicks + h.directClickCount + h.studioClickCount;
  return <><div className="page-head"><p className="eyebrow">ARCHIVO DE MEDICIÓN</p><h1>Histórico</h1>
    <p>Datos guardados desde que empezó cada captura; incluye registros anteriores al panel. Las fechas se agrupan en hora de Ciudad de México.</p></div>
    <section className="cards" aria-label="Cobertura histórica">
      <div className="card"><small>Primer evento guardado</small><strong className="history-date">{date(h.firstEventAt)}</strong></div>
      <div className="card"><small>Eventos guardados</small><strong>{h.eventCount}</strong></div>
      <div className="card"><small>Sesiones del sitio</small><strong>{siteSessions}</strong></div>
      <div className="card"><small>Sesiones del Estudio</small><strong>{studioSessions}</strong></div>
      <div className="card"><small>Clics de WhatsApp medidos</small><strong>{waClicks}</strong></div>
      <div className="card"><small>Clics antiguos sin folio</small><strong>{h.legacyClickCount}</strong></div>
      <div className="card"><small>Solicitudes iniciadas / completadas</small><strong>{captured} / {completed}</strong></div>
      <div className="card"><small>Pedidos del Estudio</small><strong>{h.orders.length}</strong></div>
    </section>
    <p className="note history-caveat">Los clics antiguos sin folio son eventos históricos, no oportunidades atribuibles a una persona. Los importes cotizados de pedidos no son cobros. El resumen de ventas muestra sólo importes registrados como cobrados.</p>

    <HistoryTable title="Eventos registrados" note="Cada fila resume todo el histórico de un tipo de evento, sin datos personales."
      rows={h.eventTypes} columns={[
        {label:'Evento',show:r=>value(r,'event')},{label:'Eventos',show:r=>number(r,'eventos')},
        {label:'Sesiones',show:r=>number(r,'sesiones')},{label:'Primero',show:r=>date(r.primer_evento)},
        {label:'Más reciente',show:r=>date(r.ultimo_evento)},
      ]} />

    <HistoryTable title="Visitas e intención por día" note="Una sesión es una pestaña medida, no una persona única. Una sesión con CTA indica interacción, no mensaje enviado."
      rows={h.daily} columns={[
        {label:'Día',show:r=>value(r,'dia')},{label:'Sesiones',show:r=>number(r,'sesiones')},
        {label:'Con CTA',show:r=>number(r,'sesiones_con_cta')},{label:'Tasa',show:r=>`${value(r,'pct_intencion')} %`},
        {label:'Mediana al primer CTA',show:r=>r.mediana_ms_primer_cta == null ? '—' : `${Math.round(number(r,'mediana_ms_primer_cta')/1000)} s`},
      ]} />
    <HistoryTable title="Origen de las visitas" note="El origen de una sesión anónima no se une automáticamente a una venta."
      rows={h.sources} columns={[
        {label:'Fuente',show:r=>value(r,'fuente')},{label:'Medio',show:r=>value(r,'utm_medium')},
        {label:'Campaña',show:r=>value(r,'utm_campaign')},{label:'Dispositivo',show:r=>value(r,'device')},
        {label:'Sesiones',show:r=>number(r,'sesiones')},{label:'Con CTA',show:r=>number(r,'sesiones_con_cta')},
        {label:'Tasa',show:r=>`${value(r,'pct_intencion')} %`},
      ]} />
    <HistoryTable title="Botones usados" note="Los enlaces directos adicionales y las aperturas del Estudio suman al total de WhatsApp de arriba; esta tabla desglosa los CTA de la landing."
      rows={h.ctas} columns={[
        {label:'Botón',show:r=>value(r,'cta_id')},{label:'Tipo',show:r=>value(r,'kind')},
        {label:'Clics',show:r=>number(r,'clics')},{label:'Sesiones',show:r=>number(r,'sesiones')},
        {label:'Peso',show:r=>`${value(r,'pct_de_clics')} %`},
      ]} />
    <HistoryTable title="Secciones vistas" rows={h.sections} columns={[
      {label:'Sección',show:r=>value(r,'seccion')},{label:'Sesiones',show:r=>number(r,'sesiones_que_la_vieron')},
      {label:'Alcance',show:r=>`${value(r,'pct_de_sesiones')} %`},
    ]} />
    <HistoryTable title="Formulario de contacto" note="Cada paso cuenta sesiones que lo hicieron; no es un embudo estrictamente anidado."
      rows={h.form} columns={[
        {label:'Día',show:r=>value(r,'dia')},{label:'Dispositivo',show:r=>value(r,'device')},
        {label:'Sesiones',show:r=>number(r,'sesiones')},{label:'Vieron contacto',show:r=>number(r,'vieron_contacto')},
        {label:'Empezaron',show:r=>number(r,'empezaron')},{label:'Eligieron servicio',show:r=>number(r,'eligieron_servicio')},
        {label:'Enviaron',show:r=>number(r,'enviaron')},
      ]} />
    <HistoryTable title="Solicitudes guardadas" note="Iniciada y completada son estados de la captura; completada no prueba que se envió WhatsApp."
      rows={h.quotes} columns={[
        {label:'Día',show:r=>value(r,'dia')},{label:'Canal',show:r=>value(r,'channel')},
        {label:'Fuente',show:r=>value(r,'fuente')},{label:'Iniciadas',show:r=>number(r,'intentos')},
        {label:'Completadas',show:r=>number(r,'solicitudes')},{label:'Recordatorios',show:r=>number(r,'recordatorios')},
        {label:'Regresos',show:r=>number(r,'regresos')},{label:'Pedidos vinculados',show:r=>number(r,'pedidos')},
      ]} />
    <HistoryTable title="Uso del Estudio" rows={h.studio} columns={[
      {label:'Día',show:r=>value(r,'dia')},{label:'Dispositivo',show:r=>value(r,'device')},
      {label:'Sesiones',show:r=>number(r,'sesiones')},{label:'Listo',show:r=>number(r,'listos')},
      {label:'Logo',show:r=>number(r,'subieron_logo')},{label:'Colocaron',show:r=>number(r,'colocaron_logo')},
      {label:'Tallas',show:r=>number(r,'pusieron_tallas')},{label:'Envíos medidos',show:r=>number(r,'enviaron')},
    ]} />
    <HistoryTable title="Problemas del Estudio" rows={h.problems} columns={[
      {label:'Tipo',show:r=>value(r,'tipo')},{label:'Dónde',show:r=>value(r,'donde')},
      {label:'Detalle',show:r=>value(r,'detalle')},{label:'Veces',show:r=>number(r,'veces')},
      {label:'Sesiones',show:r=>number(r,'sesiones')},
    ]} />
    <HistoryTable title="Confirmaciones y recordatorios por correo" note="Estados y eventos del proveedor; un clic de correo no confirma una conversación de WhatsApp."
      rows={h.emailHistory} columns={[
        {label:'Tipo',show:r=>value(r,'tipo')},{label:'Categoría',show:r=>value(r,'categoria')},
        {label:'Resultado',show:r=>value(r,'resultado')},{label:'Registros',show:r=>number(r,'registros')},
      ]} />
    <HistoryTable title="Pedidos guardados" note="Se muestran pedidos anteriores y posteriores al panel. Total cotizado es una referencia comercial, no ingreso cobrado."
      rows={h.orders} columns={[
        {label:'Folio',show:r=>value(r,'short_code')},{label:'Fecha',show:r=>date(r.created_at)},
        {label:'Estado del pedido',show:r=>value(r,'status')},
        {label:'Total cotizado',show:r=>r.total_cents == null ? 'Sin precio' : money(number(r,'total_cents')/100)},
        {label:'Precio de referencia',show:r=>r.priced_with_placeholder ? 'Sí' : 'No'},
      ]} />
  </>;
}
