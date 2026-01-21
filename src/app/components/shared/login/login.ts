import { Component } from '@angular/core';
import { Router, ActivatedRoute, RouterLink } from '@angular/router';
import { AuthService } from '../../../services/auth.service';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormBuilder, FormGroup, Validators } from '@angular/forms';


@Component({
  selector: 'app-login',
  templateUrl: './login.html',
  styleUrls: ['./login.css'],
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, RouterLink],
})
export class LoginComponent {
  loginForm: FormGroup;
  error = '';

  constructor(
    private fb: FormBuilder,
    private auth: AuthService,
    private router: Router,
    private route: ActivatedRoute
  ) {
    this.loginForm = this.fb.group({
      email: ['', [Validators.required, Validators.email]],
      password: ['', Validators.required],
    });
  }

  async onSubmit() {
    if (this.loginForm.invalid) return;
    const { email, password } = this.loginForm.value;
    try {
      const user = await this.auth.login(email, password);
      const returnUrl = this.route.snapshot.queryParams['returnUrl'] || '/';
      // If admin -> go to admin dashboard
      if (user.role === 'admin') {
        this.router.navigateByUrl('/admin');
        return;
      }
      // If organizer and first login, force set-password flow
      if (user.role === 'organizer' && user.isFirstLogin) {
        this.router.navigate(['/set-password'], { queryParams: { returnUrl } });
        return;
      }
      if (user.role === 'organizer' && user.isFirstLogin === false) {
        this.router.navigate(['/organizer'], { queryParams: { returnUrl } });
        return;
      }
      
      if (user.role === 'attendee') {
        this.router.navigate(['/'], { queryParams: { returnUrl } });
        return;
      }
      
      // default
      this.router.navigateByUrl(returnUrl);
    } catch (err: any) {
      this.error = err.message || 'Login failed';

      alert(this.error || "Login failed. Please try again.");
    }
  }
}
