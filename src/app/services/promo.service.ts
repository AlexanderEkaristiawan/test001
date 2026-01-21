// services/promotion.service.ts
import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Promotion } from '../models/promo-code.model';
import { BehaviorSubject, firstValueFrom } from 'rxjs';

const API_BASE_URL = 'http://localhost:5000/api';

@Injectable({
  providedIn: 'root'
})
export class PromotionService {
  private promotionsSubject = new BehaviorSubject<Promotion[]>([]);
  public promotions$ = this.promotionsSubject.asObservable();

  constructor(private http: HttpClient) {
    this.syncFromBackend();
  }

  private async syncFromBackend(): Promise<void> {
    try {
      const list = await firstValueFrom(
        this.http.get<any[]>(`${API_BASE_URL}/promotions`)
      );

      const mapped: Promotion[] = list.map((p: Promotion) => ({
        promoId: p.promoId,
        eventId: p.eventId, 
        code: p.code,
        discountType: p.discountType,
        discountValue: p.discountValue,
        expiryDate: new Date(p.expiryDate),
        maxUses: p.maxUses,
        usedCount: p.usedCount,
        applicableTicketTypes: p.applicableTicketTypes || [],
        minPurchaseAmount: p.minPurchaseAmount,
        maxDiscountAmount: undefined,
        isActive: p.isActive,
        createdAt: new Date(p.createdAt),
        updatedAt: new Date(p.updatedAt)
      }));
      this.promotionsSubject.next(mapped);
    } catch (err) {
      console.error('Failed to load promotions from backend:', err);
    }
  }

  private setPromotions(list: Promotion[]) {
    this.promotionsSubject.next(list);
  }

  // Get all promotions
  getAllPromotions(): Promotion[] {
    return this.promotionsSubject.value;
  }

  // Get promotion by ID
  getPromotionById(promoId: string): Promotion | undefined {
    return this.promotionsSubject.value.find(p => p.promoId === promoId);
  }

  // Get promotions by event ID (backend stores event ObjectId)
  getPromotionsByEventId(eventId: string): Promotion[] {
    return this.promotionsSubject.value.filter(p => 
      String(p.eventId) === eventId && 
      p.isActive &&
      new Date(p.expiryDate) > new Date()
    );
  }

  // Get promotion by code for an event
  getPromotionByCode(eventId: string, code: string): Promotion | undefined {
    const now = new Date();
    return this.promotionsSubject.value.find(p => 
      String(p.eventId) === eventId && 
      p.code === code.toUpperCase() && 
      p.isActive &&
      new Date(p.expiryDate) > now
    );
  }

  // Add new promotion
  async addPromotion(promotion: Promotion): Promise<void> {
    // Check for duplicate code in same event in local cache
    const existing = this.promotionsSubject.value.find(p => 
      String(p.eventId) === String(promotion.eventId) && 
      p.code === promotion.code
    );
    
    if (existing) {
      throw new Error(`Promo code ${promotion.code} already exists for this event.`);
    }

    try {
      await firstValueFrom(
        this.http.post(`${API_BASE_URL}/promotions`, {
          code: promotion.code,
          discount: promotion.discountValue,
          discountType: promotion.discountType,
          event: promotion.eventId,
          validUntil: promotion.expiryDate,
          maxUses: promotion.maxUses,
          usedCount: promotion.usedCount,
          isActive: promotion.isActive,
          minPurchase: promotion.minPurchaseAmount,
          applicableTicketTypes: promotion.applicableTicketTypes
        })
      );
      await this.syncFromBackend();
    } catch (err) {
      console.error('Failed to create promotion on backend:', err);
      throw err;
    }
  }

  // Update promotion
  async updatePromotion(promoId: string, updates: Partial<Promotion>): Promise<boolean> {
    try {
      await firstValueFrom(
        this.http.put(`${API_BASE_URL}/promotions/${promoId}`, updates)
      );
      await this.syncFromBackend();
      return true;
    } catch (err) {
      console.error('Failed to update promotion on backend:', err);
      return false;
    }
  }

  // Delete/Deactivate promotion
  async deletePromotion(promoId: string): Promise<boolean> {
    try {
      await firstValueFrom(
        this.http.delete(`${API_BASE_URL}/promotions/${promoId}`)
      );
      await this.syncFromBackend();
      return true;
    } catch (err) {
      console.error('Failed to delete promotion on backend:', err);
      return false;
    }
  }

  // Record promotion usage
  async recordPromoUsage(promoId: string): Promise<boolean> {
    const promotion = this.getPromotionById(promoId);
    if (!promotion) return false;

    const updated: Partial<Promotion> = {
      usedCount: promotion.usedCount + 1,
      isActive: promotion.maxUses > 0 && promotion.usedCount + 1 >= promotion.maxUses
        ? false
        : promotion.isActive
    };

    return this.updatePromotion(promoId, updated);
  }

  // Validate promotion (same logic, purely client-side)
  validatePromotion(promotion: Promotion, subtotal: number, applicableTicketIds: string[]): { valid: boolean; message: string } {
    const now = new Date();
    
    if (!promotion.isActive) {
      return { valid: false, message: 'Promo code is no longer active.' };
    }
    
    if (new Date(promotion.expiryDate) <= now) {
      return { valid: false, message: 'Promo code has expired.' };
    }
    
    if (promotion.maxUses > 0 && promotion.usedCount >= promotion.maxUses) {
      return { valid: false, message: 'Promo code has reached its usage limit.' };
    }
    
    if (promotion.minPurchaseAmount && subtotal < promotion.minPurchaseAmount) {
      return { 
        valid: false, 
        message: `Minimum purchase of $${promotion.minPurchaseAmount} required.` 
      };
    }
    
    if (promotion.applicableTicketTypes && promotion.applicableTicketTypes.length > 0) {
      const hasApplicableTicket = applicableTicketIds.some(id => 
        promotion.applicableTicketTypes.includes(id)
      );
      
      if (!hasApplicableTicket) {
        return { 
          valid: false, 
          message: 'Promo code not applicable to selected tickets.' 
        };
      }
    }
    
    return { valid: true, message: '' };
  }

  // Calculate discount (unchanged – pure function)
  calculateDiscount(promotion: Promotion, subtotal: number): number {
    let discount = 0;
    
    if (promotion.discountType === 'percentage') {
      discount = subtotal * (promotion.discountValue / 100);
      
      if (promotion.maxDiscountAmount && discount > promotion.maxDiscountAmount) {
        discount = promotion.maxDiscountAmount;
      }
    } else {
      discount = promotion.discountValue;
    }
    
    return Math.min(discount, subtotal);
  }

  // Clear all promotions (for testing) – backend-based
  async clearPromotions(): Promise<void> {
    const all = this.promotionsSubject.value;
    for (const p of all) {
      await this.deletePromotion(p.promoId);
    }
    this.setPromotions([]);
  }
}