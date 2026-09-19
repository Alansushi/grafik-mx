-- Tamaño FÍSICO del área imprimible, para poder avisar de resolución baja.
--
-- Sin este dato el configurador no puede saber a cuántos dpi va a salir un
-- logo: print_area está en fracciones del canvas, que no dicen nada sobre
-- centímetros reales. Y no puede ser una constante en el código porque es una
-- propiedad de la PRENDA — una gorra imprime a ~11 cm y una playera a ~31.6.
-- Con una constante, cambiar de prenda mostraría un número falso sin que nada
-- avisara.
--
-- Hasta ahora el cliente podía subir un logo de 300 px, verlo nítido en el
-- preview (el canvas lo escala a lo que haga falta), aprobarlo, y el problema
-- aparecía en producción con la prenda ya impresa.
--
-- El valor de la playera (31.6 cm) se midió sobre la propia silueta, no se
-- eligió: el torso ocupa 0.5332 del ancho de la foto y una playera M de adulto
-- mide ~51 cm plana, así que el ancho del canvas equivale a 95.7 cm y el área
-- (0.330 de ese ancho) a 31.6 cm. Mismo razonamiento que la migración 0008.
--
-- Se añade nullable, se rellena y después se marca NOT NULL: poner un DEFAULT
-- habría dejado a la gorra con el número de la playera, que es exactamente el
-- tipo de dato equivocado-pero-plausible que nadie revisa.

alter table public.garment_types
  add column if not exists print_area_width_cm numeric;

update public.garment_types set print_area_width_cm = 31.6 where slug = 'playera';
update public.garment_types set print_area_width_cm = 11.0 where slug = 'gorra';

-- Cualquier prenda futura sin medir queda bloqueada aquí en vez de colarse con
-- un valor inventado.
alter table public.garment_types
  alter column print_area_width_cm set not null;

alter table public.garment_types
  drop constraint if exists garment_types_print_area_width_cm_check;
alter table public.garment_types
  add constraint garment_types_print_area_width_cm_check
  check (print_area_width_cm > 0);
