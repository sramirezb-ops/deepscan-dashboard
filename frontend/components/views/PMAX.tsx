'use client';

import { GoogleAdsSegmentView } from './GoogleAdsSegmentView';
import { GadsAssetGroups } from './GadsAssetGroups';
import { GadsAssets } from './GadsAssets';
import { GadsProducts } from './GadsProducts';

export function PMAX() {
  return (
    <GoogleAdsSegmentView
      segment="pmax"
      title="Performance Max"
      channelLabel="Performance Max"
      icon="🅿"
      extraSection={
        <>
          <GadsAssetGroups />
          <GadsProducts />
          <GadsAssets />
        </>
      }
      pendingNote="Las recomendaciones de optimización y escalado con IA llegan en la siguiente fase. Las miniaturas de las imágenes y el performance label de Google aparecerán en cuanto el script de Google Ads exporte esas columnas al feed. Todo lo que ves arriba (campañas, asset groups, productos, zombies, videos y textos) sale de datos 100% reales: gads_campaigns, gads_asset_groups, gads_products, gads_zombies y gads_assets."
    />
  );
}
