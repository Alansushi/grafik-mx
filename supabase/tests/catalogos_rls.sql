-- Ejecutar contra la base local después de migrar. ROLLBACK conserva el entorno.
begin;
insert into public.quote_intents(client_key, channel, status, name, phone, email, items, intended_use, required_date, analytics_sid)
values ('55555555-5555-4555-8555-555555555555', 'catalogos', 'completed', 'Ana Ruiz', '5512345678', null,
  '[{"catalog":"navidad-2026","page":26,"sku":"A2786","name":"Cutters","quantity":20}]'::jsonb,
  'Regalo para clientes', '2026-12-10', 'catalogsid123');
do $$ begin
  if not exists (select 1 from public.sales_opportunities where quote_intent_id =
    (select id from public.quote_intents where client_key='55555555-5555-4555-8555-555555555555')
    and channel='catalogos') then raise exception 'catalog intent has no opportunity'; end if;
  if has_table_privilege('anon','public.quote_intents','select') then raise exception 'anon reads catalog PII'; end if;
  if has_table_privilege('anon','public.v_catalog_funnel','select') then raise exception 'anon reads catalog funnel'; end if;
end $$;
insert into public.quote_email_log(intent_id,kind,state)
select id,'team_alert','sent' from public.quote_intents where client_key='55555555-5555-4555-8555-555555555555';
rollback;
