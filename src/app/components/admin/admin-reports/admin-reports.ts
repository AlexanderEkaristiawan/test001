import { Component, OnInit, AfterViewInit, OnDestroy, Inject, PLATFORM_ID } from '@angular/core';
import { CommonModule, isPlatformBrowser } from '@angular/common';
import Chart from 'chart.js/auto';
import { RouterLink } from '@angular/router';
import { EventService } from '../../../services/event.service';
import { BookingService } from '../../../services/booking.service';
import { UsersService, toUser } from '../../../services/users.service';
import { Event } from '../../../models/event.model';
import { Booking } from '../../../models/booking.model';
import { User } from '../../../models/user.model';

interface AuditoriumUtilization {
  usageFrequency: string;
  bookedDays: number;
  freeDays: number;
  utilizationRate: string;
}

interface EventStat {
  name: string;
  sold: number;
  revenue: number;
}

interface AllEventsSummary {
  totalEvents: number;
  totalTicketsSold: number;
  totalRevenue: number;
  totalCapacity: number;
  averageOccupancy: string;
  highestSellingEvent: EventStat;
  lowestPerformingEvent: EventStat;
  eventStats: EventStat[];
}

interface OrganizerPerformance {
  name: string;
  eventsCreated: number;
  ticketsSold: number;
  revenue: number;
}

interface RevenueTrend {
  date: string;
  revenue: number;
}

interface FinancialOverview {
  totalRevenue: number;
  grossRevenue: number;
  totalDiscounts: number;
  successfulPayments: number;
  totalBookings: number;
  revenueTrend: RevenueTrend[];
}

@Component({
  selector: 'app-admin-reports',
  standalone: true,
  imports: [CommonModule,RouterLink],
  templateUrl: './admin-reports.html',
  styleUrls: ['./admin-reports.css'],
})
export class AdminReportsComponent implements OnInit, AfterViewInit, OnDestroy {
  activeFilter: 'last7days' | 'last30days' | 'allTime' = 'last30days';

  // Metrics
  totalEvents: number = 0;
  auditoriumUtilization?: AuditoriumUtilization;
  allEventsSummary?: AllEventsSummary;
  organizerPerformance: OrganizerPerformance[] = [];
  financialOverview?: FinancialOverview;
  
  // Charts
  auditoriumChart: Chart | undefined;
  eventsSummaryChart: Chart | undefined;
  organizerPerformanceChart: Chart | undefined;
  financialChart: Chart | undefined;

  private allEvents: Event[] = [];
  private allBookings: Booking[] = [];
  private allUsers: User[] = [];

  constructor(
    private eventService: EventService,
    private bookingService: BookingService,
    private usersService: UsersService,
    @Inject(PLATFORM_ID) private platformId: Object
  ) {}

  

  ngOnInit(): void {
    this.loadAllData();
  }

  ngAfterViewInit(): void {
    if (isPlatformBrowser(this.platformId)) {
      setTimeout(() => {
        this.createCharts();
      }, 100);
    }
  }

  ngOnDestroy(): void {
    if (isPlatformBrowser(this.platformId)) {
      this.destroyCharts();
    }
  }

  loadAllData(): void {
    this.allEvents = this.eventService.getAllEvents();
    this.allBookings = this.bookingService.getAll();
    this.allUsers = this.usersService.getAll()
      .map(u => {
        try {
          return toUser(u);
        } catch {
          return null;
        }
      })
      .filter((u): u is User => u !== null && u.role === 'organizer');
    
    this.setFilter('last30days');
  }
  
  setFilter(filter: 'last7days' | 'last30days' | 'allTime') {
    this.activeFilter = filter;
    this.updateData();
  }

  updateData() {
    const now = new Date();
    let startDate = new Date(0);
  
    if (this.activeFilter === 'last7days') {
      startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    } else if (this.activeFilter === 'last30days') {
      startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    }

    // Filter events and bookings by date
    const filteredEvents = this.activeFilter === 'allTime' 
      ? this.allEvents 
      : this.allEvents.filter(e => {
          const eventDate = new Date(e.date);
          return eventDate >= startDate && eventDate <= now;
        });
    
    const filteredBookings = this.activeFilter === 'allTime'
      ? this.allBookings.filter(b => new Date(b.createdAt) >= startDate && b.status !== 'cancelled')
      : this.allBookings.filter(b => {
          const bookingDate = new Date(b.createdAt);
          return bookingDate >= startDate && bookingDate <= now && b.status !== 'cancelled';
        });

    // Calculate metrics
    this.totalEvents = filteredEvents.length;
    this.calculateAuditoriumUtilization(filteredEvents);
    this.calculateAllEventsSummary(filteredEvents, filteredBookings);
    this.calculateOrganizerPerformance(filteredEvents, filteredBookings);
    this.calculateFinancialOverview(filteredBookings);

    if (isPlatformBrowser(this.platformId)) {
      this.destroyCharts();
      setTimeout(() => {
        this.createCharts();
      }, 100);
    }
  }

