import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, ActivatedRoute } from '@angular/router';
import { Subscription } from 'rxjs';
import { AuthService } from '../../../services/auth.service';
import { EventService } from '../../../services/event.service';
import { Event } from '../../../models/event.model';
import { BookingService } from '../../../services/booking.service';
import { GenerateSeatsService } from '../../../services/generate-seats.service';
import { User } from '../../../models/user.model';
import { Booking } from '../../../models/booking.model';
import { SeatType } from '../../../models/SeatType.model';
import { WaitlistService } from '../../../services/waitlist.service';

interface TicketTypeCount {
  type: string;
  count: number;
  maxLimit: number;
  price: number;
}

interface Seat {
  number: string;
  seatType: string;
  section: string;
  price: number;
  occupied: boolean;
  selected: boolean;
  row?: string;
}

interface Section {
  name: string;
  seatRows: Seat[][];
}

@Component({
  selector: 'app-select-seats',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './select-seats.html',
  styleUrls: ['./select-seats.css']
})
export class SelectSeatsComponent implements OnInit, OnDestroy {
  currentUser: User | null = null;
  sections: Section[] = [];
  currentSectionIndex: number = 0;
  selectedSeats: Seat[] = [];
  booking: { fullName: string; email: string; performance: string } = { fullName: '', email: '', performance: '' };
  totalPrice: number = 0;
  selectedEvent: Event | null = null;
  validationErrors: string[] = [];
  ticketTypeCounts: TicketTypeCount[] = [];
  
  private seatTypeLimits: Map<string, number> = new Map();
  private subs: Subscription[] = [];
  private waitlistToken: string | null = null;

  constructor(
    private auth: AuthService, 
    private eventsService: EventService, 
    private router: Router, 
    private bookingService: BookingService,
    private generateSeatsService: GenerateSeatsService,
    private route: ActivatedRoute,
    private waitlistService: WaitlistService
  ) {}

  ngOnInit(): void {
    // populate booking from logged-in user if available
    const user = this.auth.getUser();
    if (user) {
      this.currentUser = user;
      if (user.fullName) this.booking.fullName = user.fullName;
      if (user.email) this.booking.email = user.email;
    }

    // Check for a waitlist token in the URL
    this.waitlistToken = this.route.snapshot.queryParamMap.get('token');
    if (this.waitlistToken) {
      this.handleWaitlistToken(this.waitlistToken);
    } else {
      this.handleStandardBookingFlow();
    }
  }

  private async handleWaitlistToken(token: string) {
    const validation = await this.waitlistService.validateToken(token);
    if (validation.valid && validation.eventId) {
      const event = this.eventsService.getEventById(validation.eventId);
      if (event) {
        // Set a custom seat limit for this waitlist user
        const seatsOffered = validation.seatsOffered || 1;
        event.seatTypes.forEach(st => st.maxPerOrder = seatsOffered);

        this.eventsService.setSelectedEvent(event);
        this.handleStandardBookingFlow(); // Now proceed as normal
      } else {
        alert('Event not found.');
        this.router.navigateByUrl('/');
      }
    } else {
      alert('Invalid or expired waitlist token.');
      this.router.navigateByUrl('/');
    }
  }

  private handleStandardBookingFlow() {
    // subscribe to selected event
    const s = this.eventsService.selectedEvent$.subscribe(ev => {
      if (!ev) {
        if (typeof window !== 'undefined') {
          const stored = localStorage.getItem('selectedEvent');
          if (stored) {
            try {
              const parsed = JSON.parse(stored);
              this.eventsService.setSelectedEvent(parsed);
              return;
            } catch {
              localStorage.removeItem('selectedEvent');
            }
          }
        }
        return;
      }

      this.selectedEvent = ev;
      this.booking.performance = `${ev.title} — ${new Date(ev.date).toLocaleDateString()} ${ev.startTime}`;

      if (ev.seatTypes) {
        if (ev.sections && Array.isArray(ev.sections) && ev.sections.length > 0) {
          this.sections = ev.sections as Section[];
          // If the event already had sections persisted, ensure any transient
          // `selected` flags are cleared so previous selections don't reappear.
          this.clearTransientSelections(this.sections, ev);
        } else {
          this.sections = this.generateSeatsService.generateSeats(ev.seatTypes) as Section[];
          // Generated sections are local to this component; make sure no stray
          // `selected` flags are present and (optionally) attach to the event
          // so future visits start clean.
          this.clearTransientSelections(this.sections, ev, /*attachToEvent*/ true);
        }
        this.initializeSeatTypeLimits(ev.seatTypes);
      }
    });
    this.subs.push(s);
  }

