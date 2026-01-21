// services/organizer-report.service.ts
import { Injectable } from '@angular/core';
import { Observable, forkJoin, map, switchMap } from 'rxjs';
import { AuthService } from './auth.service';
import { EventService } from './event.service';
import { BookingService } from './booking.service';
import { WaitlistService } from './waitlist.service';
import { Event } from '../models/event.model';
import { AnalyticsSummary } from '../models/analytics-summary.model';
import { ChartData } from '../models/chart-data.model';
import { User } from '../models/user.model';
import { Booking } from '../models/booking.model';



export interface OrganizerDashboardData {
  organizer: User;
  totalEvents: number;
  ticketsSold: number;
  totalRevenue: number;
  waitlistRequests: number;
  upcomingEvents: Event[];
  analyticsSummary: AnalyticsSummary | null;
  chartData: ChartData | null;
}

@Injectable({
  providedIn: 'root'
})
export class OrganizerReportService {

  constructor(
    private authService: AuthService,
    private eventService: EventService,
    private bookingService: BookingService,
    private waitlistService: WaitlistService
  ) {}

  getDashboardData(): Observable<OrganizerDashboardData | null> {
    return this.authService.currentUser$.pipe(
      switchMap(user => {
        if (user && user.role === 'organizer') {
          return this.eventService.events$.pipe(
            map(events => events.filter(e => e.organizerId === user.userId)),
            switchMap(organizerEvents => {
              const totalEvents = organizerEvents.length;
              const upcomingEvents = organizerEvents.filter(e => e.status === 'upcoming');
              const eventIds = organizerEvents.map(e => e.eventId);

              return forkJoin({
                bookings: this.bookingService.bookings$,
                waitlist: this.waitlistService.waitlist$
              }).pipe(
                map(({ bookings, waitlist }) => {
                  const orgBookings = bookings.filter(b => eventIds.includes(b.eventId));
                  const orgWaitlist = waitlist.filter(w => eventIds.includes(w.eventId));
                  
                  const ticketsSold = orgBookings.reduce((acc, b) => acc + b.seats.length, 0);
                  const totalRevenue = orgBookings.reduce((acc, b) => acc + b.finalPrice, 0);
                  const waitlistRequests = orgWaitlist.length;
                  
                  // Generate both analytics summary and chart data
                  const analyticsSummary = this.generateAnalyticsSummary(organizerEvents, orgBookings);
                  const chartData = this.generateChartData(orgBookings);

                  return {
                    organizer: user,
                    totalEvents,
                    ticketsSold,
                    totalRevenue,
                    waitlistRequests,
                    upcomingEvents,
                    analyticsSummary,
                    chartData
                  };
                })
              );
            })
          );
        }
        return new Observable<null>(observer => observer.next(null));
      })
    );
  }

  generateAnalyticsSummary(events: Event[], bookings: Booking[]): AnalyticsSummary | null {
    if (!events.length || !bookings.length) return null;

    // Calculate overall for all organizer's events
    const totalTicketsSold = bookings.reduce((acc, b) => acc + b.seats.length, 0);
    const totalRevenue = bookings.reduce((acc, b) => acc + b.finalPrice, 0);
    
    // Calculate occupancy rate based on tickets sold 
    
    const totalTicketsAvailable = events.reduce((acc, e) => {
      // If tickets teft exists and is a number, use it. Otherwise assume some default.
      const ticketsLeft = typeof e.ticketsLeft === 'number' ? e.ticketsLeft : 0;
      const eventBookings = bookings.filter(b => b.eventId === e.eventId);
      const eventTicketsSold = eventBookings.reduce((sum, b) => sum + b.seats.length, 0);
      return acc + eventTicketsSold + ticketsLeft;
    }, 0);

    const occupancyRate = totalTicketsAvailable > 0 ? (totalTicketsSold / totalTicketsAvailable) * 100 : 0;

    // Find date range from events
    const eventDates = events.map(e => new Date(e.date)).filter(date => !isNaN(date.getTime()));
    const startDate = eventDates.length > 0 ? new Date(Math.min(...eventDates.map(d => d.getTime()))) : new Date();
    const endDate = eventDates.length > 0 ? new Date(Math.max(...eventDates.map(d => d.getTime()))) : new Date();

    return {
      eventId: 'all', // Represents all organizer events
      totalTicketsSold,
      totalRevenue,
      occupancyRate,
      dateRange: { start: startDate, end: endDate }
    };
  }

  

  generateChartData(bookings: Booking[]): ChartData | null {
    if (!bookings.length) return null;

    const labels: string[] = [];
    const salesData: number[] = [];
    const revenueData: number[] = [];
    const monthlyData: { [key: string]: { sales: number; revenue: number } } = {};

    bookings.forEach(booking => {
      const month = new Date(booking.createdAt).toLocaleString('default', { month: 'long' });
      if (!monthlyData[month]) {
        monthlyData[month] = { sales: 0, revenue: 0 };
        if (!labels.includes(month)) {
          labels.push(month);
        }
      }
      monthlyData[month].sales += booking.seats.length;
      monthlyData[month].revenue += booking.finalPrice;
    });

    // Sort labels chronologically
    const monthOrder = ['January', 'February', 'March', 'April', 'May', 'June', 
                       'July', 'August', 'September', 'October', 'November', 'December'];
    labels.sort((a, b) => monthOrder.indexOf(a) - monthOrder.indexOf(b));

    // Build data arrays in the correct order
    labels.forEach(label => {
      salesData.push(monthlyData[label].sales);
      revenueData.push(monthlyData[label].revenue);
    });

    return {
      labels,
      datasets: [
        {
          label: 'Ticket Sales',
          data: salesData,
          fill: false,
          borderColor: '#4361ee',
          tension: 0.1
        },
        {
          label: 'Revenue',
          data: revenueData,
          fill: false,
          borderColor: '#fca311',
          tension: 0.1
        }
      ]
    };
  }

  getOrganizerEvents(organizerId: string): Observable<Event[]> {
    return this.eventService.events$.pipe(
      map(events => events.filter(e => e.organizerId === organizerId))
    );
  }

  getOrganizerBookings(organizerId: string): Observable<Booking[]> {
    return this.getOrganizerEvents(organizerId).pipe(
      switchMap(events => {
        const eventIds = events.map(e => e.eventId);
        return this.bookingService.bookings$.pipe(
          map(bookings => bookings.filter(b => eventIds.includes(b.eventId)))
        );
      })
    );
  }

  getOrganizerWaitlist(organizerId: string): Observable<any[]> {
    return this.getOrganizerEvents(organizerId).pipe(
      switchMap(events => {
        const eventIds = events.map(e => e.eventId);
        return this.waitlistService.waitlist$.pipe(
          map(waitlist => waitlist.filter(w => eventIds.includes(w.eventId)))
        );
      })
    );
  }
}