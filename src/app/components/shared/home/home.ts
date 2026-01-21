import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { combineLatest, Subscription } from 'rxjs';
import { map } from 'rxjs/operators';

import { EventCards } from '../../layout/event-cards/event-cards';
import { EventService } from '../../../services/event.service';
import { BookingService } from '../../../services/booking.service';
import { Event } from '../../../models/event.model';

@Component({
  selector: 'app-home',
  standalone: true,
  imports: [CommonModule, RouterLink, EventCards],
  templateUrl: './home.html',
  styleUrls: ['./home.css']
})
export class HomeComponent implements OnInit, OnDestroy {
  featuredEvents: Event[] = [];
  loading = true;
  private subs: Subscription | undefined;

  constructor(
    private eventService: EventService,
    private bookingService: BookingService
  ) {}

  ngOnInit(): void {
    this.subs = combineLatest([
      this.eventService.events$,
      this.bookingService.bookings$
    ]).pipe(
      map(([events, bookings]) => {
        const availableEvents = events.filter(
          event => event.status === 'upcoming' || event.status === 'ongoing'
        );

        const eventBookingCounts = availableEvents.map(event => {
          const count = bookings
            .filter(booking => booking.eventId === event.eventId)
            .reduce((acc, booking) => acc + booking.seats.length, 0);
          return { ...event, bookingCount: count };
        });

        eventBookingCounts.sort((a, b) => b.bookingCount - a.bookingCount);

        return eventBookingCounts.slice(0, 3);
      })
    ).subscribe(events => {
      this.featuredEvents = events;
      this.loading = false;
    });
  }

  ngOnDestroy(): void {
    this.subs?.unsubscribe();
  }
}