import { Component, OnInit, AfterViewInit, OnDestroy, Inject, PLATFORM_ID } from '@angular/core';
import { RouterLink } from '@angular/router';
import Chart from 'chart.js/auto';
import { CommonModule, isPlatformBrowser } from '@angular/common';
import { AuthService } from '../../../services/auth.service';
import { EventService } from '../../../services/event.service';
import { BookingService } from '../../../services/booking.service';
import { Event } from '../../../models/event.model';
import { Booking } from '../../../models/booking.model';
import { User } from '../../../models/user.model';
import { Subscription } from 'rxjs';

@Component({
  selector: 'app-organizer-view-reports',
  imports: [RouterLink, CommonModule],
  templateUrl: './organizer-view-reports.html',
  styleUrls: ['./organizer-view-reports.css'],
  standalone: true,
})
export class OrganizerViewReportsComponent implements OnInit, AfterViewInit, OnDestroy {
  activeFilter: 'last7days' | 'last30days' | 'allTime' = 'allTime';
  
  // Metrics
  totalEvents: number = 0;
  totalTicketsSold: number = 0;
  totalRevenue: number = 0;
  occupancyRate: number = 0;
  totalDiscountAmount: number = 0;
  promoUsageCount: number = 0;
  
  // Data
  organizer: User | null = null;
  organizerEvents: Event[] = [];
  organizerBookings: Booking[] = [];
  loading = true;

  // Ticket sales by type
  ticketSalesByType: { type: string; count: number; revenue: number }[] = [];
  
  // Promo impact data
  promoImpact: { code: string; uses: number; totalDiscount: number }[] = [];

  private revenueChart?: Chart;
  private salesByTypeChart?: Chart;
  private occupancyChart?: Chart;
  private promoImpactChart?: Chart;
  private subs: Subscription[] = [];

  constructor(
    private authService: AuthService,
    private eventService: EventService,
    private bookingService: BookingService,
    @Inject(PLATFORM_ID) private platformId: Object
  ) {}

  ngOnInit(): void {
    this.organizer = this.authService.getUser();
    if (this.organizer) {
      this.loadData();
    } else {
      this.loading = false;
    }
  }

  ngAfterViewInit(): void {
    // Charts are now created in `updateCharts` after data is loaded.
  }

  ngOnDestroy(): void {
    this.destroyCharts();
    this.subs.forEach(sub => sub.unsubscribe());
  }

  loadData(): void {
    this.loading = true;
    if (!this.organizer) return;

    // Subscribe to events
    const eventsSub = this.eventService.events$.subscribe(allEvents => {
      this.organizerEvents = allEvents.filter(e => e.organizerId === this.organizer?.userId);
      
      // Subscribe to bookings
      const bookingsSub = this.bookingService.bookings$.subscribe(allBookings => {
        const organizerEventIds = this.organizerEvents.map(e => e.eventId);
        this.organizerBookings = allBookings.filter(b => organizerEventIds.includes(b.eventId));
        
        console.log('Data loaded:', {
          events: this.organizerEvents.length,
          bookings: this.organizerBookings.length
        });
        
        this.setFilter('allTime'); // Initial update
        this.loading = false;
      });
      
      this.subs.push(bookingsSub);
    });
    
    this.subs.push(eventsSub);
  }

  setFilter(filter: 'last7days' | 'last30days' | 'allTime'): void {
    this.activeFilter = filter;
    this.updateReport();
  }

