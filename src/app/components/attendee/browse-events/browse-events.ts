import { EventCards } from '../../layout/event-cards/event-cards';
import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { EventService } from '../../../services/event.service';
import { Event } from '../../../models/event.model';
import { WaitlistService } from '../../../services/waitlist.service';
import { Waitlist } from '../../../models/waitlist.model';
import { AuthService } from '../../../services/auth.service';
import { Subscription } from 'rxjs';

@Component({
  selector: 'app-browse-events',
  standalone: true,
  imports: [CommonModule, EventCards],
  templateUrl: './browse-events.html',
  styleUrls: ['./browse-events.css']
})
export class BrowseEventsComponent implements OnInit, OnDestroy {
  // full list from service
  private allEvents: Event[] = [];
  // displayed list bound to template
  events: Event[] = [];
  userWaitlists: Waitlist[] = [];
  loading = true;
  private eventsSub: Subscription | undefined;
  private waitlistSub: Subscription | undefined;
  // UI state
  filterTime: 'all' | 'upcoming' | 'ongoing' = 'all';
  sortOrder: 'recent' | 'oldest' = 'recent';
  searchQuery = '';

  constructor(
    private eventsService: EventService,
    private router: Router,
    private waitlistService: WaitlistService,
    private authService: AuthService
  ) {}

  ngOnInit(): void {
    this.loading = true;
    
    // Subscribe to events observable for live updates
    this.eventsSub = this.eventsService.events$.subscribe(allEvents => {
      this.allEvents = allEvents;
      this.applyFilters();
      this.loading = false;
    });

    const user = this.authService.getUser();
    if (user) {
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

    const now = new Date();
    // Search by title
    if (this.searchQuery && this.searchQuery.trim().length > 0) {
      const term = this.searchQuery.toLowerCase();
      list = list.filter(e => e.title.toLowerCase().includes(term));
    }

    // Sort by date
    list.sort((a, b) => {
      const ta = new Date(a.date).getTime();
      const tb = new Date(b.date).getTime();
      return this.sortOrder === 'recent' ? tb - ta : ta - tb;
    });

    this.events = list;
  }
}
