import { Component, ViewChild, ElementRef, OnDestroy, NgZone } from '@angular/core';
import { Router, RouterLink } from '@angular/router'
import { CommonModule } from '@angular/common';
import { BookingService } from '../../../services/booking.service';
import { EventService } from '../../../services/event.service';
import { Booking } from '../../../models/booking.model';

@Component({
  selector: 'app-scan-qr',
  imports: [CommonModule],
  templateUrl: './scan-qr.html',
  styleUrl: './scan-qr.css',
})
export class ScanQrComponent {
  @ViewChild('videoElement', { static: false }) videoRef!: ElementRef<HTMLVideoElement>;
  @ViewChild('canvasElement', { static: false }) canvasRef!: ElementRef<HTMLCanvasElement>;

  scanResult: string = '';
  isScanning: boolean = false;
  validationResult: { valid: boolean; message: string; booking?: Booking } | null = null;

  private stream: MediaStream | null = null;
  private scanInterval: any = null;
  private scanTimeout: any = null;
  scannedOnce: boolean = false;

  constructor(
    private bookingService: BookingService,
    private eventService: EventService,
    private ngZone: NgZone
  ) { }

  async startScanning() {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      alert('Camera not supported in this browser.');
      return;
    }

    // ensure UI updates inside Angular zone
    this.ngZone.run(() => {
      this.isScanning = true;
      this.scanResult = '';
      this.validationResult = null;
    });

