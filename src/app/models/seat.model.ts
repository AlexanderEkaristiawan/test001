export interface Seat {
  seatId: string;
  row: string;
  number: number;
  section: 'Balcony' | 'Lower Foyer';
  eventId: string;
  ticketTypeId?: string;
  status: 'available' | 'reserved' | 'sold';
}