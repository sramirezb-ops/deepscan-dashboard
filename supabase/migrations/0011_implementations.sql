-- ============================================================
-- Migración 0011 — Tabla implementations (bitácora de implementaciones)
-- ============================================================
-- Objetivo: registrar lo que la AGENCIA hizo (acciones manuales), no lo que
-- midió la plataforma. Una fila = una implementación: "subimos 3 creativos",
-- "pausamos campaña X", "bajamos el presupuesto 30 %". Cada una con su fecha.
--
-- Para qué: cruzar esas acciones con la tendencia diaria del dashboard y
-- dibujar marcadores sobre la curva. Así el gerente ve la CAUSA detrás de un
-- cambio ("el CPL bajó justo cuando subimos creativos nuevos") — algo que ni
-- Looker ni Porter dan.
--
-- Fuente de datos: un Google Sheet que la agencia llena a mano. El ETL lo
-- sincroniza a esta tabla en cada corrida (extractors/implementations.py),
-- igual que el resto de hojas (Mike Rhodes, smec, etc.). El dashboard SOLO lee
-- de aquí, nunca escribe: el front sigue siendo de solo-lectura.
--
-- Mientras no haya filas, la sección de la bitácora simplemente no aparece
-- (cero ruido). En cuanto el ETL escriba implementaciones, los marcadores se
-- encienden sobre la tendencia. Idempotente: se puede re-correr sin error.
-- ============================================================

create table if not exists implementations (
  id            uuid primary key default gen_random_uuid(),
  client_id     uuid not null,

  -- Cuándo se hizo la acción (clave para alinearla con la tendencia diaria).
  date          date not null,

  -- A qué canal aplica: 'tiktok' | 'meta' | 'google' | 'global'.
  -- 'global' se muestra en TODAS las vistas (ej. "cambiamos la landing").
  channel       text not null default 'global',

  -- Qué se hizo (texto corto) y, opcional, el detalle largo.
  title         text not null,
  detail        text,

  -- Tipo de acción (para el ícono/color del marcador). Libre, pero la
  -- convención sugerida es: creativo | presupuesto | segmentacion | puja |
  -- pausa | activacion | landing | otro.
  kind          text          default 'otro',

  inserted_at   timestamptz default now(),

  -- Dedup natural: misma acción, mismo canal, mismo día, mismo título = misma
  -- fila (se actualiza en vez de duplicar al re-sincronizar la hoja).
  unique (client_id, channel, date, title)
);

-- Índice para la consulta del dashboard: por cliente + rango de fechas.
create index if not exists implementations_client_date_idx
  on implementations (client_id, date);

-- ------------------------------------------------------------
-- Permiso de lectura TEMPORAL (igual que el resto de tablas): deja que el
-- dashboard lea con la anon key. En la etapa de login se reemplaza por una
-- política por-cliente. Idempotente.
-- ------------------------------------------------------------
alter table implementations enable row level security;

drop policy if exists "lectura_implementations_temporal" on implementations;

create policy "lectura_implementations_temporal"
on implementations
for select
to anon, authenticated
using (true);

-- ------------------------------------------------------------
-- Escritura del ETL (service_role). El robot que sincroniza la hoja usa la
-- service key, que ignora RLS; dejamos la política explícita por simetría con
-- las demás tablas. Idempotente.
-- ------------------------------------------------------------
drop policy if exists "escritura_implementations_service" on implementations;

create policy "escritura_implementations_service"
on implementations
for all
to service_role
using (true)
with check (true);
