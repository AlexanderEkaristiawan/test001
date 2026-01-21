import { Component, OnInit, AfterViewInit, OnDestroy, Inject, PLATFORM_ID } from '@angular/core';
import { CommonModule, isPlatformBrowser } from '@angular/common';
import Chart from 'chart.js/auto';
import { RouterLink } from '@angular/router';
import { AuthService } from '../../../services/auth.service';
import { EventService } from '../../../services/event.service';
import { BookingService } from '../../../services/booking.service';
import { Event } from '../../../models/event.model';
import { Booking } from '../../../models/booking.model';
import { User } from '../../../models/user.model';
import { Subscription } from 'rxjs';

interface SummaryData {
  activeEvents: { value: number; footer: string };
  ticketsSold: { value: string; footer: string };
  totalRevenue: { value: string; footer: string };
  avgOccupancy: { value: string; footer: string };
}

@Component({
  selector: 'app-organizer-dashboard',
  standalone: true,
  imports: [CommonModule, RouterLink],
  templateUrl: './organizer-dashboard.html',
  styleUrls: ['./organizer-dashboard.css']
})
export class OrganizerDashboardComponent implements OnInit, AfterViewInit, OnDestroy {
  currentPage = 'dashboard';
  activeFilter: 'last7days' | 'last30days' | 'allTime' = 'last30days';
  
  summaryData: SummaryData | null = null;
  loading = true;
  organizer: User | null = null;
  organizerEvents: Event[] = [];
  organizerBookings: Booking[] = [];

  private salesChart: Chart | undefined;
  private revenueChart: Chart | undefined;
  private occupancyChart: Chart | undefined;
  private subs: Subscription[] = [];

  constructor(
    private authService: AuthService,
    private eventService: EventService,
    private bookingService: BookingService,
    @Inject(PLATFORM_ID) private platformId: Object
  ) {}

  ngOnInit() {
    this.organizer = this.authService.getUser();
    if (this.organizer) {
      this.loadDashboardData();
    } else {
      this.loading = false;
    }
  }

  ngAfterViewInit() {
    if (isPlatformBrowser(this.platformId)) {
      this.createCharts();
      this.updateCharts();
    }
  }

  ngOnDestroy() {
    this.subs.forEach(sub => sub.unsubscribe());
  }

  loadDashboardData() {
    this.loading = true;
    if (!this.organizer) return;

    const eventsSub = this.eventService.events$.subscribe(allEvents => {
      this.organizerEvents = allEvents.filter(e => e.organizerId === this.organizer?.userId);
      
      const bookingsSub = this.bookingService.bookings$.subscribe(allBookings => {
        const organizerEventIds = this.organizerEvents.map(e => e.eventId);
        this.organizerBookings = allBookings.filter(b => organizerEventIds.includes(b.eventId) && b.status !== 'cancelled');
        
        this.updateDashboardData();
        this.loading = false;
      });
      this.subs.push(bookingsSub);
    });
    this.subs.push(eventsSub);
  }

  setFilter(filter: 'last7days' | 'last30days' | 'allTime') {
    this.activeFilter = filter;
    this.updateDashboardData();
  }

  updateDashboardData() {
    this.calculateSummary();
    this.updateCharts();
  }

  calculateSummary() {
    const now = new Date();
    const activeEvents = this.organizerEvents.filter(e => e.status === 'upcoming' || e.status === 'ongoing').length;
    
    let ticketsSold = 0;
    let totalRevenue = 0;

    this.organizerBookings.forEach(booking => {
      ticketsSold += booking.seats.length;
      totalRevenue += booking.finalPrice;
    });

    const totalCapacity = this.organizerEvents.reduce((acc, event) => acc + (event.sections ? this.getCapacityFromLayout(event.sections) : 0), 0);
    const avgOccupancy = totalCapacity > 0 ? (ticketsSold / totalCapacity) * 100 : 0;

    this.summaryData = {
      activeEvents: { value: activeEvents, footer: 'Total active events' },
      ticketsSold: { value: ticketsSold.toLocaleString(), footer: 'Total tickets sold' },
      totalRevenue: { value: `$${totalRevenue.toLocaleString()}`, footer: 'Total revenue generated' },
      avgOccupancy: { value: `${avgOccupancy.toFixed(0)}%`, footer: 'Overall average' }
    };
  }

  getCapacityFromLayout(sections: any[]): number {
    if (!sections) {
      return 0;
    }
    let capacity = 0;
    for (const section of sections) {
      for (const row of section.seatRows) {
        capacity += row.length;
      }
    }
    return capacity;
  }
  
  createCharts() {
    this.createSalesChart([], []);
    this.createRevenueChart([], []);
    this.createOccupancyChart([], []);
  }

