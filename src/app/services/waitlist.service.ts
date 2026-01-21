import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { BehaviorSubject, Observable, firstValueFrom } from 'rxjs';
import { map } from 'rxjs/operators';
import { Waitlist } from '../models/waitlist.model';
import { User } from '../models/user.model';

const API_BASE_URL = 'http://localhost:5000/api';

@Injectable({
  providedIn: 'root',
})
export class WaitlistService {
  private waitlistSubject = new BehaviorSubject<Waitlist[]>([]);
  public waitlist$ = this.waitlistSubject.asObservable();

  constructor(private http: HttpClient) {
    this.syncFromBackend();
  }

  private async syncFromBackend(): Promise<void> {
    try {
      const entries = await firstValueFrom(
        this.http.get<Waitlist[]>(`${API_BASE_URL}/waitlist`)
      );
      const mapped: Waitlist[] = entries.map((e: Waitlist) => ({
        ...e,
        joinedAt: e.joinedAt ? new Date(e.joinedAt) : new Date(),
      }));
      this.waitlistSubject.next(mapped);
    } catch (error) {
      console.error('Failed to sync waitlist from backend:', error);
    }
  }

  getWaitlistForUser(user: User): Observable<Waitlist[]> {
    return this.waitlist$.pipe(
      map(waitlist => waitlist.filter(w => w.attendeeEmail === user.email))
    );
  }

  async joinWaitlist(eventId: string, user: User): Promise<Waitlist | null> {
    const currentWaitlist = this.waitlistSubject.value;
    const alreadyExists = currentWaitlist.some(w => w.eventId === eventId && w.attendeeEmail === user.email);
    if (alreadyExists) {
      return null;
    }

    try {
      const payload = {
        eventId,
        attendeeName: user.fullName || 'N/A',
        attendeeEmail: user.email,
      };
      const newEntry = await firstValueFrom(
        this.http.post<Waitlist>(`${API_BASE_URL}/waitlist/join`, payload)
      );

      this.waitlistSubject.next([...currentWaitlist, newEntry]);
      return newEntry;
    } catch (error) {
      console.error('Failed to join waitlist:', error);
      return null;
    }
  }

  async validateToken(token: string): Promise<{ valid: boolean; eventId?: string; seatsOffered?: number }> {
    try {
      const result = await firstValueFrom(
        this.http.get<{ valid: boolean; eventId?: string; seatsOffered?: number }>(`${API_BASE_URL}/waitlist/validate-token?token=${token}`)
      );
      return result;
    } catch (error) {
      console.error('Failed to validate token:', error);
      return { valid: false };
    }
  }

  async removeFromWaitlist(waitlistId: string): Promise<void> {
    const currentWaitlist = this.waitlistSubject.value;
    const updatedWaitlist = currentWaitlist.filter(w => w.waitlistId !== waitlistId);
    this.waitlistSubject.next(updatedWaitlist);

    try {
      await firstValueFrom(
        this.http.delete(`${API_BASE_URL}/waitlist/${waitlistId}`)
      );
    } catch (error) {
      console.error('Failed to remove waitlist entry from backend:', error);
      // Optional: Add the entry back to the subject to revert the optimistic update
      this.waitlistSubject.next(currentWaitlist);
    }
  }

  async claimToken(token: string): Promise<void> {
    try {
      await firstValueFrom(
        this.http.post(`${API_BASE_URL}/waitlist/claim`, { token })
      );
    } catch (error) {
      console.error('Failed to claim waitlist token:', error);
    }
  }

  getAll(): Waitlist[] {
    return this.waitlistSubject.value;
  }
}
