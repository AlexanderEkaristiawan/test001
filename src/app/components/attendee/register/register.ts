import { CommonModule } from '@angular/common';
import { Component } from '@angular/core';
import { ReactiveFormsModule, FormGroup, FormControl, Validators } from '@angular/forms';
import { UsersService } from '../../../services/users.service';
import { AuthService } from '../../../services/auth.service';
import { Router, RouterLink } from '@angular/router';

@Component({
  selector: 'app-register',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, RouterLink],
  templateUrl: './register.html',
  styleUrls: ['./register.css']
})
export class RegisterComponent {
  registerForm = new FormGroup({
    fullName: new FormControl('', [Validators.required]),
    email: new FormControl('', [Validators.required, Validators.email]),
    password: new FormControl('', [Validators.required, Validators.minLength(6)])
  });

  error = '';
  loading = false;

  constructor(private users: UsersService, private auth: AuthService, private router: Router) {}


  async onSubmit() {
    this.error = '';
    if (this.registerForm.invalid) return;

    this.loading = true;
    try {
      const { fullName, email, password } = this.registerForm.value as { fullName: string; email: string; password: string };
      
      const user = await this.users.register({ fullName, email, password, role: 'attendee' });
      // Log in the new user to ensure session is fully initialized
      await this.auth.login(email, password);
      // Redirect to browse events for booking
      this.router.navigateByUrl('/browse-events');
    } catch (err: any) {
      this.error = err?.message || 'Registration failed';
    } finally {
      this.loading = false;
    }
  }
}
