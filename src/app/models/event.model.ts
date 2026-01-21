import { AuditoriumLayout } from "./auditorium.model";
import { SeatType } from "./SeatType.model";
import { Promotion } from "./promo-code.model"

// models/event.model.ts
export interface Event {
  eventId: string;
  organizerId: string;
  title: string;
  description?: string; // Make optional since error says string | undefined
  date: Date;
  startTime: string;
  endTime: string;
  location: string;
  ticketsLeft: number;
  status: 'upcoming' | 'ongoing' | 'completed' | 'cancelled' | 'past';
  seatingLayout: AuditoriumLayout;
  sections: any[];
  seatTypes: SeatType[];
  promotions?: Promotion[];
  posterURL?: string; // Add this property
  createdAt: Date;
  updatedAt: Date;
}