  private initializeSeatTypeLimits(seatTypes: SeatType[]): void {
    seatTypes.forEach(seatType => {
      this.seatTypeLimits.set(seatType.name, seatType.maxPerOrder || 10); // Default to 10 if not set
    });
  }

  changeSection(index: number): void {
    this.currentSectionIndex = index;
  }

  selectSeat(seat: Seat): void {
    if (seat.occupied) return;

    if (seat.selected) {
      // Deselect seat
      seat.selected = false;
      this.selectedSeats = this.selectedSeats.filter(s => s !== seat);
    } else {
      // Check if selecting this seat would exceed the limit
      const seatType = seat.seatType;
      const currentCount = this.selectedSeats.filter(s => s.seatType === seatType).length;
      const maxLimit = this.seatTypeLimits.get(seatType) || 10;
      
      if (currentCount >= maxLimit) {
        alert(`You have reached the maximum limit of ${maxLimit} tickets for ${seatType} seats.`);
        return;
      }
      
      // Select seat
      seat.selected = true;
      this.selectedSeats.push(seat);
    }
    
    this.updateTotalPrice();
    this.validateSeatSelection();
    this.updateTicketTypeCounts();
  }

  getSectionMaxLimit(sectionName: string): number | null {
    if (!this.selectedEvent?.seatTypes) return null;
    
    const seatTypeForSection = this.sections.find(s => s.name === sectionName)?.seatRows[0]?.[0]?.seatType;
    if (!seatTypeForSection) return null;
    
    return this.seatTypeLimits.get(seatTypeForSection) || null;
  }

  isSeatSelectionExceedingLimit(seat: Seat): boolean {
    if (!seat.selected) return false;
    
    const seatType = seat.seatType;
    const currentCount = this.selectedSeats.filter(s => s.seatType === seatType).length;
    const maxLimit = this.seatTypeLimits.get(seatType) || 10;
    
    return currentCount > maxLimit;
  }

  getSeatTooltip(seat: Seat): string {
    if (seat.occupied) return 'This seat is already taken';
    
    const seatType = seat.seatType;
    const currentCount = this.selectedSeats.filter(s => s.seatType === seatType).length;
    const maxLimit = this.seatTypeLimits.get(seatType) || 10;
    
    if (this.isSeatSelectionExceedingLimit(seat)) {
      return `Limit exceeded! You have ${currentCount} ${seatType} seats (max: ${maxLimit})`;
    }
    
    return `Click to select ${seatType} seat (${currentCount}/${maxLimit} selected)`;
  }

  private validateSeatSelection(): void {
    this.validationErrors = [];
    
    if (!this.selectedEvent?.seatTypes) return;
    
    // Group selected seats by seat type
    const seatTypeGroups = new Map<string, number>();
    this.selectedSeats.forEach(seat => {
      const count = seatTypeGroups.get(seat.seatType) || 0;
      seatTypeGroups.set(seat.seatType, count + 1);
    });
    
    // Check each seat type against its limit
    seatTypeGroups.forEach((count, seatType) => {
      const maxLimit = this.seatTypeLimits.get(seatType) || 10;
      if (count > maxLimit) {
        this.validationErrors.push(
          `${seatType}: You selected ${count} tickets, but the limit is ${maxLimit} per order.`
        );
      }
    });
  }

