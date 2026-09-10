-- 0017_catalog_funnel.sql
-- Amplía meta_catalog_products con el FUNNEL por producto (vistas → carritos →
-- compras → valor), que hoy no se guardaba (solo spend/impressions). Alimenta la
-- futura vista "Catálogo" para ver qué producto del catálogo Advantage+ mueve la
-- venta, más allá del anuncio. Se llena desde el breakdown product_id de la Ads
-- Insights API (ver etl/extractors/meta_ads.py :: extract_meta_catalog_products).

alter table meta_catalog_products
  add column if not exists view_content   integer default 0,
  add column if not exists add_to_cart    integer default 0,
  add column if not exists purchases      integer default 0,
  add column if not exists purchase_value numeric default 0;