  updateReport(): void {
    const now = new Date();
    let filteredBookings: Booking[] = [];
    let filteredEvents: Event[] = [];

    // Filter bookings based on activeFilter
    if (this.activeFilter === 'last7days') {
      const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      filteredBookings = this.organizerBookings.filter(b => new Date(b.createdAt) >= sevenDaysAgo);
      filteredEvents = this.organizerEvents.filter(e => new Date(e.createdAt || e.date) >= sevenDaysAgo);
    } else if (this.activeFilter === 'last30days') {
      const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      filteredBookings = this.organizerBookings.filter(b => new Date(b.createdAt) >= thirtyDaysAgo);
      filteredEvents = this.organizerEvents.filter(e => new Date(e.createdAt || e.date) >= thirtyDaysAgo);
    } else {
      filteredBookings = this.organizerBookings;
      filteredEvents = this.organizerEvents;
    }

    console.log(`Filtered: ${filteredEvents.length} events, ${filteredBookings.length} bookings`);

    // Calculate metrics
    this.calculateMetrics(filteredBookings, filteredEvents);
    
    // Calculate additional data
    this.calculateTicketSalesByType(filteredBookings);
    this.calculatePromoImpact(filteredBookings);

    // Update charts
    this.updateCharts(filteredBookings, filteredEvents);
  }

  calculateMetrics(bookings: Booking[], events: Event[]): void {
    this.totalEvents = events.length;
    this.totalTicketsSold = bookings.reduce((acc, b) => acc + (b.seats?.length || 0), 0);
    this.totalRevenue = bookings.reduce((acc, b) => acc + (b.finalPrice || 0), 0);
    this.totalDiscountAmount = bookings.reduce((acc, b) => acc + (b.discount || 0), 0);
    this.promoUsageCount = bookings.filter(b => b.promoCode && b.promoCode.trim() !== '').length;

    // Calculate occupancy
    const totalCapacity = events.reduce((acc, e) => acc + this.getEventCapacity(e), 0);
    this.occupancyRate = totalCapacity > 0 ? (this.totalTicketsSold / totalCapacity) * 100 : 0;

    console.log('Metrics calculated:', {
      totalEvents: this.totalEvents,
      totalTicketsSold: this.totalTicketsSold,
      totalRevenue: this.totalRevenue,
      occupancyRate: this.occupancyRate
    });
  }

  getEventCapacity(event: Event): number {
    if (!event.sections || !Array.isArray(event.sections)) return 0;
    
    let capacity = 0;
    event.sections.forEach(section => {
      if (section.seatRows && Array.isArray(section.seatRows)) {
        section.seatRows.forEach((row: string) => {
          if (Array.isArray(row)) {
            capacity += row.length;
          }
        });
      }
    });
    
    return capacity;
  }

  calculateTicketSalesByType(bookings: Booking[]): void {
    const salesByType: { [key: string]: { count: number; revenue: number } } = {};
    
    bookings.forEach(booking => {
      if (!booking.seats || !Array.isArray(booking.seats)) return;
      
      booking.seats.forEach(seat => {
        const seatType = seat.seatType || 'General';
        if (!salesByType[seatType]) {
          salesByType[seatType] = { count: 0, revenue: 0 };
        }
        salesByType[seatType].count += 1;
        
        // Estimate revenue per seat
        const pricePerSeat = (booking.finalPrice || 0) / (booking.seats.length || 1);
        salesByType[seatType].revenue += pricePerSeat;
      });
    });
    
    this.ticketSalesByType = Object.keys(salesByType).map(type => ({
      type,
      count: salesByType[type].count,
      revenue: salesByType[type].revenue
    })).sort((a, b) => b.count - a.count);
  }

  calculatePromoImpact(bookings: Booking[]): void {
    const promoData: { [key: string]: { uses: number; totalDiscount: number } } = {};
    
    bookings.forEach(booking => {
      if (booking.promoCode && booking.promoCode.trim() !== '') {
        const code = booking.promoCode.trim();
        if (!promoData[code]) {
          promoData[code] = { uses: 0, totalDiscount: 0 };
        }
        promoData[code].uses += 1;
        promoData[code].totalDiscount += (booking.discount || 0);
      }
    });
    
    this.promoImpact = Object.keys(promoData).map(code => ({
      code,
      uses: promoData[code].uses,
      totalDiscount: promoData[code].totalDiscount
    })).sort((a, b) => b.uses - a.uses);
  }

  createCharts(): void {
    // Initialize with empty data, will update later
    this.createRevenueChart([]);
    this.createSalesByTypeChart();
    this.createOccupancyChart([]);
    this.createPromoImpactChart();
  }