  private updateTicketTypeCounts(): void {
    if (!this.selectedEvent?.seatTypes) return;
    
    const counts = new Map<string, TicketTypeCount>();
    
    // Initialize with all seat types from the event
    this.selectedEvent.seatTypes.forEach(seatType => {
      counts.set(seatType.name, {
        type: seatType.name,
        count: 0,
        maxLimit: seatType.maxPerOrder || 10,
        price: seatType.price
      });
    });
    
    // Update counts with selected seats
    this.selectedSeats.forEach(seat => {
      const existing = counts.get(seat.seatType);
      if (existing) {
        existing.count++;
        counts.set(seat.seatType, existing);
      }
    });
    
    this.ticketTypeCounts = Array.from(counts.values())
      .filter(item => item.count > 0); // Only show types with selected seats
  }

  getTotalPrice(): number {
    return this.totalPrice;
  }

  updateTotalPrice(): void {
    this.totalPrice = this.selectedSeats.reduce((total, seat) => total + seat.price, 0);
  }

  confirmBooking(): void {
    if (this.selectedSeats.length === 0) {
      alert('Please select at least one seat.');
      return;
    }
    
    // Check validation errors
    if (this.validationErrors.length > 0) {
      alert('Please fix the ticket limit issues before proceeding.');
      return;
    }
    
    // If there's a selected event, attempt to book seats 
    if (!this.selectedEvent) {
      alert('No event selected. Please choose an event first.');
      this.router.navigateByUrl('/browse-events');
      return;
    }

    // Check if user is organizer or admin
    if (this.currentUser?.role === 'organizer' || this.currentUser?.role === 'admin') {
      alert('Organizers and administrators cannot book tickets.');
      return;
    }

    // Create a pending booking and move to promo code step
    const seats = this.selectedSeats.map(seat => ({ 
      number: seat.number, 
      seatType: seat.seatType,
      section: seat.section,
      price: seat.price
    }));
    
    const booking: Booking = {
      id: String(Date.now()),
      userId: this.currentUser?.userId || undefined,
      fullName: this.booking.fullName,
      email: this.booking.email,
      eventId: this.selectedEvent.eventId,
      eventName: this.selectedEvent.title,
      seats: seats,
      subtotal: this.totalPrice,
      promoCode: null,
      discount: 0,
      finalPrice: this.totalPrice,
      status: 'pending',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    // If booking was from a waitlist, we need to claim the token
    if (this.waitlistToken) {
      this.waitlistService.claimToken(this.waitlistToken);
    }

    this.bookingService.setCurrent(booking);
    // navigate to promo-code page to allow discount application
    this.router.navigateByUrl('/promo-code');
  }

  ngOnDestroy(): void {
    // Clear transient selection state so selections don't persist between visits
    this.selectedSeats = [];
    this.totalPrice = 0;
    this.ticketTypeCounts = [];
    this.validationErrors = [];

    if (this.selectedEvent?.sections) {
      for (const section of this.selectedEvent.sections) {
        for (const row of section.seatRows) {
          for (const seat of row) {
            if ((seat as any).selected) (seat as any).selected = false;
          }
        }
      }
      try {
        this.eventsService.setSelectedEvent(this.selectedEvent);
      } catch {}
    }

    this.subs.forEach(s => s.unsubscribe());
  }

  /**
   * Clear transient `selected` flags from provided sections and reset component state.
   * If `attachToEvent` is true, also set `event.sections` to the cleaned sections
   * and persist via EventService so localStorage doesn't rehydrate previous selections.
   */
  private clearTransientSelections(sections: Section[], event?: Event | null, attachToEvent: boolean = false): void {
    if (!sections || !Array.isArray(sections)) return;

    for (const section of sections) {
      for (const row of section.seatRows) {
        for (const seat of row) {
          if ((seat as any).selected) (seat as any).selected = false;
        }
      }
    }

    // Reset component-local selection tracking
    this.selectedSeats = [];
    this.totalPrice = 0;
    this.ticketTypeCounts = [];
    this.validationErrors = [];

    if (attachToEvent && event) {
      try {
        event.sections = sections as any;
        this.eventsService.setSelectedEvent(event);
      } catch {}
    } else if (event && event.sections) {
      try {
        // Persist the cleaned event so localStorage doesn't contain selections
        this.eventsService.setSelectedEvent(event);
      } catch {}
    }
  }
}
