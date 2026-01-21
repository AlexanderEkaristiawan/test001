import { Component, OnInit, AfterViewInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { AuthService } from '../../../services/auth.service';
import { EventService } from '../../../services/event.service';
import { BookingService } from '../../../services/booking.service';
import { UsersService, toUser } from '../../../services/users.service';
import { Event } from '../../../models/event.model';
import { Booking } from '../../../models/booking.model';
import { User } from '../../../models/user.model';
import Chart from 'chart.js/auto';
import { Subscription } from 'rxjs';

interface DashboardStats {
  totalEvents: number;
  activeOrganizers: number;
  ticketsSold: number;
  revenue: number;
}

interface BestPerformingEvent {
  eventName: string;
  ticketsSold: number;
}

interface SalesData {
  month: string;
  revenue: number;
}

interface OccupancyData {
  eventName: string;
  soldSeats: number;
}

@Component({
  selector: 'app-admin-dashboard',
  templateUrl: './admin-home.html',
  styleUrl: './admin-home.css',
  standalone: true,
  imports: [CommonModule, RouterLink],
})
export class AdminHomeComponent implements OnInit, AfterViewInit, OnDestroy {
  dashboardStats?: DashboardStats;
  bestPerformingEvents?: BestPerformingEvent;
  salesOverview: SalesData[] = [];
  occupancyRates: OccupancyData[] = [];
  selectedPeriod: string = '7d';
  loading = true;
  
  private allEvents: Event[] = [];
  private allBookings: Booking[] = [];
  private allUsers: User[] = [];

  private salesChart: Chart | undefined;
  private occupancyChart: Chart | undefined;
  private subs: Subscription[] = [];
  private viewInitialized = false;

  constructor(
    public auth: AuthService,
    private eventService: EventService,
    private bookingService: BookingService,
    private usersService: UsersService,
  ) {}

  ngOnInit(): void {
    this.loadData();
  }

  ngAfterViewInit(): void {
    this.viewInitialized = true;
    this.renderCharts();
  }

  ngOnDestroy(): void {
    this.subs.forEach(sub => sub.unsubscribe());
    this.destroyCharts();
  }

  loadData(): void {
    this.loading = true;
    try {
      // Load current snapshots of events, bookings, and users synchronously
      this.allEvents = this.eventService.getAllEvents();
      this.allBookings = this.bookingService.getAll();
      // Safely map stored users to domain users, ignoring any invalid records
      this.allUsers = this.usersService
        .getAll()
        .map(u => {
          try {
            return toUser(u);
          } catch {
            return null;
          }
        })
        .filter((u): u is User => u !== null);

      this.setPeriod('7d');
    } finally {
      this.loading = false;
    }
  }

  setPeriod(period: '7d' | '30d' | '90d'): void {
    this.selectedPeriod = period;
    this.updateDashboard();
    if (this.viewInitialized) {
      this.renderCharts();
    }
  }

  updateDashboard(): void {
    const now = new Date();
    let filteredBookings: Booking[] = [];
    let days = 7;
    if (this.selectedPeriod === '30d') days = 30;
    if (this.selectedPeriod === '90d') days = 90;

    const fromDate = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
    
    if (this.selectedPeriod !== 'allTime') {
      filteredBookings = this.allBookings.filter(b => {
        const bookingDate = new Date(b.createdAt);
        return bookingDate >= fromDate && bookingDate <= now && b.status !== 'cancelled';
      });
    } else {
      filteredBookings = this.allBookings.filter(b => b.status !== 'cancelled');
    }
    
    this.calculateStats(filteredBookings);
  }

  calculateStats(filteredBookings: Booking[]): void {
    const totalEvents = this.allEvents.length;
    const activeOrganizers = this.allUsers.filter(u => u.role === 'organizer' && u.isActive).length;
    const ticketsSold = filteredBookings.reduce((acc, b) => acc + b.seats.length, 0);
    const revenue = filteredBookings.reduce((acc, b) => acc + b.finalPrice, 0);

    this.dashboardStats = { totalEvents, activeOrganizers, ticketsSold, revenue };

    const eventSales = new Map<string, number>();
    filteredBookings.forEach(b => {
      const eventName = this.allEvents.find(e => e.eventId === b.eventId)?.title || 'Unknown Event';
      eventSales.set(eventName, (eventSales.get(eventName) || 0) + b.seats.length);
    });
    
    const sortedEvents = [...eventSales.entries()].sort((a, b) => b[1] - a[1]);
    this.bestPerformingEvents = sortedEvents.length > 0 ? { eventName: sortedEvents[0][0], ticketsSold: sortedEvents[0][1] } : { eventName: 'N/A', ticketsSold: 0 };

    this.salesOverview = this.groupSalesByPeriod(filteredBookings);
    this.occupancyRates = this.calculateOccupancy(filteredBookings);
  }
  
  groupSalesByPeriod(bookings: Booking[]): SalesData[] {
    const salesMap = new Map<string, number>();
    bookings.forEach(b => {
      const date = new Date(b.createdAt);
      // Use ISO date string (YYYY-MM-DD) as key to ensure correct sorting and uniqueness across months
      const key = date.toISOString().split('T')[0];
      salesMap.set(key, (salesMap.get(key) || 0) + b.finalPrice);
    });
    
    return [...salesMap.entries()]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([dateStr, revenue]) => ({
        month: new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
        revenue
      }));
  }

  calculateOccupancy(bookings: Booking[]): OccupancyData[] {
    const occupancyMap = new Map<string, number>();
    this.allEvents.forEach(e => {
      const sold = bookings.filter(b => b.eventId === e.eventId).reduce((acc, b) => acc + b.seats.length, 0);
      if (sold > 0) occupancyMap.set(e.title, sold);
    });
    return [...occupancyMap.entries()].map(([eventName, soldSeats]) => ({ eventName, soldSeats }));
  }

  get currentUser() {
    return this.auth.getUser();
  }

  private destroyCharts(): void {
    if (this.salesChart) {
      this.salesChart.destroy();
      this.salesChart = undefined;
    }
    if (this.occupancyChart) {
      this.occupancyChart.destroy();
      this.occupancyChart = undefined;
    }
  }

  renderCharts(): void {
    this.destroyCharts();
    
    if (this.salesOverview && this.salesOverview.length > 0) {
      const salesLabels = this.salesOverview.map(item => item.month);
      const salesData = this.salesOverview.map(item => item.revenue);

      this.salesChart = new Chart('salesOverviewChart', {
        type: 'line',
        data: {
          labels: salesLabels,
          datasets: [{
            label: 'Revenue',
            data: salesData,
            borderColor: '#b70122',
            backgroundColor: 'rgba(183, 1, 34, 0.1)',
            fill: true,
          }],
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
        },
      });
    }

    if (this.occupancyRates && this.occupancyRates.length > 0) {
      const occupancyLabels = this.occupancyRates.map(event => event.eventName);
      const occupancyData = this.occupancyRates.map(event => event.soldSeats);

      this.occupancyChart = new Chart('occupancyRatesChart', {
        type: 'doughnut',
        data: {
          labels: occupancyLabels,
          datasets: [{
            label: 'Tickets Sold',
            data: occupancyData,
            backgroundColor: ['#b70122', '#2c3e50', '#2ecc71', '#f39c12', '#e74c3c', '#3498db'],
          }],
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
        },
      });
    }
  }
}
