import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink, Router } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { EventService } from '../../../services/event.service';
import { AuthService } from '../../../services/auth.service';
import { Event } from '../../../models/event.model';
import { SeatType } from '../../../models/SeatType.model';
import { Promotion } from '../../../models/promo-code.model';
import { PromotionService } from '../../../services/promo.service';
import { GenerateSeatsService } from '../../../services/generate-seats.service';

interface CustomSeatingSection {
  name: string;
  price: number;
  maxPerOrder: number;
}

@Component({
  selector: 'app-organizer-create-event',
  imports: [CommonModule, RouterLink, FormsModule],
  templateUrl: './organizer-create-event.html',
  styleUrls: ['./organizer-create-event.css'],
})
export class OrganizerCreateEventComponent {
  eventTitle: string = '';
  eventDescription: string = '';
  eventLocation: string = '';
  eventDate: string = '';
  startTime: string = '';
  endTime: string = '';
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

  constructor(
    private router: Router,
    private eventService: EventService,
    private authService: AuthService,
    private promotionService: PromotionService,
    private generateSeatsService: GenerateSeatsService
  ) {}

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
        totalAvailable: 618,
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
}