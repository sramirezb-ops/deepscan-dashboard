-- 0021 · meta_breakdowns por día
-- La hoja de Compras (plataforma / placement / segmentos) debe seguir el
-- selector de periodo. Antes el ETL guardaba una foto agregada SIN fecha, así
-- que esas tablas no reaccionaban al rango. Ahora el ETL trae una fila POR DÍA
-- (time_increment=1); para eso la llave única debe incluir `date`.
--
-- Nota: meta_breakdowns no se creó en una migración trackeada, así que dropeamos
-- su índice/constraint único actual de forma dinámica (sin depender del nombre).

-- 1) Columna de fecha (las filas viejas agregadas quedan con date = NULL; el
--    frontend las ignora porque filtra por rango).
alter table public.meta_breakdowns add column if not exists date date;

-- 2) Elimina la llave anterior. meta_breakdowns tiene PRIMARY KEY (no un simple
--    unique index), así que se dropea el CONSTRAINT (primary + unique); los
--    índices que respaldan esos constraints se van con ellos.
do $$
declare r record;
begin
  for r in
    select conname from pg_constraint
    where conrelid = 'public.meta_breakdowns'::regclass and contype in ('p', 'u')
  loop
    execute format('alter table public.meta_breakdowns drop constraint %I', r.conname);
  end loop;
  -- Índices únicos "sueltos" (creados con CREATE UNIQUE INDEX, sin constraint).
  for r in
    select i.indexrelid::regclass::text as idxname
    from pg_index i
    join pg_class c on c.oid = i.indrelid
    where c.relname = 'meta_breakdowns' and i.indisunique
      and not exists (select 1 from pg_constraint k where k.conindid = i.indexrelid)
  loop
    execute format('drop index if exists %s', r.idxname);
  end loop;
end $$;

-- 3) Nueva llave única incluyendo la fecha (coincide con el on_conflict del loader).
create unique index if not exists meta_breakdowns_uniq
  on public.meta_breakdowns (client_id, date, level, breakdown_type, breakdown_value, entity_id);

-- 4) Índice de lectura por cliente + rango de fechas.
create index if not exists meta_breakdowns_client_date
  on public.meta_breakdowns (client_id, date);