  updateCharts(bookings: Booking[], events: Event[]): void {
    if (!isPlatformBrowser(this.platformId)) return;

    // Destroy existing charts
    this.destroyCharts();
    
    // Recreate charts with new data
    setTimeout(() => {
      this.createRevenueChart(bookings);
      this.createSalesByTypeChart();
      this.createOccupancyChart(events);
      this.createPromoImpactChart();
    }, 50);
  }

  private destroyCharts(): void {
    [this.revenueChart, this.salesByTypeChart, this.occupancyChart, this.promoImpactChart].forEach(chart => {
      if (chart) {
        chart.destroy();
        chart = undefined;
      }
    });
  }

  private createRevenueChart(bookings: Booking[]): void {
    const ctx = document.getElementById('revenueChart') as HTMLCanvasElement;
    if (!ctx) {
      console.warn('Revenue chart canvas not found');
      return;
    }

    // Generate time-based data
    const { labels, revenueData, salesData } = this.generateTimeSeriesData(bookings);

    this.revenueChart = new Chart(ctx, {
      type: 'line',
      data: {
        labels: labels,
        datasets: [
          {
            label: 'Revenue',
            data: revenueData,
            borderColor: '#fca311',
            backgroundColor: 'rgba(252, 163, 17, 0.2)',
            fill: true,
            tension: 0.4
          },
          {
            label: 'Tickets Sold',
            data: salesData,
            borderColor: '#4361ee',
            backgroundColor: 'rgba(67, 97, 238, 0.2)',
            fill: true,
            tension: 0.4
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        scales: {
          y: {
            beginAtZero: true
          }
        }
      }
    });
  }

  private generateTimeSeriesData(bookings: Booking[]): { labels: string[], revenueData: number[], salesData: number[] } {
    const revenueMap = new Map<string, number>();
    const salesMap = new Map<string, number>();
    const labels: string[] = [];

    // Group by date
    bookings.forEach(booking => {
      const date = new Date(booking.createdAt);
      const dateStr = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
      
      // Revenue
      const currentRevenue = revenueMap.get(dateStr) || 0;
      revenueMap.set(dateStr, currentRevenue + (booking.finalPrice || 0));
      
      // Sales
      const currentSales = salesMap.get(dateStr) || 0;
      salesMap.set(dateStr, currentSales + (booking.seats?.length || 0));
    });

    // Sort by date
    const sortedDates = Array.from(revenueMap.keys()).sort((a, b) => {
      return new Date(a).getTime() - new Date(b).getTime();
    });

    sortedDates.forEach(date => {
      labels.push(date);
    });

    const revenueData = sortedDates.map(date => revenueMap.get(date) || 0);
    const salesData = sortedDates.map(date => salesMap.get(date) || 0);

    return { labels, revenueData, salesData };
  }

  private createSalesByTypeChart(): void {
    const ctx = document.getElementById('salesByTypeChart') as HTMLCanvasElement;
    if (!ctx) {
      console.warn('Sales by type chart canvas not found');
      return;
    }

    if (this.ticketSalesByType.length === 0) {
      console.warn('No ticket sales by type data');
      return;
    }

    const labels = this.ticketSalesByType.map(item => item.type);
    const data = this.ticketSalesByType.map(item => item.count);

    this.salesByTypeChart = new Chart(ctx, {
      type: 'bar',
      data: {
        labels: labels,
        datasets: [{
          label: 'Tickets Sold',
          data: data,
          backgroundColor: '#4361ee',
        }]
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
      }
    });
  }

  private createOccupancyChart(events: Event[]): void {
    const ctx = document.getElementById('occupancyChart') as HTMLCanvasElement;
    if (!ctx) {
      console.warn('Occupancy chart canvas not found');
      return;
    }

    if (events.length === 0) {
      console.warn('No events data for occupancy chart');
      return;
    }

    const labels: string[] = [];
    const soldData: number[] = [];
    const capacityData: number[] = [];

    events.forEach(event => {
      const capacity = this.getEventCapacity(event);
      if (capacity > 0) {
        const eventBookings = this.organizerBookings.filter(b => b.eventId === event.eventId);
        const ticketsSold = eventBookings.reduce((acc, b) => acc + (b.seats?.length || 0), 0);
        
        labels.push(event.title?.length > 20 ? event.title.substring(0, 20) + '...' : event.title || 'Unknown');
        soldData.push(ticketsSold);
        capacityData.push(capacity);
      }
    });

    this.occupancyChart = new Chart(ctx, {
      type: 'bar',
      data: {
        labels: labels,
        datasets: [
          {
            label: 'Sold Seats',
            data: soldData,
            backgroundColor: 'rgba(75, 192, 192, 0.6)',
          },
          {
            label: 'Total Capacity',
            data: capacityData,
            backgroundColor: 'rgba(153, 102, 255, 0.6)',
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        scales: {
          y: {
            beginAtZero: true
          }
        }
      }
    });
  }

  private createPromoImpactChart(): void {
    const ctx = document.getElementById('promoImpactChart') as HTMLCanvasElement;
    if (!ctx) {
      console.warn('Promo impact chart canvas not found');
      return;
    }

    if (this.promoImpact.length === 0) {
      console.warn('No promo impact data');
      // Clear the canvas if there's no data
      const chart = Chart.getChart(ctx);
      if (chart) {
        chart.destroy();
      }
      return;
    }

    const labels = this.promoImpact.map(item => item.code);
    const usesData = this.promoImpact.map(item => item.uses);

    this.promoImpactChart = new Chart(ctx, {
      type: 'bar',
      data: {
        labels: labels,
        datasets: [
          {
            label: 'Times Used',
            data: usesData,
            backgroundColor: 'rgba(255, 99, 132, 0.6)',
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        scales: {
          y: {
            beginAtZero: true,
            title: {
              display: true,
              text: 'Times Used'
            }
          }
        }
      }
    });
  }

  openExportDialog(): void {
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
      ? this.organizerEvents
      : this.organizerEvents.filter(e => new Date(e.date) >= startDate && new Date(e.date) <= now);

    const bookings = period === 'allTime'
      ? this.organizerBookings
      : this.organizerBookings.filter(b => {
          const bookingDate = new Date(b.createdAt);
          return bookingDate >= startDate && bookingDate <= now;
        });

    return { events, bookings };
  }

  async exportToPdf(reportId: string) {
    try {
      const jspdfModule: any = await import('jspdf');
      const { jsPDF } = jspdfModule;
      const autoTableModule: any = await import('jspdf-autotable');
      const autoTable = autoTableModule && (autoTableModule.default || autoTableModule);

      const doc = new jsPDF({ unit: 'pt', format: 'a4' });
      const periods: Array<'last7days' | 'last30days' | 'allTime'> = [];

      if (reportId === 'allPeriods') periods.push('last7days', 'last30days', 'allTime');
      else if (reportId === 'last7days' || reportId === 'last30days' || reportId === 'allTime') periods.push(reportId as any);
      else periods.push(this.activeFilter);

      const nowLabel = new Date().toISOString().replace(/[:.]/g, '-');
      let pageIndex = 0;

      for (const period of periods) {
        if (pageIndex > 0) doc.addPage();

        const { events, bookings } = this.getFilteredDataForPeriod(period);

        const title = period === 'last7days' ? 'Weekly Report (Last 7 Days)'
          : period === 'last30days' ? 'Monthly Report (Last 30 Days)'
          : 'All Time Report';

        doc.setFontSize(14);
        doc.text(`${title} - Organizer: ${this.organizer?.fullName || this.organizer?.organizationName || 'Organizer'}`, 40, 50);
        doc.setFontSize(10);
        doc.text(`Generated: ${new Date().toLocaleString()}`, 40, 66);

        // Summary
        const totalEvents = events.length;
        const totalTickets = bookings.reduce((acc, b) => acc + (b.seats ? b.seats.length : 0), 0);
        const totalRevenue = bookings.reduce((acc, b) => acc + (b.finalPrice || 0), 0);

        let y = 90;
        doc.setFontSize(10);
        doc.text(`Total Events: ${totalEvents}`, 40, y); y += 14;
        doc.text(`Total Tickets Sold: ${totalTickets}`, 40, y); y += 14;
        doc.text(`Total Revenue: $${totalRevenue.toFixed(2)}`, 40, y); y += 20;

        // Event stats
        const eventStatsMap: Record<string, { name: string; sold: number; revenue: number }> = {};
        bookings.forEach(b => {
          if (!eventStatsMap[b.eventId]) eventStatsMap[b.eventId] = { name: b.eventName || 'Unknown', sold: 0, revenue: 0 };
          eventStatsMap[b.eventId].sold += (b.seats ? b.seats.length : 0);
          eventStatsMap[b.eventId].revenue += (b.finalPrice || 0);
        });

        const eventRows = Object.values(eventStatsMap)
          .sort((a, b) => b.sold - a.sold)
          .map(es => [es.name, String(es.sold), `$${es.revenue.toFixed(2)}`]);

        if (eventRows.length > 0 && autoTable) {
          autoTable(doc, {
            startY: y,
            head: [['Event', 'Tickets Sold', 'Revenue ($)']],
            body: eventRows,
            styles: { fontSize: 9 },
            margin: { left: 40, right: 40 }
          });
          y = (doc as any).lastAutoTable ? (doc as any).lastAutoTable.finalY + 10 : y + 100;
        }

        // Ticket sales by type table
        const typeMap: Record<string, { count: number; revenue: number }> = {};
        bookings.forEach(b => {
          if (!b.seats || !Array.isArray(b.seats)) return;
          const pricePerSeat = (b.finalPrice || 0) / (b.seats.length || 1);
          b.seats.forEach(seat => {
            const t = (seat as any).seatType || 'General';
            if (!typeMap[t]) typeMap[t] = { count: 0, revenue: 0 };
            typeMap[t].count += 1;
            typeMap[t].revenue += pricePerSeat;
          });
        });

        const typeRows = Object.keys(typeMap).map(k => [k, String(typeMap[k].count), `$${typeMap[k].revenue.toFixed(2)}`]);
        if (typeRows.length > 0 && autoTable) {
          autoTable(doc, {
            startY: y,
            head: [['Ticket Type', 'Count', 'Revenue ($)']],
            body: typeRows,
            styles: { fontSize: 9 },
            margin: { left: 40, right: 40 }
          });
          y = (doc as any).lastAutoTable ? (doc as any).lastAutoTable.finalY + 10 : y + 100;
        }

        // Promo impact
        const promoMap: Record<string, { uses: number; totalDiscount: number }> = {};
        bookings.forEach(b => {
          if (b.promoCode && b.promoCode.trim() !== '') {
            const c = b.promoCode.trim();
            if (!promoMap[c]) promoMap[c] = { uses: 0, totalDiscount: 0 };
            promoMap[c].uses += 1;
            promoMap[c].totalDiscount += (b.discount || 0);
          }
        });

        const promoRows = Object.keys(promoMap).map(code => [code, String(promoMap[code].uses), `$${promoMap[code].totalDiscount.toFixed(2)}`]);
        if (promoRows.length > 0 && autoTable) {
          autoTable(doc, {
            startY: y,
            head: [['Promo Code', 'Uses', 'Total Discount ($)']],
            body: promoRows,
            styles: { fontSize: 9 },
            margin: { left: 40, right: 40 }
          });
          y = (doc as any).lastAutoTable ? (doc as any).lastAutoTable.finalY + 10 : y + 100;
        }

        pageIndex++;
      }

      const filename = `organizer-report-${this.organizer?.userId || 'unknown'}-${nowLabel}.pdf`;
      doc.save(filename);
    } catch (err) {
      console.error('Organizer export to PDF failed', err);
      const msg = (err && (err as any).message) ? (err as any).message : String(err);
      alert('Failed to export PDF: ' + msg);
    }
  }
}