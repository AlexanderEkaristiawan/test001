

export interface SeatType {
  id: string; // Unique identifier for the ticket type
  eventId: string; // Which event this ticket type belongs to
  name: string; // "General Admission", "VIP", "Senior Citizen", "Child"
  description?: string; // Optional description
  price: number; // Price per ticket (e.g., 25.00)
  
  // Availability and limits
  totalAvailable: number; // Total tickets available for this type (e.g., 500)
  soldCount: number; // Number already sold (e.g., 342)
  maxPerOrder: number; // Maximum tickets per order (e.g., 6)
  
  
  // Section assignment
  assignedSections: string[]; 
                              
  
  // Timestamps
  createdAt: Date;
  updatedAt: Date;
}

// Helper type for ticket type status
export type TicketTypeStatus = 'active' | 'inactive' | 'sold-out';

// Helper type for ticket type names (from the case study)
export type TicketTypeName = String;