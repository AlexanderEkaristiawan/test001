import { Component, OnInit, signal } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { HeaderComponent } from './components/layout/header/header';
import { FooterComponent } from './components/layout/footer/footer';
import { AuthService } from './services/auth.service';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterOutlet, HeaderComponent, FooterComponent, CommonModule],
  templateUrl: './app.html',
  styleUrl: './app.css'
})
export class App implements OnInit {
  protected readonly title = signal('EMS');

  constructor(
    private authService: AuthService,
    private router: Router
  ) {}

  ngOnInit() {
    // AuthService restores user from localStorage in its constructor.
    console.log('App initialized. Auth user:', this.authService.getUser());

    // Subscribe to user changes for debugging or UI updates.
    this.authService.currentUser$.subscribe(user => {
      console.log('Auth user changed:', user);
    });
  }
}