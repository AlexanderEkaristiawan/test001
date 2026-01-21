import { Component, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { BookingService } from '../../../services/booking.service';
import { Subscription } from 'rxjs';
import { Booking } from '../../../models/booking.model';
import emailjs from '@emailjs/browser';
import { FormBuilder, FormGroup } from '@angular/forms';
import { ReactiveFormsModule } from '@angular/forms';
import { AuthService } from '../../../services/auth.service';
import { SeatSelection } from '../../../models/seat-selection.model';

@Component({
  selector: 'app-ticket-confirmation',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule],
  templateUrl: './ticket-confirmation.html',
  styleUrls: ['./ticket-confirmation.css'],
})
export class TicketConfirmationComponent implements OnDestroy {
  emailStatus: 'sent' | 'error' | null = null;

  ticketDetails: {eventName: String, bookingId: String, seats: SeatSelection[], qrCodeUrl: String } | null = null;
        

  lastBooking: Booking | null = null;
  sub: Subscription | null = null;

  form!: FormGroup;

  constructor(
    private bookingService: BookingService,
    private fb: FormBuilder,
    private auth: AuthService
  ) {
    emailjs.init('WaZyBZGWRGXCC0N29');

    this.form = this.fb.group({
      name: [''],
      email: [''],
    });

    const user = this.auth.getUser();
    if (user?.email) {
      this.form.patchValue({
        email: user.email,
      });
    }

    this.sub = this.bookingService.bookings$.subscribe((list) => {
      if (list && list.length) {
        const last = list[list.length - 1];
        this.lastBooking = last;
        this.ticketDetails = {
          eventName: last.eventName,
          bookingId: last.id,
          seats: last.seats || [],
          qrCodeUrl: `https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=${encodeURIComponent(
            last.id
          )}`,
        };

        this.form.patchValue({
          name: `Booking-${last.id}`,
        });
      }
    });
  }

  ngOnDestroy(): void {
    if (this.sub) this.sub.unsubscribe();
  }

  async send() {
    const booking = this.lastBooking;

    if (!booking) {
      alert('No booking found.');
      return;
    }

    try {
      const qrCodeUrl = `${encodeURIComponent(
        booking.id
      )}`;

      await emailjs.send('service_q8p7exa', 'template_ox9fi5d', {
        order_id: booking.id,
        orders: booking.seats.length,
        name: booking.eventName,
        units: booking.seats.length,
        price: booking.subtotal,
        cost: booking.finalPrice,
        email: booking.email,
        qr_code_data: qrCodeUrl,
      });

      alert('Ticket has been sent to your email!');
    } catch (error) {
      console.error(error);
      alert('Failed to send ticket email.');
    }
  }
}