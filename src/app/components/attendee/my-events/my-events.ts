// components/attendee/my-events/my-events.ts
import { Component, OnInit, OnDestroy, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { AuthService } from '../../../services/auth.service';
import { BookingService } from '../../../services/booking.service';
import { EventService } from '../../../services/event.service';
import { WaitlistService } from '../../../services/waitlist.service';
import { Observable, combineLatest, Subscription, BehaviorSubject } from 'rxjs';
import { map } from 'rxjs/operators';
import { Event } from '../../../models/event.model';
import { Waitlist } from '../../../models/waitlist.model';
import { User } from '../../../models/user.model';
import { Booking } from '../../../models/booking.model';
import { Seat } from '../../../models/seat.model';

interface BookingWithEvent extends Booking {
  event: Event | undefined;
}

interface WaitlistWithEvent extends Waitlist {
  event: Event | undefined;
}

@Component({
  selector: 'app-my-events',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './my-events.html',
  styleUrls: ['./my-events.css'],
})
export class MyEventsComponent implements OnInit, OnDestroy {
  activeView: 'upcoming' | 'history' | 'waitlist' = 'upcoming';

  private upcomingBookingsSubject = new BehaviorSubject<BookingWithEvent[]>([]);
  upcomingBookings$: Observable<BookingWithEvent[]> = this.upcomingBookingsSubject.asObservable();

  private pastBookingsSubject = new BehaviorSubject<BookingWithEvent[]>([]);
  pastBookings$: Observable<BookingWithEvent[]> = this.pastBookingsSubject.asObservable();

  private userWaitlistsSubject = new BehaviorSubject<WaitlistWithEvent[]>([]);
  userWaitlists$: Observable<WaitlistWithEvent[]> = this.userWaitlistsSubject.asObservable();
  loading = true;

  private subscriptions: Subscription = new Subscription();
  // Modal state for showing QR code / booking details
  selectedBooking: BookingWithEvent | null = null;
  showModal = false;

  constructor(
    private authService: AuthService,
    private bookingService: BookingService,
    private eventService: EventService,
    private waitlistService: WaitlistService,
    private router: Router,
    private cdr: ChangeDetectorRef
  ) {}

  ngOnInit(): void {
    // Wait for auth state to be available from AuthService (handles SSR/hydration timing)
    const authSub = this.authService.currentUser$.subscribe(user => {
      if (!user) { return; }

      // user exists -> load events
      this.loadUserEvents();
    });

    this.subscriptions.add(authSub);
  }

  showQr(booking: BookingWithEvent): void {
    this.selectedBooking = booking;
    this.showModal = true;
  }

  closeModal(): void {
    this.showModal = false;
    this.selectedBooking = null;
  }

  getQrCodeUrl(booking?: BookingWithEvent | null): string {
    const id = booking?.id || '';
    return `https://api.qrserver.com/v1/create-qr-code/?size=250x250&data=${encodeURIComponent(id)}`;
  }

  ngOnDestroy(): void {
    this.subscriptions.unsubscribe();
  }

  private async loadUserEvents(): Promise<void> {
    const currentUser: User | null = this.authService.getUser();

    if (!currentUser) {
      // defensive: if still no user, bail out (auth subscription should have handled redir)
      this.loading = false;
      return;
    }

    // Ensure both bookings and events are refreshed before we set up the combined subscription
    try {
      await Promise.all([
        this.eventService.refreshFromBackend(),
        // BookingService now exposes refreshFromBackend()
        this.bookingService.refreshFromBackend()
      ]);

      // Combine bookings and events observables for reactive updates
      const eventsData$ = combineLatest([
        this.bookingService.bookings$,
        this.eventService.events$
      ]);

      const dataSubscription = eventsData$.pipe(
        map(([bookings, events]) => {
          // Filter and combine user's bookings with events
          const userBookings: BookingWithEvent[] = bookings
            .filter(b => b.userId === currentUser.userId)
            .map(booking => ({
              ...booking,
              event: events.find(e => e.eventId === booking.eventId)
            }));

          return { userBookings };
        })
      ).subscribe({
        next: ({ userBookings }) => {
          console.debug('[MyEvents] combined emit', {
            userId: currentUser.userId,
            bookingsCount: userBookings.length,
            eventsCount: this.eventService.getAllEvents().length
          });
          this.loading = false;

          const now = new Date();

          // Upcoming: bookings that are paid, not cancelled, and event date is in the future
          this.upcomingBookingsSubject.next(
            userBookings.filter(b => 
              b.event &&
              b.status === 'paid' &&
              b.event.status !== 'cancelled' &&
              new Date(b.event.date).getTime() > now.getTime()
            )
          );

          // History: events that have passed or are completed/cancelled OR booking was cancelled
          this.pastBookingsSubject.next(
            userBookings.filter(b => 
              b.event && (
                new Date(b.event.date).getTime() <= now.getTime() ||
                ['completed', 'cancelled', 'past'].includes(b.event.status) ||
                b.status === 'cancelled'
              )
            )
          );

          // Ensure Angular runs change detection so the async pipes update immediately
          try { this.cdr.detectChanges(); } catch {}
        },
        error: (error) => {
          console.error('Error loading user events:', error);
          this.loading = false;
        }
      });

      this.subscriptions.add(dataSubscription);
    } catch (err) {
      console.error('Failed to refresh data before loading events:', err);
      this.loading = false;
    }

    // Load waitlists (if waitlist service has proper observable)
    try {
      const waitlistData$ = this.waitlistService.getWaitlistForUser(currentUser);
      const waitlistSubscription = waitlistData$.pipe(
        map((waitlists: Waitlist[]) => {
          const events = this.eventService.getAllEvents();
          const userWaitlists: WaitlistWithEvent[] = waitlists.map(waitlist => ({
            ...waitlist,
            event: events.find(e => e.eventId === waitlist.eventId)
          }));
          return userWaitlists;
        })
      ).subscribe({
        next: (userWaitlists) => {
          this.userWaitlistsSubject.next(userWaitlists);
        },
        error: (error) => {
          console.error('Error loading waitlists:', error);
          this.userWaitlistsSubject.next([]);
        }
      });
      
        this.subscriptions.add(waitlistSubscription);
    } catch (error) {
      console.warn('Waitlist service not properly implemented:', error);
      this.userWaitlistsSubject.next([]);
    }

  }

  setView(view: 'upcoming' | 'history' | 'waitlist'): void {
    this.activeView = view;
  }

  exitWaitlist(waitlistId: string): void {
    if (confirm('Are you sure you want to exit this waitlist?')) {
      try {
        this.waitlistService.removeFromWaitlist(waitlistId);
      } catch (error) {
        console.error('Error exiting waitlist:', error);
        alert('Failed to exit waitlist. Please try again.');
      }
    }
  }

  // Helper method to check if data is loading
  isLoading(): boolean {
    return this.loading;
  }


// In MyEventsComponent class
getSeatDisplayText(seat: Seat ): number | string {
  if (!seat) return 'N/A';
  
  // Try to get seat information
  const seatNumber = seat.number || 'N/A';
  const section = seat.section || '';
  const row = seat.row || '';
  
  let display = seatNumber;
  if (section) display += ` (${section})`;
  if (row) display += ` Row ${row}`;
  
  return display;
}

  getWaitlistId(item: Waitlist): string {
    return item.waitlistId || '';
  }

  canCancelBooking(booking: BookingWithEvent): boolean {
    if (!booking.event || booking.status !== 'paid') return false;
    const eventDate = new Date(booking.event.date);
    const now = new Date();
    const daysUntilEvent = Math.floor((eventDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
    return daysUntilEvent >= 7; // Can cancel if 7+ days before event
  }

  cancelBooking(booking: BookingWithEvent): void {
    if (!this.canCancelBooking(booking)) {
      alert('Bookings can only be cancelled at least 7 days before the event date.');
      return;
    }

    if (!confirm(`Are you sure you want to cancel your booking for "${booking.eventName}"? This action cannot be undone.`)) {
      return;
    }

    try {
      // Free up the seats
      if (booking.event) {
        this.eventService.freeSeats(booking.eventId, booking.seats);
      }
      
      // Cancel the booking
      this.bookingService.cancelBooking(booking.id);
      
      // Reload user events to reflect the cancellation
      this.loadUserEvents();
      
      alert('Booking cancelled successfully. Seats have been freed up.');
    } catch (error) {
      console.error('Error cancelling booking:', error);
      alert('Failed to cancel booking. Please try again.');
    }
  }
}
