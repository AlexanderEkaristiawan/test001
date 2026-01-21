export interface Promotion {
  promoId: string;
  eventId: string;
  code: string;
  discountType: 'percentage' | 'fixed';
  discountValue: number;
  expiryDate: Date;
  maxUses: number; // 0 = unlimited
  usedCount: number;
  applicableTicketTypes: string[]; // Array of seatType IDs or section names
  minPurchaseAmount?: number;
  maxDiscountAmount?: number; // For percentage discounts
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}