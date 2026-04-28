export type WeekPoint = {
  week: string;
  value: number;
};

export type MetricBasic = {
  current: number;
  prior: number;
  priorYear: number;
  history: WeekPoint[];
};

export type MetricWithSources = MetricBasic & {
  bySource: Record<string, number>;
  // Optional — when present, rendered alongside the primary bySource value.
  // Used on the Conversion Rate card to show booking counts next to rates.
  bySourceSecondary?: Record<string, number>;
};

export type DashboardData = {
  generatedAt: string;
  weekOf: {
    start: string;
    end: string;
  };
  metrics: {
    qualifiedLeads: MetricBasic;
    totalVisitors: MetricWithSources;
    conversionRate: MetricWithSources;
    googleAdsSpend: MetricBasic;
    metaAdsSpend: MetricBasic;
    costPerBooking: MetricWithSources;
    totalBookingValue: MetricWithSources;
    roas: MetricBasic;
  };
};
