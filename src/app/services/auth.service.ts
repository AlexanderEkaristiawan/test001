import { Injectable, Inject, PLATFORM_ID } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { BehaviorSubject, firstValueFrom } from 'rxjs';
import { toUser, UsersService } from './users.service';
import { User } from '../models/user.model';

const API_BASE_URL = 'http://localhost:5000/api';

@Injectable({ providedIn: 'root' })
export class AuthService {
  private currentUserSubject = new BehaviorSubject<User | null>(null);
  public currentUser$ = this.currentUserSubject.asObservable();

  constructor(
    private usersService: UsersService,
    private http: HttpClient,
    @Inject(PLATFORM_ID) private platformId: Object
  ) {
    this.initFromStorage();
  }

  initFromStorage(): void {
    if (isPlatformBrowser(this.platformId)) {
      const storedUser = localStorage.getItem('currentUser');
      if (storedUser) {
        try {
          this.currentUserSubject.next(JSON.parse(storedUser));
        } catch {
          localStorage.removeItem('currentUser');
        }
      }
    }
  }

  private mapApiUserToUser(apiUser: any): User {
    return {
      userId: apiUser.userId ?? apiUser.id,
      fullName: apiUser.fullName,
      email: apiUser.email,
      phone: apiUser.phone,
      role: apiUser.role,
      organizationName: apiUser.organizationName,
      password: '',
      isFirstLogin: apiUser.isFirstLogin ?? false,
      isActive: apiUser.isActive ?? true,
      createdAt: apiUser.createdAt ? new Date(apiUser.createdAt) : new Date(),
      updatedAt: apiUser.updatedAt ? new Date(apiUser.updatedAt) : new Date(),
    };
  }

  async login(email: string, password: string): Promise<User> {
    if (!email || !password) {
      throw new Error('Invalid credentials');
    }

    try {
      const response = await firstValueFrom(
        this.http.post<{ user: any }>(`${API_BASE_URL}/users/login`, { email, password })
      );
      const user = this.mapApiUserToUser(response.user);
      this.currentUserSubject.next(user);
      if (isPlatformBrowser(this.platformId)) {
        localStorage.setItem('currentUser', JSON.stringify(user));
      }
      return user;
    } catch (err) {
      console.warn('Backend login failed or user not found, falling back to local mock users.', err);
    }

    const stored = this.usersService.findByEmail(email);
    if (!stored) {
      throw new Error('User not found');
    }

    const passwordMatch = stored.password === password;
    if (!passwordMatch) {
      throw new Error('Invalid credentials');
    }

    const user = toUser(stored);
    this.currentUserSubject.next(user);
    if (isPlatformBrowser(this.platformId)) {
      localStorage.setItem('currentUser', JSON.stringify(user));
    }
    return user;
  }

  setUser(user: User | null) {
    console.debug('[AuthService] setUser', user);
    this.currentUserSubject.next(user);
    if (isPlatformBrowser(this.platformId)) {
      if (user) {
        localStorage.setItem('currentUser', JSON.stringify(user));
      } else {
        localStorage.removeItem('currentUser');
      }
    }
  }

  logout(): void {
    console.debug('[AuthService] logout');
    this.currentUserSubject.next(null);
    if (isPlatformBrowser(this.platformId)) {
      localStorage.removeItem('currentUser');
    }
  }

  getUser(): User | null {
    return this.currentUserSubject.value;
  }

  isLoggedIn(): boolean {
    return !!this.currentUserSubject.value;
  }
}
