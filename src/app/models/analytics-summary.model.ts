export interface AnalyticsSummary {
  eventId: string;
  totalTicketsSold: number;
  totalRevenue: number;
  occupancyRate: number;
  dateRange: { start: Date; end: Date };
}