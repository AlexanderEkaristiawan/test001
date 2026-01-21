import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { UsersService, toUser } from '../../../services/users.service';
import { ReactiveFormsModule, FormBuilder, Validators, FormGroup } from '@angular/forms';
import { User } from '../../../models/user.model';

@Component({
  selector: 'app-admin-organizer-detail',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, RouterLink],
  templateUrl: './admin-organizer-detail.html',
  styleUrl: './admin-organizer-detail.css'
})
export class AdminOrganizerDetailComponent {
  organizer: User | null = null;
  editMode = false;
  form: FormGroup;
  message = '';
  error = '';

  constructor(private route: ActivatedRoute, private users: UsersService, private fb: FormBuilder, private router: Router) {
    const id = this.route.snapshot.paramMap.get('id');
    if (id) {
      const stored = this.users.getById(id);
      this.organizer = stored ? toUser(stored) : null;
      if (!this.organizer) {
        // attempt to fetch from API if not present in local cache
        this.loadOrganizer(id);
      }
    }
    this.form = this.fb.group({
      fullName: ['', [Validators.required]],
      email: ['', [Validators.required, Validators.email]],
      phone: ['', [Validators.pattern(/^[+]?[(]?[0-9]{1,4}[)]?[-\s.]?[(]?[0-9]{1,4}[)]?[-\s.]?[0-9]{1,9}$/)]],
      organizationName: ['']
    });
  }

  private async loadOrganizer(id: string) {
    try {
      const u = await this.users.fetchById(id);
      this.organizer = u ? toUser(u) : null;
    } catch (err) {
      console.warn('Could not load organizer', err);
    }
  }

  enableEdit() {
    if (!this.organizer) return;
    this.editMode = true;
    this.form.patchValue({
      fullName: this.organizer.fullName || '',
      email: this.organizer.email || '',
      phone: this.organizer.phone || '',
      organizationName: (this.organizer as User & { organizationName?: string }).organizationName || ''
    });
  }

  async save() {
    this.message = '';
    this.error = '';
    if (this.form.invalid) { this.error = 'Please fix the form'; return; }
    if (!this.organizer) return;
    try {
      const vals = this.form.value;
      const updated = await this.users.updateUser(this.organizer.userId, {
        fullName: vals.fullName || '',
        email: vals.email || '',
        phone: vals.phone || '',
        organizationName: vals.organizationName || ''
      });
      this.organizer = toUser(updated);
      this.editMode = false;
      this.message = 'Organizer updated';
    } catch (err) {
      this.error = (err instanceof Error) ? err.message : 'Update failed';
    }
  }

  confirmDelete() {
    if (!this.organizer) return;
    const ok = confirm('Delete organizer "' + this.organizer.fullName + '"? This cannot be undone.');
    if (!ok) return;
    try {
      this.users.deleteUser(this.organizer.userId).then(() => {
        this.router.navigateByUrl('/admin/organizers');
      }).catch((err) => {
        this.error = (err instanceof Error) ? err.message : 'Delete failed';
      });
    } catch (err) {
      this.error = (err instanceof Error) ? err.message : 'Delete failed';
    }
  }
}
