-- Auditoría del bot LEÍDA POR IA (Ofero). Una fila por (cliente, semana ISO).
-- A diferencia de uchat_bot_diagnostics (que clasifica por REGLAS a diario),
-- esta tabla guarda el resultado de LEER una muestra de conversaciones con un
-- LLM (Groq / Llama) una vez por semana: trabas verificadas, prospectos
-- perdidos y conversaciones de ejemplo (redactadas) para renderizar.
-- Correr una vez en el editor SQL de Supabase.

create table if not exists public.uchat_bot_audit (
  id          uuid primary key default gen_random_uuid(),
  client_id   uuid not null,
  period      text not null,          -- semana ISO 'YYYY-Www', p.ej. '2026-W38'
  payload     jsonb not null,         -- KPIs verificados + trabas + ejemplos
  updated_at  timestamptz not null default now(),
  unique (client_id, period)
);

create index if not exists uchat_bot_audit_client_idx
  on public.uchat_bot_audit (client_id, period desc);

-- Lectura pública (anon) como el resto del tablero; escritura con service key.
alter table public.uchat_bot_audit enable row level security;

drop policy if exists "anon read uchat_bot_audit" on public.uchat_bot_audit;
create policy "anon read uchat_bot_audit"
  on public.uchat_bot_audit
  for select
  using (true);