  private calculateAuditoriumUtilization(events: Event[]): void {
    const uniqueDates = new Set<string>();
    events.forEach(event => {
      const dateStr = new Date(event.date).toISOString().split('T')[0];
      uniqueDates.add(dateStr);
    });

    const totalDays = this.activeFilter === 'allTime' ? 365 : (this.activeFilter === 'last30days' ? 30 : 7);
    const bookedDays = uniqueDates.size;
    const freeDays = totalDays - bookedDays;
    const utilizationRate = (bookedDays / totalDays) * 100;

    let frequency = 'Low';
    if (utilizationRate >= 80) frequency = 'Very High';
    else if (utilizationRate >= 60) frequency = 'High';
    else if (utilizationRate >= 40) frequency = 'Medium';

    this.auditoriumUtilization = {
      usageFrequency: frequency,
      bookedDays,
      freeDays,
      utilizationRate: utilizationRate.toFixed(2)
    };
  }

  private calculateAllEventsSummary(events: Event[], bookings: Booking[]): void {
    const totalTicketsSold = bookings.reduce((acc, b) => acc + b.seats.length, 0);
    const totalRevenue = bookings.reduce((acc, b) => acc + b.finalPrice, 0);
    const totalCapacity = events.reduce((acc, e) => {
      const eventCapacity = ((e as any).sections || []).reduce((sectionTotal: number, section: { seatRows: unknown[][] }) => {
        const rowsCapacity = (section.seatRows || []).reduce((rowTotal: number, row: unknown[]) => rowTotal + (row ? row.length : 0), 0);
        return sectionTotal + rowsCapacity;
      }, 0);
      return acc + eventCapacity;
    }, 0);
    const averageOccupancy = totalCapacity > 0 ? (totalTicketsSold / totalCapacity) * 100 : 0;

    // Find highest and lowest performing events
    const eventStats: { [key: string]: EventStat } = {};
    bookings.forEach(booking => {
      if (!eventStats[booking.eventId]) {
        eventStats[booking.eventId] = { name: booking.eventName, sold: 0, revenue: 0 };
      }
      eventStats[booking.eventId].sold += booking.seats.length;
      eventStats[booking.eventId].revenue += booking.finalPrice;
    });

    const eventArray = Object.values(eventStats);
    const highestEvent = eventArray.length > 0 
      ? eventArray.reduce((max, e) => e.sold > max.sold ? e : max, eventArray[0])
      : { name: 'N/A', sold: 0, revenue: 0 };
    const lowestEvent = eventArray.length > 0
      ? eventArray.reduce((min, e) => e.sold < min.sold ? e : min, eventArray[0])
      : { name: 'N/A', sold: 0, revenue: 0 };

    this.allEventsSummary = {
      totalEvents: events.length,
      totalTicketsSold,
      totalRevenue,
      totalCapacity,
      averageOccupancy: averageOccupancy.toFixed(2),
      highestSellingEvent: highestEvent,
      lowestPerformingEvent: lowestEvent,
      eventStats: eventArray
    };
  }

  private calculateOrganizerPerformance(events: Event[], bookings: Booking[]): void {
    const organizerStats: { [key: string]: OrganizerPerformance } = {};

    // Count events per organizer
    events.forEach(event => {
      if (!organizerStats[event.organizerId]) {
        const organizer = this.allUsers.find(u => u.userId === event.organizerId);
        organizerStats[event.organizerId] = {
          name: organizer?.fullName || organizer?.organizationName || 'Unknown',
          eventsCreated: 0,
          ticketsSold: 0,
          revenue: 0
        };
      }
      organizerStats[event.organizerId].eventsCreated += 1;
    });

    // Count bookings per organizer
    bookings.forEach(booking => {
      const event = events.find(e => e.eventId === booking.eventId);
      if (event && organizerStats[event.organizerId]) {
        organizerStats[event.organizerId].ticketsSold += booking.seats.length;
        organizerStats[event.organizerId].revenue += booking.finalPrice;
      }
    });

    this.organizerPerformance = Object.values(organizerStats)
      .sort((a, b) => b.eventsCreated - a.eventsCreated);
  }

