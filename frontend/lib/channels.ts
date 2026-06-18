// Configuración de canales y metadata
// En producción los canales activos vienen de Supabase: clients.enabled_channels

export type ChannelId =
  | 'ov2' | 'week'
  | 'gads' | 'pmax' | 'srch' | 'shop' | 'yt'
  | 'meta' | 'mili' | 'wa' | 'ig'
  | 'ttok'
  | 'ga4' | 'cro' | 'gsc'
  | 'shp' | 'gmc'
  | 'ia' | 'abtest' | 'learn';

export interface ChannelMeta {
  icon: string;
  title: string;
  desc: string;
  benefits: string[];
}

// Mapea cada canal potencialmente deshabilitable a su modal de "no activo"
// Vistas que no son de canal (ov2, week, mili, ia, abtest, learn) no aparecen aquí
// porque siempre están disponibles
export const CHANNEL_META: Partial<Record<ChannelId, ChannelMeta>> = {
  ttok: {
    icon: '◒',
    title: 'TikTok Ads no configurado',
    desc: 'No detectamos una cuenta de <b>TikTok Ads Manager</b> conectada para este cliente. Conéctala para recibir análisis diario de campañas, retención por video y sentiment de comentarios.',
    benefits: [
      'Sincronización diaria de campañas y ad groups',
      'Análisis ACP de retención por creativo',
      'Monitoreo de sentiment de comentarios',
      'Tracking de objetivos mensuales automático',
    ],
  },
  meta: {
    icon: '◈',
    title: 'Meta Ads no configurado',
    desc: 'No detectamos una cuenta de <b>Meta Business Suite</b> conectada. Conecta Facebook + Instagram Ads para empezar a ver performance ecommerce completo.',
    benefits: [
      'Add to cart, Initiated checkout y costos asociados',
      'Jerarquía Campaña › Ad Set › Anuncio',
      'Análisis milimétrico de retención ACP',
      'WhatsApp y Instagram incluidos',
    ],
  },
  gads: {
    icon: '◎',
    title: 'Google Ads no configurado',
    desc: 'No detectamos una cuenta de <b>Google Ads</b> conectada. Conéctala para activar Search, PMAX, Shopping y YouTube.',
    benefits: [
      'PMAX con scripts de zombies y placements',
      'Auction Insights de competidores',
      'Search drill-down por keyword',
      'Shopping + Merchant Center integrados',
    ],
  },
  wa: {
    icon: '💬',
    title: 'WhatsApp Business no configurado',
    desc: 'El cliente no tiene <b>WhatsApp Business API</b> integrada para tracking offline. Los datos de plataforma (CTWA) siguen disponibles en Meta Ads si está conectado.',
    benefits: [
      'Tracking de leads calificados',
      'Attribution a venta final',
      'Integración con CRM',
      'Análisis de flujos de conversación',
    ],
  },
  ig: {
    icon: '📱',
    title: 'Instagram Insights no configurado',
    desc: 'No detectamos una cuenta de <b>Instagram Business</b> conectada para analytics orgánico. Conéctala para ver content pillars, audiencia y performance por formato.',
    benefits: [
      'Content pillar tracking',
      'Demografía y geo de audiencia',
      'Performance por formato (Reels, Stories, Posts)',
      'Hora óptima de publicación',
    ],
  },
  shp: {
    icon: '◐',
    title: 'Shopify no configurado',
    desc: 'No detectamos una tienda <b>Shopify</b> conectada. Conecta tu API Admin para ver revenue real, funnel checkout y top productos.',
    benefits: [
      'Revenue real con AOV y CR',
      'Funnel completo de checkout',
      'Top productos vendidos',
      'Detección de productos dormidos',
    ],
  },
  ga4: {
    icon: '◇',
    title: 'Google Analytics 4 no configurado',
    desc: 'No detectamos una propiedad <b>GA4</b> conectada. Es la fuente principal de tráfico web y attribution.',
    benefits: [
      'Funnel web completo de eventos',
      'Análisis de canales de adquisición',
      'Performance por ciudades vs período',
      'Páginas más visitadas y engagement',
    ],
  },
  cro: {
    icon: '◉',
    title: 'Microsoft Clarity no configurado',
    desc: 'No detectamos un proyecto de <b>Microsoft Clarity</b> conectado. Es gratis y revela fricciones de UX imposibles de ver con otras herramientas.',
    benefits: [
      'Grabaciones de sesión automáticas',
      'Dead clicks, rage clicks, quick-backs',
      'Heatmaps y scrollmaps',
      'Recomendaciones CRO quirúrgicas',
    ],
  },
  gsc: {
    icon: '🔍',
    title: 'Google Search Console no configurado',
    desc: 'No detectamos una propiedad de <b>Search Console</b> conectada. Es crítica para SEO orgánico.',
    benefits: [
      'Keywords ganando/perdiendo',
      'Impresiones y CTR por query',
      'Errores técnicos detectados',
      'Recomendaciones SEO IA',
    ],
  },
  gmc: {
    icon: '📦',
    title: 'Google Merchant Center no configurado',
    desc: 'No detectamos una cuenta de <b>Google Merchant Center</b>. Sin esto no hay Shopping ni PMAX con feed de productos.',
    benefits: [
      'Feed health de productos',
      'Detección de 311+ zombies',
      'GTIN inválidos y attribute warnings',
      'CTR por producto',
    ],
  },
};

