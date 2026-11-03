-- Ejecutar contra una base local de prueba. ROLLBACK conserva el entorno.
begin;
insert into public.admin_users(user_id,email) values ('11111111-1111-4111-8111-111111111111','owner@example.test');
insert into public.sales_opportunities(folio,channel) values ('GW-AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA','whatsapp');
insert into public.quote_intents(client_key,channel,email)
values ('33333333-3333-4333-8333-333333333333','contacto','client@example.test');
insert into public.quote_intents(client_key,channel,email,status,completed_at)
values ('44444444-4444-4444-8444-444444444444','estudio','studio@example.test','completed',now());
do $$ begin
  if exists (select 1 from public.sales_opportunities where quote_intent_id =
    (select id from public.quote_intents where client_key='44444444-4444-4444-8444-444444444444')
    and whatsapp_clicked_at is not null) then
    raise exception 'completed Studio order counted as WhatsApp click';
  end if;
end $$;
insert into public.site_events(sid,event,path) values ('testsession01','page_view','/');
insert into public.site_events(sid,event,path,props)
values ('testsession01','direct_whatsapp_click','/estudio/',
  '{"folio":"GW-BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB"}'::jsonb);
do $$ begin
  if not exists (select 1 from public.sales_opportunities
    where folio='GW-BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB' and whatsapp_clicked_at is not null) then
    raise exception 'direct WhatsApp click did not create opportunity';
  end if;
end $$;
do $$ begin
  if has_table_privilege('anon','public.sales_opportunities','select') then raise exception 'anon can read opportunities'; end if;
  if has_table_privilege('anon','public.v_sessions','select') then raise exception 'anon can read view'; end if;
  if has_table_privilege('anon','public.quote_intents','select') then raise exception 'anon can read PII'; end if;
end $$;

set local role authenticated;
select set_config('request.jwt.claims','{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated","aal":"aal1"}',true);
do $$ begin
  if public.is_admin() then raise exception 'AAL1 was authorized'; end if;
  if (select count(*) from public.sales_opportunities) <> 0 then raise exception 'AAL1 read opportunities'; end if;
  if (select count(*) from public.quote_intents) <> 0 then raise exception 'AAL1 read PII'; end if;
  if (select count(*) from public.v_sessions) <> 0 then raise exception 'AAL1 read view'; end if;
  if (select count(*) from public.admin_users) <> 0 then raise exception 'AAL1 read membership'; end if;
  update public.sales_opportunities set stage='ganada' where folio='GW-AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA';
  if found then raise exception 'AAL1 updated opportunity'; end if;
end $$;

select set_config('request.jwt.claims','{"sub":"22222222-2222-4222-8222-222222222222","role":"authenticated","aal":"aal2"}',true);
do $$ begin
  if public.is_admin() then raise exception 'non-member was authorized'; end if;
  if (select count(*) from public.sales_opportunities) <> 0 then raise exception 'non-member read opportunities'; end if;
  update public.sales_opportunities set stage='ganada' where folio='GW-AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA';
  if found then raise exception 'non-member updated opportunity'; end if;
end $$;

select set_config('request.jwt.claims','{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated","aal":"aal2"}',true);
do $$ begin
  if not public.is_admin() then raise exception 'member AAL2 denied'; end if;
  if (select count(*) from public.sales_opportunities) <> 4 then raise exception 'member cannot read opportunities'; end if;
  if (select count(*) from public.quote_intents) <> 2 then raise exception 'member cannot read PII'; end if;
  if (select count(*) from public.v_sessions) <> 1 then raise exception 'member cannot read view'; end if;
end $$;

reset role;
delete from public.admin_users where user_id='11111111-1111-4111-8111-111111111111';
set local role authenticated;
do $$ begin
  if public.is_admin() then raise exception 'revoked member still authorized'; end if;
  if (select count(*) from public.sales_opportunities) <> 0 then raise exception 'revoked member read opportunity'; end if;
end $$;
rollback;
