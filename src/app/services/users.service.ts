import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';

import { User } from '../models/user.model';

const API_BASE_URL = 'http://localhost:5000/api';

export function toUser(stored: StoredUser): User {
  if (!stored.role) {
    throw new Error('Stored user has no role');
  }
  return {
    userId: stored.id,
    fullName: stored.fullName,
    email: stored.email,
    password: stored.password,
    phone: stored.phone,
    role: stored.role,
    isFirstLogin: stored.isFirstLogin ?? false,
    isActive: stored.isActive ?? false,
    createdAt: new Date(stored.createdAt),
    updatedAt: new Date(stored.updatedAt),
    organizationName: stored.organizationName,
  };
}

export function toUserOrNull(stored: StoredUser | undefined): User | null {
  return stored ? toUser(stored) : null;
}

export interface StoredUser {
  id: string;
  fullName: string;
  email: string;
  phone?: string;
  password: string;
  status: 'active' | 'inactive' | 'pending';
  role?: 'admin' | 'organizer' | 'attendee';
  isFirstLogin?: boolean;
  isActive?: boolean;
  lastLogin?: string | null;
  createdAt: string;
  updatedAt: string;
  organizationName?: string;
}

@Injectable({ providedIn: 'root' })
export class UsersService {
  private users: StoredUser[] = [];

  constructor(private http: HttpClient) {
    this.seedFromMocks();
    // populate local cache from backend when possible
    this.refreshFromApi();
  }

  private seedFromMocks() {
    const seeded: StoredUser[] = [];
    this.users = seeded;
  }

  private async refreshFromApi(): Promise<void> {
    try {
      const response: any = await firstValueFrom(this.http.get(`${API_BASE_URL}/users`));
      const list = Array.isArray(response) ? response : (response.users ?? []);
      this.users = list.map((u: User) => this.mapApiUserToStoredUser(u));
    } catch (err) {
      console.warn('Failed to refresh users from API, using local cache', err);
    }
  }

  async fetchById(id: string): Promise<StoredUser | undefined> {
    try {
      const response: any = await firstValueFrom(this.http.get(`${API_BASE_URL}/users/${id}`));
      const apiUser = response.user ?? response;
      const stored = this.mapApiUserToStoredUser(apiUser);
      const idx = this.users.findIndex(u => u.id === id);
      if (idx !== -1) this.users[idx] = stored;
      else this.users.push(stored);
      return stored;
    } catch (err) {
      console.warn('Failed to fetch user by id from API', err);
      return this.getById(id);
    }
  }

  findByEmail(email: string) {
    return this.users.find(u => u.email.toLowerCase() === email.toLowerCase());
  }

  getAll(): StoredUser[] {
    return this.users;
  }

  getById(id: string): StoredUser | undefined {
    return this.users.find(u => u.id === id);
  }

  async updateUser(id: string, payload: { fullName?: string; email?: string; phone?: string; organizationName?: string; isActive?: boolean; }): Promise<StoredUser> {
    try {
      const response: any = await firstValueFrom(this.http.put(`${API_BASE_URL}/users/${id}`, payload));
      const apiUser = response.user ?? response;
      const stored = this.mapApiUserToStoredUser(apiUser);
      const idx = this.users.findIndex(u => u.id === id);
      if (idx !== -1) this.users[idx] = stored;
      else this.users.push(stored);
      return stored;
    } catch (err) {
      // fallback to local update if backend fails
      const idx = this.users.findIndex(u => u.id === id);
      if (idx === -1) throw new Error('User not found');
      const now = new Date().toISOString();
      this.users[idx] = {
        ...this.users[idx],
        fullName: payload.fullName ?? this.users[idx].fullName,
        email: payload.email ?? this.users[idx].email,
        phone: payload.phone ?? this.users[idx].phone,
        organizationName: payload.organizationName ?? this.users[idx].organizationName ?? '',
        isActive: payload.isActive ?? this.users[idx].isActive,
        updatedAt: now
      } as StoredUser;
      return this.users[idx];
    }
  }

  async deleteUser(id: string): Promise<void> {
    try {
      await firstValueFrom(this.http.delete(`${API_BASE_URL}/users/${id}`));
      this.users = this.users.filter(u => u.id !== id);
    } catch (err) {
      // fallback to local delete
      this.users = this.users.filter(u => u.id !== id);
    }
  }

  private mapApiUserToStoredUser(apiUser: User, plainPassword?: string): StoredUser {
    const nowIso = new Date().toISOString();
    return {
      id: apiUser.userId ?? apiUser.userId,
      fullName: apiUser.fullName,
      email: apiUser.email,
      phone: apiUser.phone,
      password: plainPassword ?? '', // we generally won’t need this again
      status: 'active',
      role: apiUser.role,
      isFirstLogin: apiUser.isFirstLogin ?? false,
      isActive: apiUser.isActive ?? true,
      createdAt: typeof apiUser.createdAt === 'string'
        ? apiUser.createdAt
        : (apiUser.createdAt ? new Date(apiUser.createdAt).toISOString() : nowIso),
      updatedAt: typeof apiUser.updatedAt === 'string'
        ? apiUser.updatedAt
        : (apiUser.updatedAt ? new Date(apiUser.updatedAt).toISOString() : nowIso),
      organizationName: apiUser.organizationName,
    };
  }

  async register(payload: { 
    fullName: string; 
    email: string; 
    password: string; 
    role?: 'admin' | 'organizer' | 'attendee' 
    
    phone?: string; 
    organization?: string; 
   
  
  }): Promise<StoredUser> {

    const exists = this.users.some(u => u.email.toLowerCase() === payload.email.toLowerCase());
    if (exists) throw new Error('Email already registered');

    try {
      const response = await firstValueFrom(
        this.http.post<{ user: any }>(`${API_BASE_URL}/users/register`, payload)
      );
      const stored = this.mapApiUserToStoredUser(response.user, payload.password);
      this.users.push(stored);
      return stored;
    } catch (error: any) {
      // If backend registration fails, fall back to in-memory so the UI still works
      console.error('Backend registration failed, falling back to local in-memory register:', error);

      const now = new Date().toISOString();
      const user: StoredUser = {
        id: String(Date.now()),
        fullName: payload.fullName,
        email: payload.email,
        phone: payload.phone,
        organization: payload.organization,
        password: payload.password,
        role: payload.role ?? 'attendee',
        status: 'active',
        isFirstLogin: true,
        createdAt: now,
        updatedAt: now
      } as StoredUser;
      this.users.push(user);
      return user;
    }
  }


  async hashPassword(plain: string): Promise<string> {
    const enc = new TextEncoder();
    const data = enc.encode(plain);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
    return hashHex;
  }

  async updatePasswordForUser(userId: string, newPlainPassword: string): Promise<StoredUser> {
    const idx = this.users.findIndex(u => u.id === userId);
    if (idx === -1) throw new Error('User not found');
    try {
      // Send plain password to backend over HTTPS (backend hashes with bcrypt)
      await firstValueFrom(this.http.post(`${API_BASE_URL}/users/${userId}/password`, { password: newPlainPassword }));
      // Do not store plaintext locally; clear or set empty string
      this.users[idx].password = '';
      this.users[idx].isFirstLogin = false;
      this.users[idx].updatedAt = new Date().toISOString();
      return this.users[idx];
    } catch (err) {
      // fallback to local update (store blank instead of plaintext)
      this.users[idx].password = '';
      this.users[idx].isFirstLogin = false;
      this.users[idx].updatedAt = new Date().toISOString();
      return this.users[idx];
    }
  }
}
