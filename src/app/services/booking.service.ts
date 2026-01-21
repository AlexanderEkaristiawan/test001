import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { BehaviorSubject, firstValueFrom } from 'rxjs';
import { Booking } from '../models/booking.model';

const API_BASE_URL = 'http://localhost:5000/api';

@Injectable({ providedIn: 'root' })
export class BookingService {
  private bookingsSubject = new BehaviorSubject<Booking[]>([]);
  public bookings$ = this.bookingsSubject.asObservable();

  private currentSubject = new BehaviorSubject<Booking | null>(null);
  public current$ = this.currentSubject.asObservable();

  constructor(private http: HttpClient) {
    this.syncFromBackend();
    this.restoreCurrent();
  }

  // Public: force-refresh bookings from backend
  public async refreshFromBackend(): Promise<void> {
    try {
      await this.syncFromBackend();
    } catch (err) {
      console.error('Failed to refresh bookings from backend:', err);
    }
  }

  private writeBookings(list: Booking[]) {
    this.bookingsSubject.next(list);
  }

  private writeCurrent(b: Booking | null) {
    this.currentSubject.next(b);
    if (typeof window !== 'undefined') {
      try {
        if (b) {
          localStorage.setItem('currentBooking', JSON.stringify(b));
        } else {
          localStorage.removeItem('currentBooking');
        }
      } catch {}
    }
  }

  private async syncFromBackend(): Promise<void> {
    try {
      const apiBookings = await firstValueFrom(
        this.http.get<Booking[]>(`${API_BASE_URL}/bookings`)
      );
      // Backend stores the same shape; just overwrite local cache
      this.writeBookings(apiBookings);
    } catch (error) {
      // If backend is unreachable, keep using local-only data
      console.error('Failed to sync bookings from backend:', error);
    }
  }

  private async saveToBackend(booking: Booking): Promise<void> {
    try {
      await firstValueFrom(
        this.http.post<Booking>(`${API_BASE_URL}/bookings`, booking)
      );
    } catch (error) {
      console.error('Failed to persist booking to backend:', error);
    }
  }

  setCurrent(booking: Booking) {
    this.writeCurrent(booking);
  }

  getCurrent(): Booking | null {
    return this.currentSubject.value;
  }

  clearCurrent() {
    this.writeCurrent(null);
  }

  public restoreCurrent(): void {
    if (typeof window === 'undefined') return;
    try {
      const stored = localStorage.getItem('currentBooking');
      if (!stored) return;
      const parsed = JSON.parse(stored);
      this.writeCurrent(parsed);
    } catch {
      localStorage.removeItem('currentBooking');
    }
  }

  async saveBooking(booking: Booking) {
    const list = this.bookingsSubject.value.slice();
    const now = new Date().toISOString();
    booking.updatedAt = now;
    if (!booking.createdAt) booking.createdAt = now;
    const idx = list.findIndex(b => b.id === booking.id);
    if (idx === -1) list.push(booking);
    else list[idx] = booking;
    this.writeBookings(list);

    // Persist to backend (fire-and-forget for the caller)
    this.saveToBackend(booking);
  }

  finalizeBooking(booking: Booking) {
    booking.status = 'paid';
    booking.updatedAt = new Date().toISOString();
    this.saveBooking(booking);
    // clear current booking
    this.clearCurrent();
  }

  // Synchronous helper for admin dashboard and reports
  getAll(): Booking[] {
    return this.bookingsSubject.value;
  }

  cancelBooking(bookingId: string): boolean {
    // Fixed: Use the existing value instead of calling non-existent method
    const list = this.bookingsSubject.value.slice();
    // Fixed: Add proper type annotation for the callback parameter
    const booking = list.find((b: Booking) => b.id === bookingId);
    if (!booking) return false;
    
    booking.status = 'cancelled';
    booking.updatedAt = new Date().toISOString();
    this.writeBookings(list);

    // Also update on backend
    this.saveToBackend(booking);
    return true;
  }

  getBookingById(bookingId: string): Booking | undefined {
    // Fixed: Add proper type annotation for the callback parameter
    return this.bookingsSubject.value.find((b: Booking) => b.id === bookingId);
  }

  async fetchBookingById(bookingId: string): Promise<Booking | undefined> {
    try {
      const apiBooking = await firstValueFrom(this.http.get<Booking>(`${API_BASE_URL}/bookings/${bookingId}`));
      // update cache
      const list = this.bookingsSubject.value.slice();
      const idx = list.findIndex(b => b.id === bookingId);
      if (idx !== -1) list[idx] = apiBooking;
      else list.push(apiBooking);
      this.writeBookings(list);
      return apiBooking;
    } catch (err) {
      console.warn('Failed to fetch booking from backend:', err);
      return undefined;
    }
  }

  async validateBooking(bookingId: string): Promise<Booking> {
    try {
      const updated = await firstValueFrom(this.http.post<Booking>(`${API_BASE_URL}/bookings/${bookingId}/validate`, {}));
      // Update local cache
      const list = this.bookingsSubject.value.slice();
      const idx = list.findIndex(b => b.id === bookingId);
      if (idx !== -1) list[idx] = updated;
      else list.push(updated);
      this.writeBookings(list);
      return updated;
    } catch (err) {
      console.error('Failed to validate booking:', err);
      throw err;
    }
  }
}