// Metadata de navegación (sidebar)
export interface NavItem {
  id: ChannelId;
  label: string;
  icon: string;
  href: string;
  crumb1: string;
  crumb2: string;
  isSubItem?: boolean;
  badge?: string | number;
  dotColor?: 'warn' | 'alert';
}

export interface NavSection {
  label: string;
  items: NavItem[];
}

export const NAV_SECTIONS: NavSection[] = [
  {
    label: 'General',
    items: [
      { id: 'ov2', label: 'Overview', icon: '▣', href: '/overview', crumb1: 'General', crumb2: 'Overview' },
      { id: 'week', label: 'Esta semana', icon: '⚡', href: '/week', crumb1: 'General', crumb2: 'Accionables', badge: 5 },
    ],
  },
  {
    label: 'Google Ads',
    items: [
      { id: 'gads', label: 'Overview', icon: '◎', href: '/google-ads', crumb1: 'Google Ads', crumb2: 'Overview' },
      { id: 'pmax', label: 'Performance Max', icon: '', href: '/google-ads/pmax', crumb1: 'Google Ads', crumb2: 'PMAX', isSubItem: true },
      { id: 'srch', label: 'Search', icon: '', href: '/google-ads/search', crumb1: 'Google Ads', crumb2: 'Search', isSubItem: true },
      { id: 'shop', label: 'Shopping', icon: '', href: '/google-ads/shopping', crumb1: 'Google Ads', crumb2: 'Shopping', isSubItem: true },
      { id: 'yt', label: 'YouTube', icon: '', href: '/google-ads/youtube', crumb1: 'Google Ads', crumb2: 'YouTube', isSubItem: true },
    ],
  },
  {
    label: 'Meta Ads · ACP',
    items: [
      { id: 'meta', label: 'Compras', icon: '🛒', href: '/meta', crumb1: 'Meta Ads', crumb2: 'Compras', dotColor: 'warn' },
      { id: 'mili', label: 'Análisis milimétrico', icon: '📊', href: '/meta/milimetric', crumb1: 'Meta Ads', crumb2: 'Milimétrico', isSubItem: true },
      { id: 'wa', label: 'WhatsApp', icon: '💬', href: '/meta/whatsapp', crumb1: 'Meta Ads', crumb2: 'WhatsApp', isSubItem: true },
      { id: 'ig', label: 'Instagram orgánico', icon: '📸', href: '/meta/instagram', crumb1: 'Instagram', crumb2: 'Orgánico', isSubItem: true },
    ],
  },
  {
    label: 'TikTok Ads',
    items: [
      { id: 'ttok', label: 'Overview', icon: '◒', href: '/tiktok', crumb1: 'TikTok', crumb2: 'Overview' },
    ],
  },
  {
    label: 'Analytics',
    items: [
      { id: 'ga4', label: 'GA4', icon: '◇', href: '/analytics/ga4', crumb1: 'Analytics', crumb2: 'GA4' },
      { id: 'cro', label: 'Clarity · CRO', icon: '◉', href: '/analytics/clarity', crumb1: 'Analytics', crumb2: 'Clarity' },
      { id: 'gsc', label: 'Search Console', icon: '🔍', href: '/analytics/search-console', crumb1: 'Analytics', crumb2: 'Search Console' },
    ],
  },
  {
    label: 'Ecommerce',
    items: [
      { id: 'shp', label: 'Shopify', icon: '◐', href: '/ecommerce/shopify', crumb1: 'Ecommerce', crumb2: 'Shopify' },
      { id: 'gmc', label: 'Merchant Center', icon: '📦', href: '/ecommerce/merchant-center', crumb1: 'Ecommerce', crumb2: 'GMC' },
    ],
  },
  {
    label: 'IA & Aprendizajes',
    items: [
      { id: 'ia', label: 'Conclusiones IA', icon: '✦', href: '/ai/insights', crumb1: 'IA', crumb2: 'Conclusiones' },
      { id: 'abtest', label: 'A/B tests', icon: '🧪', href: '/ai/ab-tests', crumb1: 'IA', crumb2: 'A/B tests', isSubItem: true },
      { id: 'learn', label: 'Aprendizajes', icon: '📚', href: '/ai/learnings', crumb1: 'IA', crumb2: 'Aprendizajes', isSubItem: true },
    ],
  },
];
