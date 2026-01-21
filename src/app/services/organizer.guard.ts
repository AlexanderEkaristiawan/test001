import { Injectable } from '@angular/core';
import { CanActivate, Router, UrlTree, ActivatedRouteSnapshot, RouterStateSnapshot } from '@angular/router';
import { AuthService } from './auth.service';

@Injectable({ providedIn: 'root' })
export class OrganizerGuard implements CanActivate {
  constructor(private auth: AuthService, private router: Router) {}

  canActivate(route: ActivatedRouteSnapshot, state: RouterStateSnapshot): boolean | UrlTree {
    // If running on server (SSR) allow navigation so server render doesn't redirect
    if (typeof window === 'undefined') return true;

    let user = this.auth.getUser();
    if (!user) {
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

    if (user && user.role === 'organizer') return true;
    // not authorized -> redirect to login
    return this.router.createUrlTree(['/login'], { queryParams: { returnUrl: state.url } });
  }
}
