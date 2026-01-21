export interface Waitlist {
  waitlistId: string;
  eventId: string;
  attendeeName: string;
  attendeeEmail: string;
  position: number;
  notified: boolean;
  joinedAt: Date;
}