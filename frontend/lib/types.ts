import type { ChannelId } from './channels';
import type { ObjectiveId } from './objectives';

export interface Client {
  id: string;
  name: string;
  currency: 'MXN' | 'COP' | 'USD';
  country: string;
  // Logo real del cliente (si existe). Si no, el sidebar usa las iniciales del
  // nombre — nunca un logo inventado.
  logoUrl?: string;
  // La "receta" del cliente: qué piezas lleva su tablero
  activeChannels: ChannelId[]; // canales (Meta, TikTok, GA4, ...)
  objectives: ObjectiveId[]; // objetivos (ventas, leads, ...) — uno o varios
  // Meta de CPL acordada con el cliente (en su moneda). Es un objetivo de
  // negocio definido por la agencia, NO un dato de la plataforma: por eso vive
  // en config de cliente y no en las tablas de métricas. Si no está definida,
  // el tablero simplemente no muestra línea de meta.
  cplTarget?: number;
}

export interface KpiData {
  label: string;
  value: string;
  delta?: { value: string; direction: 'up' | 'down' | 'neutral' };
  ytd?: string;
  ytdValue?: string;
  comparison?: string;
  spark?: number[];
  variant?: 'google' | 'meta' | 'tiktok' | 'ga4' | 'clarity' | 'shopify' | 'search' | 'violet' | 'green' | 'amber' | 'sky';
}

export interface AgentOpportunity {
  title: string;
  sub: string;
  impact?: string;
  impactSub?: string;
  cta: string;
}

export interface AgentAlert {
  type: 'critical' | 'warn' | 'info';
  icon: string;
  text: string;
}

export interface AgentProps {
  role: string;
  subtitle: string;
  avatar: string;
  channel?: 'google' | 'meta' | 'tiktok' | 'ga4' | 'clarity' | 'shopify' | 'search';
  severity?: 'hi' | 'me' | 'lo';
  severityLabel?: string;
  timestamp?: string;
  diagnosis: React.ReactNode;
  opportunities?: AgentOpportunity[];
  alerts?: AgentAlert[];
}

export type MetricCategory = 'all' | 'impr' | 'conv' | 'cost' | 'rev' | 'dim';

export interface DimensionTableColumn {
  key: string;
  label: string;
  cat: MetricCategory | MetricCategory[];
  align?: 'left' | 'right' | 'center';
}

export interface DimensionTableRow {
  id: string;
  cells: Record<string, React.ReactNode>;
  isAverage?: boolean;
}
