// services/event.service.ts
import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Event } from '../models/event.model';
import { Promotion } from '../models/promo-code.model';
import { BehaviorSubject, Observable, firstValueFrom } from 'rxjs';
import { GenerateSeatsService } from './generate-seats.service';
import { Seat } from '../models/seat.model';

const API_BASE_URL = 'http://localhost:5000/api';

@Injectable({
  providedIn: 'root'
})
export class EventService {
  private events: Event[] = [];

  // Add these properties FIRST
  private eventsSubject = new BehaviorSubject<Event[]>([]);
  private selectedEventSubject = new BehaviorSubject<Event | null>(null);

  // Add these getters
  get events$(): Observable<Event[]> {
    return this.eventsSubject.asObservable();
  }

  get selectedEvent$(): Observable<Event | null> {
    return this.selectedEventSubject.asObservable();
  }

  constructor(
    private generateSeatsService: GenerateSeatsService,
    private http: HttpClient
  ) {
    this.syncFromBackend();
    this.restoreSelectedEvent();
  }

  // Public: force-refresh events from backend (useful when components need latest statuses)
  async refreshFromBackend(): Promise<void> {
    try {
      await this.syncFromBackend();
    } catch (err) {
      console.error('Failed to refresh events from backend:', err);
    }
  }

  // Persist to local cache in memory and notify observers
  private saveEvents(): void {
    this.eventsSubject.next([...this.events]); // Update the observable
  }

  // Fetch latest events from backend and update local cache
  private async syncFromBackend(): Promise<void> {
    try {
      const apiEvents = await firstValueFrom(
        this.http.get<Event[]>(`${API_BASE_URL}/events`)
      );
      this.events = apiEvents.map(e => this.reviveEventDates(e));
      this.saveEvents();
    } catch (error) {
      // If backend is unreachable, we silently keep local data
      console.error('Failed to sync events from backend:', error);
    }
  }

  private reviveEventDates(event: any): Event {
    const revived = {
      ...event,
      date: event.date ? new Date(event.date) : new Date(),
      createdAt: event.createdAt ? new Date(event.createdAt) : new Date(),
      updatedAt: event.updatedAt ? new Date(event.updatedAt) : new Date(),
    } as Event;

    // Only prefix poster paths that point to server uploads (e.g. /uploads/xyz)
    if (revived.posterURL && typeof revived.posterURL === 'string' && revived.posterURL.startsWith('/uploads/')) {
      const backendBase = API_BASE_URL.replace(/\/api\/?$/, '');
      revived.posterURL = backendBase + revived.posterURL;
    }

    return revived;
  }


  // Get all events
  getAllEvents(): Event[] {
    return [...this.events];
  }

  // Get event by ID
  getEventById(eventId: string): Event | undefined {
    return this.events.find(event => event.eventId === eventId);
  }

  // Get events by organizer ID
  getEventsByOrganizer(organizerId: string): Event[] {
    return this.events.filter(event => event.organizerId === organizerId);
  }

  // Create new event (also save to MongoDB via backend)
  async createEvent(event: Event, posterFile?: File): Promise<void> {
    // Optimistically add to local list
    this.events.push(event);
    this.saveEvents();

    try {
      if (posterFile) {
        const form = new FormData();
        form.append('event', JSON.stringify(event));
        form.append('poster', posterFile, posterFile.name);
        await firstValueFrom(
          this.http.post<Event>(`${API_BASE_URL}/events`, form)
        );
      } else {
        await firstValueFrom(
          this.http.post<Event>(`${API_BASE_URL}/events`, event)
        );
      }

      // Re-sync from backend to ensure we have the latest copy
      await this.syncFromBackend();
    } catch (error) {
      console.error('Failed to create event on backend:', error);
    }
  }

  // Update event (also update on backend)
  updateEvent(eventId: string, updates: Partial<Event>): boolean {
    const index = this.events.findIndex(event => event.eventId === eventId);
    if (index !== -1) {
      this.events[index] = { 
        ...this.events[index], 
        ...updates, 
        updatedAt: new Date() 
      };
      this.saveEvents();

      // Fire-and-forget backend update
      this.http.put<Event>(`${API_BASE_URL}/events/${eventId}`, this.events[index])
        .subscribe({
          error: err => console.error('Failed to update event on backend:', err)
        });
      return true;
    }
    return false;
  }

  // Delete event (also delete from backend)
  deleteEvent(eventId: string): boolean {
    const index = this.events.findIndex(event => event.eventId === eventId);
    if (index !== -1) {
      this.events.splice(index, 1);
      this.saveEvents();

      this.http.delete(`${API_BASE_URL}/events/${eventId}`).subscribe({
        error: err => console.error('Failed to delete event on backend:', err)
      });
      return true;
    }
    return false;
  }

  // Get promotions for an event
  getEventPromotions(eventId: string): Promotion[] {
    const event = this.getEventById(eventId);
    return event?.promotions || [];
  }

  // Add promotion to event
  addPromotionToEvent(eventId: string, promotion: Promotion): boolean {
    const event = this.getEventById(eventId);
    if (event) {
      if (!event.promotions) {
        event.promotions = [];
      }
      
      // Check for duplicate code
      const duplicate = event.promotions.find(p => p.code === promotion.code);
      if (duplicate) {
        throw new Error(`Promo code ${promotion.code} already exists for this event.`);
      }
      
      event.promotions.push(promotion);
      
      // Use the updateEvent method
      return this.updateEvent(eventId, { promotions: event.promotions });
    }
    return false;
  }

