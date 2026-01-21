// components/promo-code/promo-code.component.ts
import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { BookingService } from '../../../services/booking.service';
import { PromotionService } from '../../../services/promo.service';
import { EventService } from '../../../services/event.service';
import { Booking } from '../../../models/booking.model';
import { Promotion } from '../../../models/promo-code.model';

@Component({
  selector: 'app-promo-code',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './promo-code.html',
  styleUrls: ['./promo-code.css']
})
export class PromoCodeComponent implements OnInit {
  promoCode: string = '';
  discount: number = 0;
  totalPrice: number = 0;
  finalPrice: number = 0;
  promoError: string = '';
  promoSuccess: string = '';
  
  promoDetails: {
    code: string;
    discountText: string;
    expiryDate: string;
    conditions: string[];
  } | null = null;

  constructor(
    private bookingService: BookingService,
    private promotionService: PromotionService,
    private eventService: EventService,
    public router: Router
  ) {}

  ngOnInit() {
    this.loadBookingDetails();
  }

  loadBookingDetails() {
    const booking = this.bookingService.getCurrent();
    if (!booking || !booking.eventId) {
      // If there is no active booking, send the user back to browse events
      this.bookingService.restoreCurrent();
      return;
    }

    this.totalPrice = booking.subtotal;
    this.finalPrice = booking.finalPrice || booking.subtotal;
    this.discount = booking.discount || 0;
    
    // Load any applied promo
    if (booking.promoCode) {
      this.promoCode = booking.promoCode;
      this.loadPromoDetails(booking);
    }
  }

  loadPromoDetails(booking: Booking) {
    if (!booking.eventId || !booking.promoCode) return;

    // First, try to find promotion attached to the event itself
    let promotion = this.eventService.findPromotionInEvent(
      booking.eventId,
      booking.promoCode
    );

    // Fallback to global promotion store if not found on the event
    if (!promotion) {
      promotion = this.promotionService.getPromotionByCode(
        booking.eventId,
        booking.promoCode
      );
    }

    if (promotion) {
      this.updatePromoDisplay(promotion);
    }
  }

  applyPromoCode() {
    this.promoError = '';
    this.promoSuccess = '';
    this.discount = 0;
    this.promoDetails = null;

    const booking = this.bookingService.getCurrent();
    if (!booking || !booking.eventId) {
      this.promoError = 'No booking found. Please start over.';
      return;
    }

    if (!this.promoCode || this.promoCode.trim() === '') {
      this.promoError = 'Please enter a promo code.';
      return;
    }

    // Get promotion
    // First, try to find promotion attached directly to the event
    let promotion = this.eventService.findPromotionInEvent(
      booking.eventId,
      this.promoCode
    );

    // If not found on the event, fall back to the global promotion store
    if (!promotion) {
      promotion = this.promotionService.getPromotionByCode(
        booking.eventId, 
        this.promoCode
      );
    }

    if (!promotion) {
      this.promoError = 'Invalid or expired promo code.';
      return;
    }

    // Get applicable ticket identifiers from booking.
    // We include BOTH seat type name and section name so that older promos
    // saved by section (e.g. "Left Foyer") and newer promos saved by seat
    // type name (e.g. "VIP") will both work.
    const applicableTicketIds: string[] = [];
    booking.seats.forEach(seat => {
      if (seat.seatType) {
        applicableTicketIds.push(seat.seatType);
      }
      if ((seat as any).section) {
        applicableTicketIds.push((seat as any).section);
      }
    });

    // Validate promotion
    const validation = this.promotionService.validatePromotion(
      promotion,
      booking.subtotal,
      applicableTicketIds
    );

    if (!validation.valid) {
      this.promoError = validation.message;
      return;
    }

    // Calculate discount
    this.discount = this.promotionService.calculateDiscount(promotion, booking.subtotal);

    if (this.discount <= 0) {
      this.promoError = 'Promo code cannot be applied to this booking.';
      return;
    }

    // Update final price
    this.finalPrice = Math.max(0, booking.subtotal - this.discount);
    
    // Update booking
    booking.promoCode = this.promoCode.toUpperCase();
    booking.discount = this.discount;
    booking.finalPrice = this.finalPrice;
    booking.updatedAt = new Date().toISOString();
    
    this.bookingService.setCurrent(booking);
    
    // Record usage
    this.promotionService.recordPromoUsage(promotion.promoId);
    
    this.promoSuccess = 'Promo code applied successfully!';
    this.updatePromoDisplay(promotion);
  }

  updatePromoDisplay(promotion: Promotion) {
    const conditions: string[] = [];
    const expiryDate = new Date(promotion.expiryDate).toLocaleDateString();
    
    conditions.push(`Expires: ${expiryDate}`);
    
    if (promotion.maxUses > 0) {
      conditions.push(`Uses: ${promotion.usedCount}/${promotion.maxUses} remaining`);
    }
    
    if (promotion.minPurchaseAmount) {
      conditions.push(`Min. purchase: $${promotion.minPurchaseAmount}`);
    }
    
    if (promotion.discountType === 'percentage' && promotion.maxDiscountAmount) {
      conditions.push(`Max discount: $${promotion.maxDiscountAmount}`);
    }
    
    if (promotion.applicableTicketTypes && promotion.applicableTicketTypes.length > 0) {
      conditions.push(`Applicable to specific seat types`);
    }
    
    this.promoDetails = {
      code: promotion.code,
      discountText: promotion.discountType === 'percentage' 
        ? `${promotion.discountValue}% off` 
        : `$${promotion.discountValue} off`,
      expiryDate: expiryDate,
      conditions: conditions
    };
  }

  removePromoCode() {
    const booking = this.bookingService.getCurrent();
    if (!booking) return;
    
    booking.promoCode = null;
    booking.discount = 0;
    booking.finalPrice = booking.subtotal;
    booking.updatedAt = new Date().toISOString();
    
    this.bookingService.setCurrent(booking);
    
    this.promoCode = '';
    this.discount = 0;
    this.finalPrice = this.totalPrice;
    this.promoError = '';
    this.promoSuccess = '';
    this.promoDetails = null;
    
    this.promoSuccess = 'Promo code removed.';
    setTimeout(() => this.promoSuccess = '', 3000);
  }

  continueToReview() {
    this.router.navigateByUrl('/review-booking');
  }
}