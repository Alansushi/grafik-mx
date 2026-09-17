-- Configurador /estudio/ — buckets de Storage
-- Spec §5.4
--
-- Los binarios NUNCA cruzan api/*: el cliente pide una URL firmada a
-- /api/upload-url y hace el PUT directo a Storage. Estos buckets son la tercera
-- red de validación, después del cliente y del servidor — y la única que no
-- depende de que nuestro código acierte.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  -- Fotos base de prenda. Público: el canvas las carga por fetch → blob y no
  -- hay nada sensible en una playera gris.
  ('mockups',  'mockups',  true,  5242880,
   array['image/png','image/jpeg','image/webp']),

  -- Logos originales del cliente. PRIVADO: es su propiedad intelectual, y es
  -- además el archivo que se manda a producción.
  ('logos',    'logos',    false, 8388608,
   array['image/png','image/jpeg','image/webp','image/svg+xml']),

  -- Snapshots del canvas. PRIVADO: revelaría los pedidos de otros clientes.
  -- Nunca SVG: el snapshot siempre sale rasterizado de toDataURL().
  ('previews', 'previews', false, 4194304,
   array['image/png','image/jpeg'])
on conflict (id) do nothing;

-- mockups: lectura pública.
drop policy if exists mockups_public_read on storage.objects;
create policy mockups_public_read on storage.objects
  for select to anon, authenticated using (bucket_id = 'mockups');

-- logos y previews: SIN política. Sólo service_role.
--   · Subida del cliente → URL firmada emitida por /api/upload-url
--   · Lectura del admin y de /estudio/pedido/ → URL firmada emitida por el servidor
-- Que no exista política es la protección; no hay nada más que escribir aquí.