  updateCharts() {
    const now = new Date();
    let filteredBookings: Booking[] = [];

    if (this.activeFilter === 'last7days') {
      const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      filteredBookings = this.organizerBookings.filter(b => {
        const d = new Date(b.createdAt);
        return d >= sevenDaysAgo && d <= now;
      });
    } else if (this.activeFilter === 'last30days') {
      const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      filteredBookings = this.organizerBookings.filter(b => {
        const d = new Date(b.createdAt);
        return d >= thirtyDaysAgo && d <= now;
      });
    } else {
      filteredBookings = this.organizerBookings;
    }

    // Sales data
    const salesData = this.generateChartData(filteredBookings, 'day', 'tickets');
    if (this.salesChart) {
      this.salesChart.data.labels = salesData.labels;
      this.salesChart.data.datasets[0].data = salesData.data;
      this.salesChart.update();
    }

    // Revenue data
    const revenueData = this.generateChartData(filteredBookings, 'day', 'revenue');
    if (this.revenueChart) {
      this.revenueChart.data.labels = revenueData.labels;
      this.revenueChart.data.datasets[0].data = revenueData.data;
      this.revenueChart.update();
    }

    // Occupancy data
    const occupancyData = this.generateOccupancyData();
    if (this.occupancyChart) {
      this.occupancyChart.data.labels = occupancyData.labels;
      this.occupancyChart.data.datasets[0].data = occupancyData.data;
      this.occupancyChart.update();
    }
  }

  generateChartData(bookings: Booking[], groupBy: 'day' | 'week' | 'month', dataType: 'tickets' | 'revenue'): { labels: string[], data: number[] } {
    const dataMap = new Map<string, number>();
    const labels: string[] = [];

    // Sort bookings chronologically to ensure chart renders left-to-right correctly
    const sortedBookings = [...bookings].sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());

    sortedBookings.forEach(booking => {
      const date = new Date(booking.createdAt);
      let key = '';
      if (groupBy === 'day') {
        key = date.toLocaleDateString();
      } else if (groupBy === 'week') {
        const week = Math.ceil(date.getDate() / 7);
        key = `Week ${week}`;
      } else {
        key = date.toLocaleString('default', { month: 'long' });
      }

      if (!dataMap.has(key)) {
        dataMap.set(key, 0);
      }

      const value = dataType === 'tickets' ? booking.seats.length : booking.finalPrice;
      dataMap.set(key, dataMap.get(key)! + value);
    });

    dataMap.forEach((value, key) => {
      labels.push(key);
    });

    return { labels, data: Array.from(dataMap.values()) };
  }

  generateOccupancyData(): { labels: string[], data: number[] } {
    const labels: string[] = [];
    const data: number[] = [];

    this.organizerEvents.forEach(event => {
      const capacity = this.getCapacityFromLayout(event.sections);
      if (capacity > 0) {
        const bookingsForEvent = this.organizerBookings.filter(b => b.eventId === event.eventId);
        const ticketsSold = bookingsForEvent.reduce((acc, b) => acc + b.seats.length, 0);
        const occupancy = (ticketsSold / capacity) * 100;
        labels.push(event.title);
        data.push(occupancy);
      }
    });

    return { labels, data };
  }

  createSalesChart(labels: string[], data: number[]) {
    const canvas = document.getElementById('sales-chart') as HTMLCanvasElement;
    if (canvas) {
      this.salesChart = new Chart(canvas, {
        type: 'line',
        data: {
          labels: labels,
          datasets: [{
            label: 'Tickets Sold',
            data: data,
            borderColor: 'rgba(239, 83, 80, 1)',
            backgroundColor: 'rgba(239, 83, 80, 0.2)',
            fill: true,
            tension: 0.4
          }]
        }
      });
    }
  }

  createRevenueChart(labels: string[], data: number[]) {
    const canvas = document.getElementById('revenue-chart') as HTMLCanvasElement;
    if (canvas) {
      this.revenueChart = new Chart(canvas, {
        type: 'bar',
        data: {
          labels: labels,
          datasets: [{
            label: 'Total Revenue',
            data: data,
            backgroundColor: 'rgba(239, 83, 80, 0.8)',
            borderColor: 'rgba(239, 83, 80, 1)',
            borderWidth: 1
          }]
        }
      });
    }
  }
  
  createOccupancyChart(labels: string[], data: number[]) {
    const canvas = document.getElementById('occupancy-chart') as HTMLCanvasElement;
    if (canvas) {
      this.occupancyChart = new Chart(canvas, {
        type: 'doughnut',
        data: {
          labels: labels,
          datasets: [{
            label: 'Avg. Occupancy',
            data: data,
            backgroundColor: [
              'rgba(239, 83, 80, 0.8)',
              'rgba(255, 205, 210, 0.8)',
              'rgba(229, 115, 115, 0.8)',
              'rgba(239, 154, 154, 0.8)'
            ],
          }]
        }
      });
    }
  }

  showPage(page: string) {
    this.currentPage = page;
  }

  onEventSubmit() {
    alert('Event created successfully!');
    this.showPage('dashboard');
  }
}
