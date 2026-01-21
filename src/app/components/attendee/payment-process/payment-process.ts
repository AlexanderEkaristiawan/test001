import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { BookingService } from '../../../services/booking.service';
import { EventService } from '../../../services/event.service';
import { WaitlistService } from '../../../services/waitlist.service';
import { AuthService } from '../../../services/auth.service';

@Component({
  selector: 'app-payment-process',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './payment-process.html',
  styleUrls: ['./payment-process.css']
})
export class PaymentProcessComponent {
  paymentMethod: string = 'credit-card';
  cardNumber: string = '';
  expiryDate: string = '';
  cvv: string = '';
  walletProvider: string = 'paypal';

  constructor(
    private router: Router,
    private bookingService: BookingService,
    private eventService: EventService,
    private waitlistService: WaitlistService,
    private authService: AuthService
  ) {}

  processPayment() {
    const booking = this.bookingService.getCurrent();
    if (!booking) {
      alert('No booking found to pay for.');
      return;
    }

    // Simulate payment processing (would call real payment API in production)
    const success = this.eventService.bookSeats(booking.eventId, booking.seats);
    if (!success) {
      alert('Payment failed: one or more selected seats are already taken.');
      return;
    }

    // Mark booking as paid and persist
    this.bookingService.finalizeBooking(booking);

    // Remove user from waitlist for this event if they were on it
    const currentUser = this.authService.getUser();
    if (currentUser) {
      const waitlists = this.waitlistService.getAll();
      const userWaitlist = waitlists.find(w => w.eventId === booking.eventId && w.attendeeEmail === currentUser.email);
      if (userWaitlist) {
        this.waitlistService.removeFromWaitlist(userWaitlist.waitlistId);
      }
    }

    // Navigate to confirmation
    this.router.navigate(['/ticket-confirmation']);
  }
}