    try {
      this.stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
      if (this.videoRef && this.videoRef.nativeElement) {
        this.videoRef.nativeElement.srcObject = this.stream;
        this.videoRef.nativeElement.setAttribute('playsinline', 'true');
        await this.videoRef.nativeElement.play();

        // Start processing frames
        this.scanInterval = setInterval(() => this.processFrame(), 250);
        // If no QR is found within 12s, stop and allow re-scan
        this.scanTimeout = setTimeout(() => this.handleNoCodeFound(), 12000);
      }
    } catch (err) {
      console.error('Error accessing camera:', err);
      try { alert('Unable to access camera'); } catch { }
      this.ngZone.run(() => { this.isScanning = false; });
    }
  }

  onScanButton() {
    if (this.isScanning) return;
    // Clear previous results so UI updates for new scan
    this.scanResult = '';
    this.validationResult = null;
    this.startScanning();
  }

  private async processFrame() {
    try {
      if (!this.videoRef || !this.canvasRef) return;
      const video = this.videoRef.nativeElement;
      const canvas = this.canvasRef.nativeElement;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);

      // Dynamic import of jsQR to keep bundle minimal and avoid build errors if not installed yet
      const jsqrModule: any = await import('jsqr');
      const jsQR = jsqrModule.default || jsqrModule;
      const code = jsQR(imageData.data, imageData.width, imageData.height);
      if (code && code.data) {
        // Found QR code
        // clear timeout since we found a code
        if (this.scanTimeout) { clearTimeout(this.scanTimeout); this.scanTimeout = null; }
        this.handleDecoded(code.data);
      }
    } catch (err) {
      console.error('Error processing frame:', err);
    }
  }

  private handleNoCodeFound() {
    // Called when no QR code is detected within the timeout window
    this.stopScanning();
    this.ngZone.run(() => {
      this.scannedOnce = true;
      this.validationResult = { valid: false, message: 'No QR code detected. Please try again.' };
    });
    try { alert('No QR code detected. Please try again.'); } catch { }
  }

  private async handleDecoded(data: string) {
    // Stop scanning
    this.stopScanning();
    // Support payloads that might be JSON or URLs
    let bookingId = data.trim();
    try {
      const parsed = JSON.parse(bookingId);
      if (parsed && parsed.bookingId) bookingId = String(parsed.bookingId).trim();
    } catch { }
    // If payload looks like a URL, try to extract last path segment or query param
    try {
      if (bookingId.startsWith('http://') || bookingId.startsWith('https://')) {
        const u = new URL(bookingId);
        // try query param bookingId or id
        const q = u.searchParams.get('bookingId') || u.searchParams.get('id');
        if (q) bookingId = q;
        else {
          const parts = u.pathname.split('/').filter(Boolean);
          if (parts.length) bookingId = parts[parts.length - 1];
        }
      }
    } catch { }
    // update UI with result inside zone
    this.ngZone.run(() => { this.scanResult = bookingId; });

    // Lookup booking locally first, otherwise try backend
    let booking = this.bookingService.getBookingById(bookingId);
    if (!booking) {
      booking = await this.bookingService.fetchBookingById(bookingId);
      if (!booking) {
        this.ngZone.run(() => { this.validationResult = { valid: false, message: 'Invalid ticket. Booking ID not found.' }; });
        try { alert('Invalid ticket. Booking ID not found.'); } catch { }
        return;
      }
    }

    // Check paid status
    if (booking.status !== 'paid') {
      this.ngZone.run(() => { this.validationResult = { valid: false, message: 'Ticket not paid. Booking status: ' + booking.status }; });
      try { alert('Ticket not paid. Booking status: ' + booking.status); } catch { }
      return;
    }

    // Prevent double-check locally if already checkedIn
    if ((booking as any).checkedIn) {
      this.ngZone.run(() => { this.validationResult = { valid: false, message: 'Ticket already checked in' }; });
      try { alert('Ticket already checked in'); } catch { }
      return;
    }

    // Check event exists and date not passed
    const event = this.eventService.getEventById(booking.eventId);
    if (!event) {
      this.ngZone.run(() => { this.validationResult = { valid: false, message: 'Event not found for this ticket.' }; });
      try { alert('Event not found for this ticket.'); } catch { }
      return;
    }
    const eventDate = new Date(event.date);
    const now = new Date();
    if (eventDate < now) {
      this.validationResult = { valid: false, message: 'Ticket expired. Event date has passed.' };
      try { alert(this.validationResult.message); } catch { }
      return;
    }

    // Call backend to validate (mark checkedIn)
    try {
      const updated = await this.bookingService.validateBooking(bookingId);
      this.ngZone.run(() => {
        this.validationResult = {
          valid: true,
          message: `Ticket validated! Event: ${event.title}, Attendee: ${booking.fullName}`,
          booking: updated
        };
        // mark that we've scanned at least once
        this.scannedOnce = true;
      });
      // Notify user
      try { alert(`Ticket validated! Event: ${event.title}, Attendee: ${booking.fullName}`); } catch { }
    } catch (err: any) {
      // Extract backend message when possible
      let msg = 'Validation failed';
      if (err && err.error && err.error.message) msg = err.error.message;
      else if (err && err.message) msg = err.message;
      this.ngZone.run(() => { this.validationResult = { valid: false, message: msg }; this.scannedOnce = true; });
      try { alert('Validation failed: ' + msg); } catch { }
    }
  }

  stopScanning() {
    if (this.scanInterval) {
      clearInterval(this.scanInterval);
      this.scanInterval = null;
    }
    if (this.scanTimeout) {
      clearTimeout(this.scanTimeout);
      this.scanTimeout = null;
    }
    if (this.stream) {
      this.stream.getTracks().forEach(t => t.stop());
      this.stream = null;
    }
    if (this.videoRef && this.videoRef.nativeElement) {
      try { this.videoRef.nativeElement.pause(); } catch { }
    }
    // ensure UI update inside Angular zone
    this.ngZone.run(() => { this.isScanning = false; });
  }

  scanAgain() {
    // Reset validation/result and restart scanning
    this.stopScanning();
    this.scanResult = '';
    this.validationResult = null;
    // Small delay to ensure camera is released before reacquiring
    setTimeout(() => this.startScanning(), 250);
  }

  ngOnDestroy(): void {
    this.stopScanning();
  }
}
