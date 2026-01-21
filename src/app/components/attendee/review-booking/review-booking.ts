import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { BookingService } from '../../../services/booking.service';
import { Booking } from '../../../models/booking.model';

@Component({
  selector: 'app-review-booking',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './review-booking.html',
  styleUrls: ['./review-booking.css']
})
export class ReviewBookingComponent {
  bookingDetails: Booking | null = null;

  constructor(private bookingService: BookingService, private router: Router) {
    this.bookingDetails = this.bookingService.getCurrent();
  }

  goToPayment() {
    this.router.navigateByUrl('/payment-process');
  }
}
