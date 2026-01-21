import { SeatSelection } from "./seat-selection.model";


export interface Booking {
  id: string;
  userId?: string;
  fullName: string;
  email: string;
  eventId: string;
  eventName: string;
  seats: SeatSelection[];
  subtotal: number;
  promoCode?: string | null;
  discount: number;
  finalPrice: number;
  qrCodeUrl?: string;
  status: 'pending' | 'paid' | 'cancelled';
  createdAt: string;
  updatedAt: string;
}