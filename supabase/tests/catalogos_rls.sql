-- Ejecutar contra la base local después de migrar. ROLLBACK conserva el entorno.
begin;
insert into public.quote_intents(client_key, folio, channel, status, name, phone, email, items, intended_use, required_date, analytics_sid)
values ('55555555-5555-4555-8555-555555555555', 'GQ-ABC1234567', 'catalogos', 'completed', 'Ana Ruiz', '5512345678', null,
  '[{"catalog":"navidad-2026","page":26,"sku":"A2786","name":"Cutters","quantity":20}]'::jsonb,
  'Regalo para clientes', '2026-12-10', 'catalogsid123');
do $$ begin
  if not exists (select 1 from public.sales_opportunities where quote_intent_id =
    (select id from public.quote_intents where client_key='55555555-5555-4555-8555-555555555555')
    and channel='catalogos' and folio='GQ-ABC1234567') then raise exception 'catalog intent has wrong opportunity folio'; end if;
  if has_table_privilege('anon','public.quote_intents','select') then raise exception 'anon reads catalog PII'; end if;
  if has_table_privilege('anon','public.v_catalog_funnel','select') then raise exception 'anon reads catalog funnel'; end if;
end $$;
-- Older deployed API calls still omit folio during the migration window.
insert into public.quote_intents(client_key, channel, email)
values ('66666666-6666-4666-8666-666666666666', 'contacto', 'historico@example.test');
do $$ begin
  if not exists (select 1 from public.quote_intents i
    join public.sales_opportunities o on o.quote_intent_id = i.id and o.folio = i.folio
    where i.client_key = '66666666-6666-4666-8666-666666666666'
      and i.folio = 'GQ-6666666666664666') then
    raise exception 'legacy API default folio diverged from opportunity';
  end if;
end $$;
insert into public.site_events(sid,event,path,props)
values ('catalogsid123','catalog_help_click','/catalogos/navidad-2026/', '{"folio":"GW-1234567890"}'::jsonb);
do $$ begin
  if not exists (select 1 from public.sales_opportunities where folio='GW-1234567890'
    and channel='catalogos_ayuda' and quote_intent_id is null
    and whatsapp_clicked_at is not null and conversation_confirmed_at is null) then
    raise exception 'catalog help click was not distinct from saved intent';
  end if;
end $$;
insert into public.quote_email_log(intent_id,kind,state)
select id,'team_alert','sent' from public.quote_intents where client_key='55555555-5555-4555-8555-555555555555';
rollback;
