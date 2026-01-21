import { Injectable } from '@angular/core';
import { CanActivate, Router, UrlTree, ActivatedRouteSnapshot, RouterStateSnapshot } from '@angular/router';
import { AuthService } from './auth.service';

@Injectable({
  providedIn: 'root'
})
export class AuthGuard implements CanActivate {
  constructor(private auth: AuthService, private router: Router) {}

  canActivate(
    route: ActivatedRouteSnapshot,
    state: RouterStateSnapshot
  ): boolean | UrlTree {
    // Allow navigation when a waitlist token is present in the URL so users
    // coming from an emailed token link can access seat selection without login.
    // The select-seats component will validate the token with the backend.
    if (route && route.queryParams && route.queryParams['token']) {
      return true;
    }
    // If running on server (SSR) allow navigation so server render doesn't redirect
    if (typeof window === 'undefined') return true;
    // Debug: log current auth state and localStorage to diagnose reload redirects
    try {
      console.debug('[AuthGuard] getUser()', this.auth.getUser());
      console.debug('[AuthGuard] localStorage.currentUser', typeof window !== 'undefined' ? localStorage.getItem('currentUser') : null);
    } catch (e) {
      // ignore
    }

    // If service already has user, allow
    if (this.auth.isLoggedIn()) return true;

    // Otherwise, try to restore from localStorage synchronously
    if (typeof window !== 'undefined') {
      const stored = localStorage.getItem('currentUser');
      if (stored) {
        try {
          const user = JSON.parse(stored);
          this.auth.setUser(user);
          return true;
        } catch (err) {
          localStorage.removeItem('currentUser');
        }
      }
    }

    return this.router.createUrlTree(['/login'], { queryParams: { returnUrl: state.url } });
  }
}