  // Update a specific promotion in event
  updateEventPromotion(eventId: string, promoId: string, updates: Partial<Promotion>): boolean {
    const event = this.getEventById(eventId);
    if (event?.promotions) {
      const index = event.promotions.findIndex(p => p.promoId === promoId);
      if (index !== -1) {
        event.promotions[index] = { 
          ...event.promotions[index], 
          ...updates, 
          updatedAt: new Date() 
        };
        return this.updateEvent(eventId, { promotions: event.promotions });
      }
    }
    return false;
  }

  // Remove promotion from event
  removePromotionFromEvent(eventId: string, promoId: string): boolean {
    const event = this.getEventById(eventId);
    if (event?.promotions) {
      const index = event.promotions.findIndex(p => p.promoId === promoId);
      if (index !== -1) {
        event.promotions.splice(index, 1);
        return this.updateEvent(eventId, { promotions: event.promotions });
      }
    }
    return false;
  }

  // Find promotion in event by code
  findPromotionInEvent(eventId: string, code: string): Promotion | undefined {
    const event = this.getEventById(eventId);
    if (!event?.promotions) return undefined;
    
    return event.promotions.find(p => 
      p.code === code.toUpperCase() && 
      p.isActive &&
      new Date(p.expiryDate) > new Date()
    );
  }

  // Search events
  searchEvents(query: string): Event[] {
    const searchTerm = query.toLowerCase();
    return this.events.filter(event => 
      event.title.toLowerCase().includes(searchTerm) ||
      event.description?.toLowerCase().includes(searchTerm) ||
      event.location.toLowerCase().includes(searchTerm)
    );
  }

  // Get upcoming events
  getUpcomingEvents(): Event[] {
    const now = new Date();
    return this.events.filter(event => 
      new Date(event.date) > now && 
      event.status === 'upcoming'
    ).sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  }

  // Get past events
  getPastEvents(): Event[] {
    const now = new Date();
    return this.events.filter(event => 
      new Date(event.date) <= now
    ).sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }

  // Add this method
  setSelectedEvent(event: Event): void {
    this.selectedEventSubject.next(event);
    if (typeof window !== 'undefined') {
      try {
        localStorage.setItem('selectedEvent', JSON.stringify(event));
      } catch {}
    }
  }

  private restoreSelectedEvent(): void {
    if (typeof window === 'undefined') return;
    try {
      const stored = localStorage.getItem('selectedEvent');
      if (!stored) return;
      const parsed = JSON.parse(stored);
      const revived = this.reviveEventDates(parsed);
      this.selectedEventSubject.next(revived);
    } catch {
      localStorage.removeItem('selectedEvent');
    }
  }

  // Add this method for booking seats
  bookSeats(eventId: string, seatsToBook: any[]): boolean {
    const event = this.getEventById(eventId);
    if (!event) {
      return false;
    }

    // Ensure sections are present; if missing (legacy events), generate them now
    let baseSections = event.sections;
    if (!baseSections || !Array.isArray(baseSections) || baseSections.length === 0) {
      if (event.seatTypes && event.seatTypes.length > 0) {
        baseSections = this.generateSeatsService.generateSeats(event.seatTypes);
      } else {
        return false;
      }
    }

    // A deep copy is needed to avoid modifying the original event object
    const updatedSections = JSON.parse(JSON.stringify(baseSections));

    for (const seatToBook of seatsToBook) {
      let seatFound = false;
      for (const section of updatedSections) {
        if (section.name === seatToBook.section) {
          for (const row of section.seatRows) {
            const seat = row.find((s: Seat) => s.number === seatToBook.number);
            if (seat) {
              if (seat.occupied) {
                // Seat is already taken, so the booking fails
                return false; 
              }
              seat.occupied = true;
              seatFound = true;
              break;
            }
          }
        }
        if (seatFound) break;
      }
      if (!seatFound) {
        // If a seat to be booked doesn't exist in the event's sections
        return false; 
      }
    }

    this.updateEvent(eventId, {
      sections: updatedSections,
    });
    return true;
  }

  // Free up seats when booking is cancelled
  freeSeats(eventId: string, seatsToFree: any[]): boolean {
    const event = this.getEventById(eventId);
    if (!event) return false;

    let baseSections = event.sections;
    if (!baseSections || !Array.isArray(baseSections) || baseSections.length === 0) {
      return false; // Can't free seats if sections don't exist
    }

    const updatedSections = JSON.parse(JSON.stringify(baseSections));

    for (const seatToFree of seatsToFree) {
      for (const section of updatedSections) {
        if (section.name === seatToFree.section) {
          for (const row of section.seatRows) {
            const seat = row.find((s: Seat) => s.number === seatToFree.number);
            if (seat) {
              seat.occupied = false;
              break;
            }
          }
        }
      }
    }

    this.updateEvent(eventId, {
      sections: updatedSections,
    });
    return true;
  }

  // Clear all events (for testing)
  clearEvents(): void {
    this.events = [];
    this.saveEvents();
  }
}
