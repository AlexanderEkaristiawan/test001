import { Injectable } from '@angular/core';
import { CanActivate, Router, UrlTree, ActivatedRouteSnapshot, RouterStateSnapshot } from '@angular/router';
import { AuthService } from './auth.service';

@Injectable({ providedIn: 'root' })
export class AttendeeGuard implements CanActivate {
  constructor(private auth: AuthService, private router: Router) {}

  canActivate(route: ActivatedRouteSnapshot, state: RouterStateSnapshot): boolean | UrlTree {
    // Allow navigation when a waitlist token is present so emailed links can
    // reach the select-seats page without requiring login. The component will
    // validate the token with the backend.
    if (route && route.queryParams && route.queryParams['token']) {
      return true;
    }
    // If running on server (SSR) allow navigation so server render doesn't redirect
    if (typeof window === 'undefined') return true;

    // Debug: help diagnose reload redirect issues
    try {
      console.debug('[AttendeeGuard] getUser()', this.auth.getUser());
      console.debug('[AttendeeGuard] localStorage.currentUser', localStorage.getItem('currentUser'));
    } catch (e) {
      // noop
    }

    let user = this.auth.getUser();

    // Try to restore from localStorage if not present
    if (!user && typeof window !== 'undefined') {
      const stored = localStorage.getItem('currentUser');
      if (stored) {
        try {
          user = JSON.parse(stored);
          this.auth.setUser(user);
        } catch (err) {
          localStorage.removeItem('currentUser');
        }
      }
    }

    if (user && user.role === 'attendee') return true;
    // Not an attendee -> redirect to appropriate dashboard
    if (user && user.role === 'admin') return this.router.createUrlTree(['/admin']);
    if (user && user.role === 'organizer') return this.router.createUrlTree(['/organizer']);

    // otherwise redirect to login
    return this.router.createUrlTree(['/login'], { queryParams: { returnUrl: state.url } });
  }
}
