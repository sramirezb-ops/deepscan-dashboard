-- ============================================================
-- Migración 0016 — AURA (venta real cobrada) vía Google Sheet
-- ============================================================
-- AURA es el sistema de ventas del cliente (manual/WhatsApp/POS/web). Su export
-- no está en ninguna API: el usuario lo pega a diario en un Google Sheet público
-- (reemplaza el contenido completo cada día). El ETL lee esa hoja, clasifica cada
-- fila y sincroniza esta tabla (borra+recarga por cliente en cada corrida, así los
-- cambios pendiente→pagado y las correcciones entran solos).
--
-- Es el NORTH-STAR de venta para ecommerce con cierre por conversación (Sneaker
-- Store), donde el checkout web subregistra la venta real.
--
-- Clasificación (bucket), idéntica a la "visibilidad" que se entrega al cliente:
--   · cambio    → canal exchange (dinero ya cobrado antes, no venta nueva)
--   · cowmmerce → canal marketplace / mercadolibre (idem / canal de terceros)
--   · prueba    → importe <= 50 (órdenes de test)
--   · medicion  → todo lo demás (la venta nueva cobrada que sí cuenta)
-- Idempotente.
-- ============================================================

-- Config: id del Google Sheet de AURA por cliente (público de lectura).
alter table clients add column if not exists aura_sheet_id text;

create table if not exists aura_sales (
  id          uuid primary key default gen_random_uuid(),
  client_id   uuid not null references clients(id) on delete cascade,
  row_key     text not null,        -- {tipo}|{folio}|{fecha}|{importe} — colapsa duplicados exactos
  folio       text,
  fecha       timestamptz,
  fecha_date  date,
  tipo        text,                 -- VENTA | ABONO
  estado      text,
  canal       text,
  cliente     text,
  importe     numeric default 0,
  cobrado     numeric default 0,
  pendiente   numeric default 0,
  vendedor    text,
  bucket      text,                 -- medicion | cambio | cowmmerce | prueba
  inserted_at timestamptz default now(),
  unique (client_id, row_key)
);

create index if not exists aura_sales_client_date on aura_sales (client_id, fecha_date);
create index if not exists aura_sales_client_bucket on aura_sales (client_id, bucket);
