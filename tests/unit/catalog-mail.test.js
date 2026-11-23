import { describe, expect, it, vi } from 'vitest';
import { sendQuoteEmail } from '../../api/_lib/quote-mail.js';
import { renderTeamAlert, renderQuoteMail } from '../../api/_lib/quote-mail-template.js';

const intent = { id:'11111111-1111-4111-8111-111111111111', client_key:'55555555-5555-4555-8555-555555555555',
  channel:'catalogos', status:'completed', name:'Ana Ruiz', email:null, phone:'5512345678',
  intended_use:'Regalo para clientes', personalization:'Logotipo', required_date:'2026-12-10',
  items:[{catalog:'navidad-2026',page:26,sku:'A2786',name:'Cutters',quantity:20}] };

describe('alerta de catálogo', () => {
  it('incluye folio, productos y contacto escapados para el equipo', () => {
    const mail = renderTeamAlert({ ...intent, name:'Ana <script>' });
    expect(mail.subject).toContain('GQ-5555555555554555');
    expect(mail.html).toContain('A2786');
    expect(mail.html).toContain('Página 26');
    expect(mail.html).toContain('5512345678');
    expect(mail.html).not.toContain('<script>');
  });
  it('enlaza la referencia de catálogo en confirmación y recordatorio', () => {
    const row = { ...intent, return_catalog:'navidad-2026', return_page:26,
      return_token:'11111111-1111-4111-8111-111111111111',
      unsubscribe_token:'22222222-2222-4222-8222-222222222222' };
    const confirmation = renderQuoteMail({ kind:'confirmation', intent:row });
    const reminder = renderQuoteMail({ kind:'reminder', intent:{ ...row, status:'started' } });
    expect(confirmation.html).toContain('/catalogos/navidad-2026/?p=26&amp;sku=A2786');
    expect(reminder.html).toContain('/catalogos/navidad-2026/?p=26&amp;sku=A2786&amp;r=');
  });
  it('envía la alerta a info@orkestalo.com aunque no haya correo del cliente', async () => {
    const old = { ...process.env };
    Object.assign(process.env, { QUOTE_CAPTURE_ENABLED:'1', PRIVACY_CONTROLLER:'GRAFIK',
      PRIVACY_ADDRESS:'CDMX', PRIVACY_EMAIL:'privacidad@grafik.mx', RESEND_API_KEY:'test', EMAIL_FROM:'info@grafik.mx' });
    const calls=[];
    const stub=vi.spyOn(globalThis,'fetch').mockImplementation(async (url,opts={})=>{
      calls.push({url:String(url),body:opts.body && JSON.parse(opts.body)});
      if (String(url).includes('/quote_email_log') && opts.method==='POST') return {ok:true,json:async()=>[{id:'log-1'}]};
      if (String(url).includes('api.resend.com')) return {ok:true,json:async()=>({id:'resend-1'})};
      if (String(url).includes('/quote_email_log') && opts.method==='PATCH') return {ok:true};
      throw new Error('unexpected '+url);
    });
    try {
      expect(await sendQuoteEmail('https://sb.test','key',intent,'team_alert')).toBe(true);
      expect(calls.find(c=>c.url.includes('api.resend.com')).body.to).toEqual(['info@orkestalo.com']);
      expect(calls.find(c=>c.url.includes('/quote_email_log') && c.body?.kind).body.kind).toBe('team_alert');
    } finally { stub.mockRestore(); process.env=old; }
  });
});
