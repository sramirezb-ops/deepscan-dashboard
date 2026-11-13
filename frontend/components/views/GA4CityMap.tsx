'use client';

import { useMemo } from 'react';
import { formatNumber } from '@/lib/utils';

// ============================================================
// GA4CityMap — mapa de Colombia con burbujas por ciudad (sesiones).
// Contorno real del país (GeoJSON proyectado a SVG) + burbujas ubicadas por
// lat/long reales, con tamaño proporcional a las sesiones. Replica el mapa
// de ciudades del Looker. Las coordenadas de ciudad y del contorno usan la
// MISMA proyección equirectangular para que todo encaje.
// ============================================================

const VB_W = 520;
const VB_H = 720;
const PAD = 14;
// bbox del GeoJSON de Colombia (mismo que generó el path de abajo).
const MIN_LNG = -78.990935, MAX_LNG = -66.876326, MIN_LAT = -4.298187, MAX_LAT = 12.437303;
const px = (lng: number) => PAD + ((lng - MIN_LNG) / (MAX_LNG - MIN_LNG)) * (VB_W - 2 * PAD);
const py = (lat: number) => PAD + ((MAX_LAT - lat) / (MAX_LAT - MIN_LAT)) * (VB_H - 2 * PAD);

// Contorno de Colombia (proyectado). Baja resolución, suficiente para contexto.
const COLOMBIA_PATH =
  'M160.9 534.6 L143.5 524.8 L123.6 511.1 L112.1 517.6 L77.6 511.9 L67.7 494.1 L60.1 494.8 L19.5 471.2 L14.0 458.3 L29.2 455.2 L27.4 434.5 L36.9 419.5 L57.0 416.8 L74.1 390.8 L89.7 369.1 L74.7 359.3 L82.4 335.3 L73.2 297.4 L81.9 286.6 L75.5 251.6 L59.1 229.6 L64.3 209.5 L77.3 212.4 L85.0 200.2 L75.6 175.8 L80.5 169.8 L101.5 171.1 L132.0 142.2 L148.7 137.8 L149.1 124.1 L156.6 89.2 L179.9 70.0 L205.5 69.2 L208.7 60.6 L240.5 64.0 L272.4 43.2 L288.2 33.9 L307.9 14.0 L322.3 16.5 L332.9 27.4 L325.1 41.3 L299.0 48.3 L288.7 68.9 L273.0 80.8 L261.2 96.2 L256.2 125.7 L244.9 149.8 L265.9 152.6 L271.1 171.6 L280.1 180.7 L283.3 197.4 L278.4 212.7 L279.9 221.3 L289.9 224.8 L299.5 239.2 L351.8 235.2 L375.4 240.5 L403.9 276.0 L420.3 271.6 L449.6 273.8 L472.7 269.1 L487.1 276.2 L479.8 298.5 L470.7 312.4 L467.6 342.0 L475.7 369.5 L487.3 381.8 L488.7 391.1 L468.1 411.6 L482.8 420.8 L493.6 435.2 L506.0 476.4 L498.3 481.5 L490.4 457.2 L479.1 444.0 L465.7 458.3 L386.6 457.4 L387.1 483.2 L410.9 487.5 L409.5 503.4 L401.4 499.1 L378.5 505.9 L378.3 535.9 L396.3 551.0 L402.7 574.7 L401.7 592.6 L383.5 706.0 L363.1 684.0 L351.0 683.0 L377.2 641.0 L346.1 621.6 L321.7 625.1 L307.1 618.0 L284.7 628.9 L254.4 623.7 L230.5 580.4 L211.7 569.7 L198.8 550.2 L171.8 530.6 L160.9 534.6 Z';

