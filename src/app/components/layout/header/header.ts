import { Component, OnDestroy } from '@angular/core';
import { Router, RouterModule } from '@angular/router';
import { CommonModule } from '@angular/common';
import { AuthService} from '../../../services/auth.service';
import { Subscription } from 'rxjs';
import { User } from '../../../models/user.model';

@Component({
  selector: 'app-header',
  standalone: true,
  imports: [RouterModule, CommonModule],
  templateUrl: './header.html',
  styleUrls: ['./header.css']
})
export class HeaderComponent implements OnDestroy {
  currentUser: User | null = null;
  private sub: Subscription;

  constructor(private auth: AuthService, private router: Router) {
    this.sub = this.auth.currentUser$.subscribe(u => this.currentUser = u);
  }

  logout() {
    this.auth.logout();
    this.router.navigateByUrl('/');
  }

  ngOnDestroy(): void {
    this.sub?.unsubscribe();
  }
}
