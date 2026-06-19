'use client';

import { GoogleAdsSegmentView } from './GoogleAdsSegmentView';
import { GadsAssetGroups } from './GadsAssetGroups';
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
        </>
      }
      pendingNote="Los resultados por asset (con imágenes y performance label) necesitan que el script de Google Ads exporte esas columnas al feed —hoy llegan vacías—. Las recomendaciones de optimización y escalado con IA llegan en la siguiente fase. Todo lo que ves arriba (campañas, asset groups, productos y zombies) sale de datos 100% reales: gads_campaigns, gads_asset_groups, gads_products y gads_zombies."
    />
  );
}