// Coordenadas [lat, lng] de ciudades (claves = como las nombra GA4).
const CITY_COORDS: Record<string, [number, number]> = {
  Bogota: [4.61, -74.08], Cali: [3.44, -76.52], Barranquilla: [10.96, -74.80],
  Medellin: [6.25, -75.56], Cartagena: [10.39, -75.51], Valledupar: [10.46, -73.25],
  Bucaramanga: [7.12, -73.12], Monteria: [8.75, -75.88], Bello: [6.34, -75.56],
  Cucuta: [7.89, -72.50], Manizales: [5.07, -75.52], Villavicencio: [4.14, -73.63],
  Pereira: [4.81, -75.69], Soacha: [4.58, -74.22], Ibague: [4.44, -75.23],
  Pasto: [1.21, -77.28], Armenia: [4.53, -75.68], Palmira: [3.54, -76.30],
  Itagui: [6.17, -75.61], Riohacha: [11.54, -72.91], 'Santa Marta': [11.24, -74.20],
  Neiva: [2.93, -75.28], Popayan: [2.44, -76.61], Sincelejo: [9.30, -75.40],
  Tunja: [5.53, -73.36], Floridablanca: [7.06, -73.09], Dosquebradas: [4.83, -75.67],
  Barrancabermeja: [7.06, -73.85], Buenaventura: [3.88, -77.03], Yopal: [5.35, -72.40],
  Giron: [7.07, -73.17], Facatativa: [4.81, -74.35], Tulua: [4.09, -76.20],
  Candelaria: [3.41, -76.35], Turbaco: [10.33, -75.41], Piedecuesta: [6.99, -73.05],
  Fusagasuga: [4.34, -74.37], Galapa: [10.90, -74.89], Envigado: [6.17, -75.59],
  Monteria2: [8.75, -75.88],
};

const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
const COORD_BY_NORM: Record<string, [number, number]> = Object.fromEntries(
  Object.entries(CITY_COORDS).map(([k, v]) => [norm(k), v]),
);

interface CityRowLite { city: string; sessions: number }

export function GA4CityMap({ cities }: { cities: CityRowLite[] }) {
  const pts = useMemo(() => {
    const maxS = Math.max(1, ...cities.map((c) => c.sessions));
    return cities
      .map((c) => {
        const co = COORD_BY_NORM[norm(c.city)];
        if (!co) return null;
        const r = 4 + 24 * Math.sqrt(c.sessions / maxS);
        return { city: c.city, sessions: c.sessions, x: px(co[1]), y: py(co[0]), r };
      })
      .filter((p): p is NonNullable<typeof p> => p !== null)
      .sort((a, b) => b.sessions - a.sessions);
  }, [cities]);

  const labeled = pts.slice(0, 6);

  return (
    <div className="card" style={{ padding: '16px 18px' }}>
      <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--t3)', marginBottom: 4 }}>
        Distribución geográfica · Colombia
      </div>
      <div style={{ fontSize: 12.5, color: 'var(--mu)', marginBottom: 10 }}>
        Burbujas = sesiones por ciudad · dato real de GA4.
      </div>
      <div style={{ display: 'flex', justifyContent: 'center' }}>
        <svg viewBox={`0 0 ${VB_W} ${VB_H}`} style={{ width: '100%', maxWidth: 360, height: 'auto' }} role="img" aria-label="Mapa de sesiones por ciudad en Colombia">
          <path d={COLOMBIA_PATH} fill="var(--bg3)" stroke="var(--b2)" strokeWidth={1.5} strokeLinejoin="round" />
          {pts.map((p) => (
            <circle key={p.city} cx={p.x} cy={p.y} r={p.r} fill="#34A853" fillOpacity={0.45} stroke="#34A853" strokeWidth={1} />
          ))}
          {labeled.map((p) => (
            <text key={`t-${p.city}`} x={p.x} y={p.y - p.r - 3} textAnchor="middle" style={{ fontSize: 13, fontWeight: 700, fill: 'var(--t1)' }}>
              {p.city}
            </text>
          ))}
          {labeled.map((p) => (
            <text key={`v-${p.city}`} x={p.x} y={p.y + 4} textAnchor="middle" style={{ fontSize: 11, fontWeight: 800, fill: 'var(--bg1)' }}>
              {formatNumber(p.sessions)}
            </text>
          ))}
        </svg>
      </div>
    </div>
  );
}
