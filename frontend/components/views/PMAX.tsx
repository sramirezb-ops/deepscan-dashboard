'use client';

import { useClient } from '@/lib/useClient';
import { GoogleAdsSegmentView } from './GoogleAdsSegmentView';
import { GadsProductBible } from './GadsProductBible';
import { GadsAssetGroups } from './GadsAssetGroups';
import { GadsAssets } from './GadsAssets';
import { PMAXLeads } from './PMAXLeads';

// Vista ecommerce de PMAX (Revenue/ROAS + productos): la composición original.
function PMAXEcommerce() {
  return (
    <GoogleAdsSegmentView
      segment="pmax"
      title="Performance Max"
      channelLabel="Performance Max"
      icon="🅿"
      extraSection={
        <>
          <GadsProductBible />
          <GadsAssetGroups />
          <GadsAssets />
        </>
      }
      pendingNote="Las recomendaciones de optimización y escalado con IA llegan en la siguiente fase. Las miniaturas de las imágenes y el performance label de Google aparecerán en cuanto el script de Google Ads exporte esas columnas al feed. Todo lo que ves arriba (campañas, asset groups, productos, zombies, videos y textos) sale de datos 100% reales: gads_campaigns, gads_asset_groups, gads_products, gads_zombies y gads_assets."
    />
  );
}

// Gemelo de GoogleAdsOverviewSwitch: branch por COMPONENTE según el modelo de
// negocio. Un cliente "de leads puro" (objetivo 'leads' sin 'ventas') ve la
// vista PMAX orientada a leads (CPL, leaderboard de creativos, redes); un
// cliente de ventas ve la vista ecommerce original (Revenue/ROAS + productos).
export function PMAX() {
  const client = useClient();
  const isLeadsModel =
    client.objectives.includes('leads') && !client.objectives.includes('ventas');
  return isLeadsModel ? <PMAXLeads /> : <PMAXEcommerce />;
}
