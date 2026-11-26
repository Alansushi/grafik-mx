-- Ejecutar tras migrar; la transacción se deshace y no altera las cifras reales.
begin;
insert into public.site_events (sid, event, path, props)
values
  ('studiotest1111', 'page_view', '/estudio/', '{}'::jsonb),
  ('studiotest1111', 'studio_price_view', '/estudio/', '{}'::jsonb),
  ('studiotest2222', 'page_view', '/estudio/', '{}'::jsonb),
  ('studiotest3333', 'page_view', '/estudio/pedido/', '{}'::jsonb),
  ('studiotest3333', 'studio_price_view', '/estudio/pedido/', '{}'::jsonb);
do $$ begin
  if not exists (select 1 from public.v_studio_sessions where sid = 'studiotest1111' and vio_precio) then
    raise exception 'visible price was not counted';
  end if;
  if not exists (select 1 from public.v_studio_sessions where sid = 'studiotest2222' and not vio_precio) then
    raise exception 'unseen price was counted';
  end if;
  if exists (select 1 from public.v_studio_sessions where sid = 'studiotest3333') then
    raise exception 'direct order view was counted as studio entry';
  end if;
end $$;
rollback;
