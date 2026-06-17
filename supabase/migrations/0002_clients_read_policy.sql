-- ============================================================
-- Migración 0002 — Permiso de lectura TEMPORAL para clients
-- Deja que el dashboard lea la ficha de cada cliente.
-- TEMPORAL: en la etapa de login/seguridad se reemplaza por una
-- política que limita cada cliente a ver solo su propia fila.
-- Idempotente: el drop previo permite re-correrla sin error.
-- ============================================================

drop policy if exists "lectura_clients_temporal" on clients;

create policy "lectura_clients_temporal"
on clients
for select
to anon, authenticated
using (true);