  private calculateFinancialOverview(bookings: Booking[]): void {
    const totalRevenue = bookings.reduce((acc, b) => acc + b.finalPrice, 0);
    const totalDiscounts = bookings.reduce((acc, b) => acc + b.discount, 0);
    const grossRevenue = totalRevenue + totalDiscounts;
    const successfulPayments = bookings.filter(b => b.status === 'paid').length;
    const totalBookings = bookings.length;

    // Calculate revenue trend
    const revenueByDate: Record<string, number> = {};
    bookings.forEach(booking => {
      const date = new Date(booking.createdAt).toISOString().split('T')[0];
      if (!revenueByDate[date]) {
        revenueByDate[date] = 0;
      }
      revenueByDate[date] += booking.finalPrice;
    });

    const sortedDates = Object.keys(revenueByDate).sort((a, b) => new Date(a).getTime() - new Date(b).getTime());
    const revenueTrend = sortedDates.map(date => ({
      date: new Date(date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
      revenue: revenueByDate[date]
    }));

    this.financialOverview = {
      totalRevenue,
      grossRevenue,
      totalDiscounts,
      successfulPayments,
      totalBookings,
      revenueTrend
    };
  }

  createCharts() {
    this.renderAuditoriumChart();
    this.renderEventsSummaryChart();
    this.renderOrganizerPerformanceChart();
    this.renderFinancialChart();
  }

  private destroyCharts(): void {
    if (this.auditoriumChart) {
      this.auditoriumChart.destroy();
      this.auditoriumChart = undefined;
    }
    if (this.eventsSummaryChart) {
      this.eventsSummaryChart.destroy();
      this.eventsSummaryChart = undefined;
    }
    if (this.organizerPerformanceChart) {
      this.organizerPerformanceChart.destroy();
      this.organizerPerformanceChart = undefined;
    }
    if (this.financialChart) {
      this.financialChart.destroy();
      this.financialChart = undefined;
    }
  }

  renderAuditoriumChart(): void {
    const ctx = document.getElementById('auditoriumChart') as HTMLCanvasElement;
    if (!ctx || !this.auditoriumUtilization) return;

    this.auditoriumChart = new Chart(ctx, {
      type: 'doughnut',
      data: {
        labels: ['Booked Days', 'Free Days'],
        datasets: [{
          data: [this.auditoriumUtilization.bookedDays, this.auditoriumUtilization.freeDays],
          backgroundColor: ['rgba(75, 192, 192, 0.6)', 'rgba(153, 102, 255, 0.6)'],
        }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
      },
    });
  }

  renderEventsSummaryChart(): void {
    const ctx = document.getElementById('eventsSummaryChart') as HTMLCanvasElement;
    if (!ctx || !this.allEventsSummary || !this.allEventsSummary.eventStats || this.allEventsSummary.eventStats.length === 0) return;

    // Show top 10 events
    const topEvents = this.allEventsSummary.eventStats
      .sort((a, b) => b.sold - a.sold)
      .slice(0, 10);

    const labels = topEvents.map(e => e.name.length > 20 ? e.name.substring(0, 20) + '...' : e.name);
    const soldData = topEvents.map(e => e.sold);

    this.eventsSummaryChart = new Chart(ctx, {
      type: 'bar',
      data: {
        labels: labels,
        datasets: [{
          label: 'Tickets Sold',
          data: soldData,
          backgroundColor: 'rgba(54, 162, 235, 0.6)',
        }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        indexAxis: 'y',
        scales: {
          x: {
            beginAtZero: true
          }
        }
      },
    });
  }

  renderOrganizerPerformanceChart(): void {
    const ctx = document.getElementById('organizerPerformanceChart') as HTMLCanvasElement;
    if (!ctx || !this.organizerPerformance || this.organizerPerformance.length === 0) return;

    const labels = this.organizerPerformance.map(org => org.name.length > 15 ? org.name.substring(0, 15) + '...' : org.name);
    const eventsData = this.organizerPerformance.map(org => org.eventsCreated);
    const revenueData = this.organizerPerformance.map(org => org.revenue);

    this.organizerPerformanceChart = new Chart(ctx, {
      type: 'bar',
      data: {
        labels: labels,
        datasets: [
          {
            label: 'Events Created',
            data: eventsData,
            backgroundColor: 'rgba(75, 192, 192, 0.6)',
            yAxisID: 'yEvents',
          },
          {
            label: 'Revenue ($)',
            data: revenueData,
            backgroundColor: 'rgba(255, 206, 86, 0.6)',
            yAxisID: 'yRevenue',
          }
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        scales: {
          yEvents: {
            type: 'linear',
            display: true,
            position: 'left',
            title: {
              display: true,
              text: 'Events Created'
            }
          },
          yRevenue: {
            type: 'linear',
            display: true,
            position: 'right',
            title: {
              display: true,
              text: 'Revenue ($)'
            },
            grid: {
              drawOnChartArea: false,
            }
          }
        }
      },
    });
  }

  renderFinancialChart(): void {
    const ctx = document.getElementById('financialChart') as HTMLCanvasElement;
    if (!ctx || !this.financialOverview || !this.financialOverview.revenueTrend || this.financialOverview.revenueTrend.length === 0) return;

    const labels = this.financialOverview.revenueTrend.map(trend => trend.date);
    const data = this.financialOverview.revenueTrend.map(trend => trend.revenue);

    this.financialChart = new Chart(ctx, {
      type: 'line',
      data: {
        labels: labels,
        datasets: [{
          label: 'Revenue Trend',
          data: data,
          borderColor: 'rgba(255, 206, 86, 1)',
          backgroundColor: 'rgba(255, 206, 86, 0.2)',
          fill: true,
        }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        scales: {
          y: {
            beginAtZero: true
          }
        }
      },
    });
  }

  openExportDialog(): void {
    // Offer quick choices and export the selected periods. Use an explicit flow
    // instead of placeholder alerts.
    const choice = prompt(
      'Select time period for PDF export:\n\n' +
      '1. Weekly (Last 7 Days)\n' +
      '2. Monthly (Last 30 Days)\n' +
      '3. All Time\n' +
      '4. All Periods (Weekly + Monthly + All Time)\n\n' +
      'Enter choice (1-4):'
    );

    if (!choice) return;

    switch (choice) {
      case '1':
        this.exportToPdf('last7days');
        break;
      case '2':
        this.exportToPdf('last30days');
        break;
      case '3':
        this.exportToPdf('allTime');
        break;
      case '4':
        // Composite export: include all three periods in one PDF
        this.exportToPdf('allPeriods');
        break;
      default:
        alert('Invalid choice');
    }
  }

  private getFilteredDataForPeriod(period: 'last7days' | 'last30days' | 'allTime') {
    const now = new Date();
    let startDate = new Date(0);
    if (period === 'last7days') startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    else if (period === 'last30days') startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    const events = period === 'allTime'
      ? this.allEvents
      : this.allEvents.filter(e => new Date(e.date) >= startDate && new Date(e.date) <= now);

    const bookings = period === 'allTime'
      ? this.allBookings.filter(b => b.status !== 'cancelled')
      : this.allBookings.filter(b => {
          const bookingDate = new Date(b.createdAt);
          return bookingDate >= startDate && bookingDate <= now && b.status !== 'cancelled';
        });

    return { events, bookings };
  }

  async exportToPdf(reportId: string) {
    try {
      // dynamic import so the bundle only loads when user exports
      const jspdfModule: any = await import('jspdf');
      const { jsPDF } = jspdfModule;
      // import autotable plugin (it augments jsPDF when imported)
  // Import autotable and get the function (ES module default or CJS export)
  const autoTableModule: any = await import('jspdf-autotable');
  const autoTable = autoTableModule && (autoTableModule.default || autoTableModule);

  const doc = new jsPDF({ unit: 'pt', format: 'a4' });
      const periods: Array<'last7days' | 'last30days' | 'allTime'> = [];

      if (reportId === 'allPeriods') {
        periods.push('last7days', 'last30days', 'allTime');
      } else if (reportId === 'last7days' || reportId === 'last30days' || reportId === 'allTime') {
        periods.push(reportId as any);
      } else {
        // fallback to current active filter
        periods.push(this.activeFilter);
      }

      const nowLabel = new Date().toISOString().replace(/[:.]/g, '-');
      let pageIndex = 0;

      for (const period of periods) {
        if (pageIndex > 0) doc.addPage();

        const { events, bookings } = this.getFilteredDataForPeriod(period);

        // Header
        const title = period === 'last7days' ? 'Weekly Report (Last 7 Days)'
          : period === 'last30days' ? 'Monthly Report (Last 30 Days)'
          : 'All Time Report';

        doc.setFontSize(14);
        doc.text(title, 40, 50);
        doc.setFontSize(10);
        doc.text(`Generated: ${new Date().toLocaleString()}`, 40, 66);

        // Summary metrics
        const totalEvents = events.length;
        const totalTickets = bookings.reduce((acc, b) => acc + (b.seats ? b.seats.length : 0), 0);
        const totalRevenue = bookings.reduce((acc, b) => acc + (b.finalPrice || 0), 0);

        const summaryLines = [
          `Total Events: ${totalEvents}`,
          `Total Tickets Sold: ${totalTickets}`,
          `Total Revenue: $${totalRevenue.toFixed(2)}`
        ];

        let y = 90;
        doc.setFontSize(10);
        for (const line of summaryLines) {
          doc.text(line, 40, y);
          y += 14;
        }

        // Event stats table (top events)
        const eventStatsMap: Record<string, { name: string; sold: number; revenue: number }> = {};
        bookings.forEach(b => {
          if (!eventStatsMap[b.eventId]) eventStatsMap[b.eventId] = { name: b.eventName || 'Unknown', sold: 0, revenue: 0 };
          eventStatsMap[b.eventId].sold += (b.seats ? b.seats.length : 0);
          eventStatsMap[b.eventId].revenue += (b.finalPrice || 0);
        });

        const eventRows = Object.values(eventStatsMap)
          .sort((a, b) => b.sold - a.sold)
          .map(es => [es.name, String(es.sold), `$${es.revenue.toFixed(2)}`]);

        if (eventRows.length > 0) {
          // add a small gap before table
          y += 8;
          // call autoTable as a function
          if (autoTable) {
            autoTable(doc, {
              startY: y,
              head: [['Event', 'Tickets Sold', 'Revenue ($)']],
              body: eventRows,
              styles: { fontSize: 9 },
              margin: { left: 40, right: 40 }
            });
            y = (doc as any).lastAutoTable ? (doc as any).lastAutoTable.finalY + 10 : y + 100;
          }
        }

        // Organizer performance table
        const organizerMap: Record<string, { name: string; eventsCreated: number; ticketsSold: number; revenue: number }> = {};
        events.forEach(ev => {
          const orgId = (ev as any).organizerId || 'unknown';
          if (!organizerMap[orgId]) organizerMap[orgId] = { name: 'Unknown', eventsCreated: 0, ticketsSold: 0, revenue: 0 };
          organizerMap[orgId].eventsCreated += 1;
        });
        bookings.forEach(b => {
          const ev = events.find(e => e.eventId === b.eventId);
          if (!ev) return;
          const orgId = (ev as any).organizerId || 'unknown';
          if (!organizerMap[orgId]) organizerMap[orgId] = { name: 'Unknown', eventsCreated: 0, ticketsSold: 0, revenue: 0 };
          organizerMap[orgId].ticketsSold += (b.seats ? b.seats.length : 0);
          organizerMap[orgId].revenue += (b.finalPrice || 0);
        });

        const orgRows = Object.values(organizerMap)
          .map(o => [o.name, String(o.eventsCreated), String(o.ticketsSold), `$${o.revenue.toFixed(2)}`]);

        if (orgRows.length > 0) {
          // add table
          if (autoTable) {
            autoTable(doc, {
              startY: y,
              head: [['Organizer', 'Events', 'Tickets Sold', 'Revenue ($)']],
              body: orgRows,
              styles: { fontSize: 9 },
              margin: { left: 40, right: 40 }
            });
            y = (doc as any).lastAutoTable ? (doc as any).lastAutoTable.finalY + 10 : y + 100;
          }
        }

        // Revenue trend table
        const revenueByDate: Record<string, number> = {};
        bookings.forEach(b => {
          const d = new Date(b.createdAt).toISOString().split('T')[0];
          revenueByDate[d] = (revenueByDate[d] || 0) + (b.finalPrice || 0);
        });
        const revenueRows = Object.keys(revenueByDate).sort((a, b) => new Date(a).getTime() - new Date(b).getTime())
          .map(d => [new Date(d).toLocaleDateString(), `$${revenueByDate[d].toFixed(2)}`]);

        if (revenueRows.length > 0) {
          if (autoTable) {
            autoTable(doc, {
              startY: y,
              head: [['Date', 'Revenue ($)']],
              body: revenueRows,
              styles: { fontSize: 9 },
              margin: { left: 40, right: 40 }
            });
            y = (doc as any).lastAutoTable ? (doc as any).lastAutoTable.finalY + 10 : y + 100;
          }
        }

        pageIndex++;
      }

      const filename = `admin-report-${nowLabel}.pdf`;
      doc.save(filename);
    } catch (err) {
      console.error('Export to PDF failed', err);
      const msg = (err && (err as any).message) ? (err as any).message : String(err);
      alert('Failed to export PDF: ' + msg);
    }
  }
}
