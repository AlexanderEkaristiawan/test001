import { Component } from '@angular/core';
import { RouterLink, Routes } from '@angular/router';
import { EventCards } from '../../layout/event-cards/event-cards';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { EventService } from '../../../services/event.service';
import { Event } from '../../../models/event.model';
import { WaitlistService } from '../../../services/waitlist.service';
import { Waitlist } from '../../../models/waitlist.model';
import { AuthService } from '../../../services/auth.service';
import { Subscription } from 'rxjs';

@Component({
  selector: 'app-organizer-manage-events',
  imports: [CommonModule, EventCards, RouterLink],
  templateUrl: './view-events.html',
  styleUrl: './view-events.css',
})
export class ViewEventsComponent {
  // full list from service
  private allEvents: Event[] = [];
  // displayed list (template binds to this)
  events: Event[] = [];

  userWaitlists: Waitlist[] = [];
  private waitlistSub: Subscription | undefined;
  private eventsSub: Subscription | undefined;
  userRole: 'admin' | 'organizer' | 'attendee' | undefined;
  private userId: string | undefined;

  // UI filters
  filterTime: 'all' | 'upcoming' | 'ongoing' | 'past' = 'all';
  sortOrder: 'recent' | 'oldest' = 'recent';
  searchQuery = '';

  constructor(
    private eventsService: EventService,
    private router: Router,
    private waitlistService: WaitlistService,
    private authService: AuthService
    ) {
    this.eventsSub = this.eventsService.events$.subscribe(list => {
      this.allEvents = list;
      this.applyFilters();
    });
  }

  ngOnInit(): void {
    const user = this.authService.getUser();
    if (user) {
      this.userRole = user.role;
      this.userId = user.userId;
      this.waitlistSub = this.waitlistService.getWaitlistForUser(user).subscribe(waitlists => {
        this.userWaitlists = waitlists;
      });
    }
  }

  ngOnDestroy(): void {
    this.waitlistSub?.unsubscribe();
    this.eventsSub?.unsubscribe();
  }

  book(event: Event) {
    // set selected event in service, then navigate
    this.eventsService.setSelectedEvent(event);
    this.router.navigateByUrl('/select-seats');
  }

  async joinWaitlist(event: Event) {
    const user = this.authService.getUser();
    if (!user) {
      alert('Please log in to join the waitlist.');
      this.router.navigateByUrl('/login');
      return;
    }

    const result = await this.waitlistService.joinWaitlist(event.eventId, user);
    if (result) {
      alert(`You have been added to the waitlist for ${event.title}!`);
    } else {
      alert(`You are already on the waitlist for ${event.title} or an error occurred.`);
    }
  }

  isOnWaitlist(event: Event): boolean {
    if (!this.userWaitlists) return false;
    return this.userWaitlists.some(w => w.eventId === event.eventId);
  }

  viewDetails(event: Event) {
    this.eventsService.setSelectedEvent(event);
    this.router.navigateByUrl('/view-event/details');
  }

  onSearch(query: string) {
    this.searchQuery = query || '';
    this.applyFilters();
  }

  onTimeFilter(value: string) {
    this.filterTime = (value as any) || 'all';
    this.applyFilters();
  }

  onSortChange(value: string) {
    this.sortOrder = (value as any) || 'recent';
    this.applyFilters();
  }

  private applyFilters() {
    let list = [...this.allEvents];

    // Role-based filtering: organizers only see their own events
    if (this.userRole === 'organizer' && this.userId) {
      list = list.filter(e => e.organizerId === this.userId);
    }

    // Time filter
    const now = new Date();
    if (this.filterTime === 'upcoming') {
      list = list.filter(e => (e.status === 'upcoming') || (new Date(e.date) > now));
    } else if (this.filterTime === 'ongoing') {
      list = list.filter(e => e.status === 'ongoing');
    } else if (this.filterTime === 'past') {
      list = list.filter(e => (e.status === 'past' || e.status === 'completed' || new Date(e.date) < now));
    }

    // Search by event title (name)
    if (this.searchQuery && this.searchQuery.trim().length > 0) {
      const term = this.searchQuery.toLowerCase();
      list = list.filter(e => e.title.toLowerCase().includes(term));
    }

    // Sort by date: recent => newest first
    list.sort((a, b) => {
      const ta = new Date(a.date).getTime();
      const tb = new Date(b.date).getTime();
      return this.sortOrder === 'recent' ? tb - ta : ta - tb;
    });

    this.events = list;
  }
}
