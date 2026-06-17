import type { ChannelId } from './channels';
import type { ObjectiveId } from './objectives';

export interface Client {
  id: string;
  name: string;
  currency: 'MXN' | 'COP' | 'USD';
  country: string;
  // La "receta" del cliente: qué piezas lleva su tablero
  activeChannels: ChannelId[]; // canales (Meta, TikTok, GA4, ...)
  objectives: ObjectiveId[]; // objetivos (ventas, leads, ...) — uno o varios
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
