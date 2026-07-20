-- Tabla para el diagnóstico del bot de UChat (Ofero).
-- Una fila por (cliente, mes): guarda el análisis completo como JSONB
-- (impedimentos + snapshot), tal cual lo consume la hoja del dashboard.
-- Correr una vez en el editor SQL de Supabase.

create table if not exists public.uchat_bot_diagnostics (
  id          uuid primary key default gen_random_uuid(),
  client_id   uuid not null,
  period      text not null,          -- 'YYYY-MM'
  impediments jsonb,                  -- análisis de stoppers a escala
  snapshot    jsonb,                  -- agregados (KPIs, distribuciones)
  updated_at  timestamptz not null default now(),
  unique (client_id, period)
);

create index if not exists uchat_bot_diagnostics_client_idx
  on public.uchat_bot_diagnostics (client_id, period desc);

-- Lectura pública (anon) como el resto de tablas del tablero; la escritura
-- va con la service key desde el ETL, que salta RLS.
alter table public.uchat_bot_diagnostics enable row level security;

drop policy if exists "anon read uchat_bot_diagnostics" on public.uchat_bot_diagnostics;
create policy "anon read uchat_bot_diagnostics"
  on public.uchat_bot_diagnostics
  for select
  using (true);
