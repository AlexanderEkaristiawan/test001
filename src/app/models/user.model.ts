export interface User {
  userId: string;
  fullName: string;
  email: string;
  phone?: string;
  role: 'admin' | 'organizer' | 'attendee';
  organizationName?: string;
  password: string;
  isFirstLogin: boolean;
  isActive?: boolean;
  createdAt: Date;
  updatedAt: Date;
}

