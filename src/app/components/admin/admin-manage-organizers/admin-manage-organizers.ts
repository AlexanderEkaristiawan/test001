import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink, RouterOutlet, Router } from '@angular/router'; 
import { ReactiveFormsModule, FormBuilder, Validators, FormGroup } from '@angular/forms';
import { UsersService } from '../../../services/users.service';
import emailjs from '@emailjs/browser';

@Component({
  selector: 'app-admin-manage-organizers',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, RouterLink],
  templateUrl: './admin-manage-organizers.html',
  styleUrl: './admin-manage-organizers.css'
})
export class AdminManageOrganizersComponent {
  form: FormGroup;
  message = '';
  error = '';

  constructor(
    private fb: FormBuilder,
    private users: UsersService, 
    private router: Router
    
  ) {
    this.form = this.fb.group({
      fullName: ['', [Validators.required]],
      email: ['', [Validators.required, Validators.email]],
      phone: ['', [Validators.pattern(/^[+]?[(]?[0-9]{1,4}[)]?[-\s.]?[(]?[0-9]{1,4}[)]?[-\s.]?[0-9]{1,9}$/)]],
      organizationName: ['']
    });

    emailjs.init('WaZyBZGWRGXCC0N29');
  }

  get organizers() {
    return this.users.getAll().filter(u => u.role === 'organizer');
  }

  async submit() {
    this.message = '';
    this.error = '';
    if (this.form.invalid) {
      this.error = 'Please fill required fields';
      return;
    }
    try {
      
      const vals = this.form.value;
      
      const created = await this.users.register({
        fullName: vals.fullName || '',
        email: vals.email || '',
        phone: vals.phone || '',
        role: 'organizer',
        organization: vals.organizationName || '',
        password: "org123",
      });


      // 2️⃣ Send Email via EmailJS
      await emailjs.send(
        'service_q8p7exa',
        'template_lrhut2q',
        {
          name: vals.fullName || '',
          email: vals.email || '',
          orgname: vals.organizationName || '',
          phone: vals.phone || '',
          pass: 'org123'
        }
      );

      this.message = 'Organizer created and email sent!';
      this.form.reset();

      // 3️⃣ Redirect to detail page
      this.router.navigate(['/admin/organizers', created.id]);


      // redirect admin immediately to the new organizer detail
      this.form.reset();
      this.router.navigate(['/admin/organizers', created.id]);
    } catch (err) {
      this.error = (err instanceof Error) ? err.message : 'Failed to create organizer';
    }
  }

  deleteOrganizer(id: string) {
    this.message = '';
    this.error = '';
    const ok = confirm('Delete this organizer? This cannot be undone.');
    if (!ok) return;
    try {
      this.users.deleteUser(id).then(() => {
        this.message = 'Organizer deleted';
      }).catch((err) => {
        this.error = (err instanceof Error) ? err.message : 'Failed to delete organizer';
      });
    } catch (err) {
      this.error = (err instanceof Error) ? err.message : 'Failed to delete organizer';
    }
  }
}
