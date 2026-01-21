
import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, ActivatedRoute, RouterLink } from '@angular/router';
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
import { PromotionService } from '../../../services/promo.service';
import { Promotion } from '../../../models/promo-code.model';

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


interface CustomSeatingSection {
  name: string;
  price: number;
  maxPerOrder: number;
}

@Component({
  selector: 'app-view-event-details',
  imports: [CommonModule, FormsModule, RouterLink],
  templateUrl: './view-event-details.html',
  styleUrl: './view-event-details.css',
})



export class ViewEventDetails implements OnInit, OnDestroy {




  eventTitle: string = '';
    eventDescription: string = '';
    eventLocation: string = '';
    eventDate: string = '';
    startTime: string = '';
    endTime: string = '';
    // Poster and raw event object (used by template fallbacks)
    eventPosterUrl: string = '';
    event: Event | null = null;
    seatsPerSection: number = 100;
    applyMaxToAllValue: string = '';
    promotions: Promotion[] = [];
  
    customSeating: { [section: string]: CustomSeatingSection } = {
      'Left Foyer': { name: '', price: 0, maxPerOrder: 10 },
      'Middle Foyer': { name: '', price: 0, maxPerOrder: 10 },
      'Right Foyer': { name: '', price: 0, maxPerOrder: 10 },
      'Left Balcony': { name: '', price: 0, maxPerOrder: 10 },
      'Middle Balcony': { name: '', price: 0, maxPerOrder: 10 },
      'Right Balcony': { name: '', price: 0, maxPerOrder: 10 },
    };
  
    
  
    // posterFile may be undefined when no file is selected
    posterFile: File | undefined = undefined;
  
    onPosterSelected(event: any) {
      const file: File | undefined = event.target.files && event.target.files[0];
      if (file) {
        this.posterFile = file;
      }
    }
  
    private validateCustomSeating(): string[] {
      const errors: string[] = [];
      
      Object.entries(this.customSeating).forEach(([section, config]) => {
        if (!config.name || config.name.trim() === '') {
          errors.push(`- ${section}: Ticket type name is required`);
        }
        if (config.price <= 0) {
          errors.push(`- ${section}: Price must be greater than 0`);
        }
        if (config.price > 10000) {
          errors.push(`- ${section}: Price cannot exceed 0,000`);
        }
        if (config.maxPerOrder < 1 || config.maxPerOrder > 50) {
          errors.push(`- ${section}: Max tickets per order must be between 1 and 50`);
        }
      });
  
      return errors;
    }
  
    applyMaxToAll() {
      if (this.applyMaxToAllValue) {
        const maxValue = parseInt(this.applyMaxToAllValue, 10);
        if (!isNaN(maxValue) && maxValue >= 1 && maxValue <= 50) {
          Object.keys(this.customSeating).forEach(section => {
            this.customSeating[section].maxPerOrder = maxValue;
          });
          this.applyMaxToAllValue = '';
        }
      }
    }
  
    copyConfiguration(sourceSection: string) {
      const config = this.customSeating[sourceSection];
      if (config.name && config.price > 0) {
        const confirmCopy = confirm(`Copy "${config.name}" configuration (${config.price}, Max: ${config.maxPerOrder}) to all other sections?`);
        if (confirmCopy) {
          Object.keys(this.customSeating).forEach(key => {
            if (key !== sourceSection) {
              this.customSeating[key] = { ...config };
            }
          });
        }
      } else {
        alert('Please fill in the source section configuration first.');
      }
    }
  
    onEventSubmit() {
      const user = this.authService.getUser();
      if (!user) {
        alert('You must be logged in to create an event.');
        return;
      }
  
      const validationErrors = this.validateCustomSeating();
      if (validationErrors.length > 0) {
        alert('Please fix the following errors:\n' + validationErrors.join('\n'));
        return;
      }
  
      const eventId = `e${Date.now()}`;
  
      const uniqueTicketTypes: { 
        [key: string]: { 
          name: string; 
          price: number; 
          maxPerOrder: number;
          sections: string[] 
        } 
      } = {};
      
      Object.entries(this.customSeating).forEach(([section, config]) => {
        const key = `${config.name}_${config.price}_${config.maxPerOrder}`;
        if (!uniqueTicketTypes[key]) {
          uniqueTicketTypes[key] = {
            name: config.name,
            price: config.price,
            maxPerOrder: config.maxPerOrder,
            sections: [section]
          };
        } else {
          uniqueTicketTypes[key].sections.push(section);
        }
      });
  
      const finalSeatTypes: SeatType[] = Object.values(uniqueTicketTypes).map((ticketType, index) => {
        return {
          id: `st_${index}_${eventId}`,
          eventId: eventId,
          name: ticketType.name,
          price: ticketType.price,
          totalAvailable: ticketType.sections.length * this.seatsPerSection,
          soldCount: 0,
          maxPerOrder: ticketType.maxPerOrder,
          assignedSections: ticketType.sections,
          createdAt: new Date(),
          updatedAt: new Date(),
        };
      });
  
      const totalTickets = finalSeatTypes.reduce((sum, seatType) => sum + seatType.totalAvailable, 0);
  
      const finalPromotions: Promotion[] = [];
      this.promotions.forEach(promo => {
        const updatedPromo: Promotion = {
          ...promo,
          eventId: eventId,
          promoId: `promo_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
        };
        
        try {
          this.promotionService.addPromotion(updatedPromo);
          finalPromotions.push(updatedPromo);
        } catch (error) {
          console.error('Error saving promotion:', error);
        }
      });
  
      const sections = this.generateSeatsService.generateSeats(finalSeatTypes);
  
      const newEvent: Event = {
        eventId: eventId,
        organizerId: user.userId,
        title: this.eventTitle,
        description: this.eventDescription,
        date: new Date(this.eventDate),
        startTime: this.startTime,
        endTime: this.endTime,
        location: this.eventLocation,
        ticketsLeft: totalTickets,
        status: 'upcoming',
        seatTypes: finalSeatTypes,
        promotions: finalPromotions,
        sections: sections,
        createdAt: new Date(),
        updatedAt: new Date(),
      } as Event;
  
    this.eventService.createEvent(newEvent, this.posterFile);
      alert(`Event created successfully with ${finalPromotions.length} promotion(s)!`);
      this.router.navigate(['/organizer']);
    }
  
    newPromotion: {
      code: string;
      discountType: 'percentage' | 'fixed';
      discountValue: number;
      expiryDate: string;
      maxUses: number;
      minPurchaseAmount?: number;
      maxDiscountAmount?: number;
      applicableTicketTypes: string[];
    } = {
      code: '',
      discountType: 'percentage',
      discountValue: 20,
      expiryDate: '',
      maxUses: 100,
      applicableTicketTypes: []
    };
  
    addPromotion() {
      if (!this.isPromotionValid()) {
        return;
      }
  
      const promoId = `promo_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  
      // newPromotion.applicableTicketTypes will contain seat type NAMES (e.g. "VIP", "Standard").
      // If the array is empty, it means "all ticket types" and we just leave it empty.
      const applicableTypes = [...this.newPromotion.applicableTicketTypes];
  
      const promotion: Promotion = {
        promoId: promoId,
        eventId: '',
        code: this.newPromotion.code.toUpperCase(),
        discountType: this.newPromotion.discountType,
        discountValue: this.newPromotion.discountValue,
        expiryDate: new Date(this.newPromotion.expiryDate),
        maxUses: this.newPromotion.maxUses,
        usedCount: 0,
        applicableTicketTypes: applicableTypes,
        minPurchaseAmount: this.newPromotion.minPurchaseAmount,
        maxDiscountAmount: this.newPromotion.discountType === 'percentage' 
          ? this.newPromotion.maxDiscountAmount 
          : undefined,
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date()
      };
  
      this.promotions.push(promotion);
      this.clearPromotionForm();
    }
  
    removePromotion(promoId: string) {
      const index = this.promotions.findIndex(p => p.promoId === promoId);
      if (index !== -1) {
        this.promotions.splice(index, 1);
      }
    }
  
    clearPromotionForm() {
      this.newPromotion = {
        code: '',
        discountType: 'percentage',
        discountValue: 20,
        expiryDate: '',
        maxUses: 100,
        applicableTicketTypes: []
      };
    }
  
    isPromotionValid(): boolean {
      if (!this.newPromotion.code || this.newPromotion.code.trim().length < 3) {
        return false;
      }
      
      if (this.newPromotion.discountValue <= 0) {
        return false;
      }
      
      if (this.newPromotion.discountType === 'percentage' && this.newPromotion.discountValue > 100) {
        return false;
      }
      
      if (!this.newPromotion.expiryDate) {
        return false;
      }
  
      const expiry = new Date(this.newPromotion.expiryDate);
      const today = new Date();
      if (expiry <= today) {
        return false;
      }
  
      if (this.promotions.some(p => p.code === this.newPromotion.code.toUpperCase())) {
        alert('Promo code already exists!');
        return false;
      }
  
      return true;
    }
  
    toggleTicketType(section: string, event: any) {
      const typeName = this.customSeating[section]?.name || section;
      if (event.target.checked) {
        if (!this.newPromotion.applicableTicketTypes.includes(typeName)) {
          this.newPromotion.applicableTicketTypes.push(typeName);
        }
      } else {
        const index = this.newPromotion.applicableTicketTypes.indexOf(typeName);
        if (index !== -1) {
          this.newPromotion.applicableTicketTypes.splice(index, 1);
        }
      }
    }
  
    isTicketTypeSelected(section: string): boolean {
      const typeName = this.customSeating[section]?.name || section;
      return this.newPromotion.applicableTicketTypes.includes(typeName);
    }
  
    getSeatingSections(): string[] {
      return Object.keys(this.customSeating);
    }
  
    getApplicableTicketNames(promo: Promotion): string {
      if (promo.applicableTicketTypes.length === 0) {
        return 'All ticket types';
      }
  
      // promo.applicableTicketTypes stores seat type NAMES directly
      return promo.applicableTicketTypes.join(', ');
    }


































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


  constructor(
    private router: Router,
    private eventService: EventService,
    private authService: AuthService,
    private promotionService: PromotionService,
    private generateSeatsService: GenerateSeatsService,
    private eventsService: EventService, 
  ) {}

  ngOnInit(): void {
    this.handleStandardBookingFlow();
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
  // Expose event and poster URL for the template fallbacks
  this.event = ev;
  this.eventPosterUrl = (ev as any).posterURL || (ev as any).posterUrl || '';
      this.booking.performance = `${ev.title} — ${new Date(ev.date).toLocaleDateString()} ${ev.startTime}`;

      // Populate view-specific fields from the event so template shows consistent data
      this.eventTitle = ev.title || '';
      this.eventDate = ev.date ? new Date(ev.date).toISOString().split('T')[0] : '';
      this.startTime = ev.startTime || '';
      this.endTime = ev.endTime || '';
      this.eventLocation = ev.location || '';
      this.eventDescription = ev.description || '';

      // Map seatTypes -> customSeating per-section view
      if (ev.seatTypes && Array.isArray(ev.seatTypes) && ev.seatTypes.length > 0) {
        // Reset customSeating to empty defaults first
        Object.keys(this.customSeating).forEach(section => {
          this.customSeating[section] = { name: '', price: 0, maxPerOrder: 10 };
        });
        ev.seatTypes.forEach(st => {
          const assigned = (st as any).assignedSections || (st as any).sections || [];
          (assigned || []).forEach((sectionName: string) => {
            if (this.customSeating[sectionName]) {
              this.customSeating[sectionName] = {
                name: st.name,
                price: st.price,
                maxPerOrder: st.maxPerOrder || 10
              };
            }
          });
        });
      }

      // Promotions
      this.promotions = ev.promotions ? ev.promotions.slice() : [];

      if (ev.seatTypes) {
        if (ev.sections && Array.isArray(ev.sections) && ev.sections.length > 0) {
          this.sections = ev.sections as Section[];
        } else {
          this.sections = this.generateSeatsService.generateSeats(ev.seatTypes) as Section[];
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
      
      seat.selected = true;
      this.selectedSeats.push(seat);
    }
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

  ngOnDestroy(): void {
    this.subs.forEach(s => s.unsubscribe());
  }
}
