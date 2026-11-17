import {
  Component,
  OnInit,
  inject,
  output,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { HttpErrorResponse } from '@angular/common/http';
import { forkJoin } from 'rxjs';
import { ApiService } from './api.service';
import type { LeaveType } from './api.service';

@Component({
  selector: 'app-admin-settings',
  standalone: true,
  imports: [FormsModule],
  template: `
    <section class="panel">
      <h2>Administration</h2>
      <p>Manage leave rules, types, and yearly allowances.</p>

      @if (error()) {
        <p class="error" role="alert">{{ error() }}</p>
      }

      @if (success()) {
        <p class="success" role="status">{{ success() }}</p>
      }

      @if (loading()) {
        <p role="status">Loading configuration…</p>
      } @else if (!ready()) {
        <button type="button" (click)="load()">Retry</button>
      } @else {
        <h3>Leave rules</h3>

        <form #settingsForm="ngForm" (ngSubmit)="saveSettings()">
          <fieldset [disabled]="saving()">
            <label for="noticeDays">
              Minimum notice in calendar days
            </label>
            <input
              id="noticeDays"
              name="noticeDays"
              type="number"
              [(ngModel)]="minimumNoticeDays"
              min="0"
              step="1"
              required
            />

            <label for="teamLimit">
              Maximum team members off per day
            </label>
            <input
              id="teamLimit"
              name="teamLimit"
              type="number"
              [(ngModel)]="maxTeamMembersOff"
              min="1"
              step="1"
              required
            />

            <button
              type="submit"
              [disabled]="settingsForm.invalid || saving()"
            >
              {{ saving() ? 'Saving…' : 'Save rules' }}
            </button>
          </fieldset>
        </form>

        <h3 class="section-heading">Yearly allowances</h3>

        @for (type of leaveTypes(); track type.id) {
          <form
            class="allowance-form"
            #allowanceForm="ngForm"
            (ngSubmit)="saveAllowance(type)"
          >
            <label [for]="'allowance-' + type.id">
              {{ type.name }}
            </label>

            <input
              [id]="'allowance-' + type.id"
              [name]="'allowance-' + type.id"
              type="number"
              [(ngModel)]="type.yearlyAllowance"
              min="0"
              step="1"
              required
              [disabled]="saving()"
            />

            <button
              type="submit"
              [disabled]="allowanceForm.invalid || saving()"
            >
              Save
            </button>
          </form>
        }

        <h3 class="section-heading">Add leave type</h3>

        <form #typeForm="ngForm" (ngSubmit)="addLeaveType()">
          <fieldset [disabled]="saving()">
            <label for="newTypeName">Name</label>
            <input
              id="newTypeName"
              name="newTypeName"
              [(ngModel)]="newTypeName"
              minlength="2"
              maxlength="60"
              required
            />

            <label for="newTypeAllowance">Yearly allowance</label>
            <input
              id="newTypeAllowance"
              name="newTypeAllowance"
              type="number"
              [(ngModel)]="newTypeAllowance"
              min="0"
              step="1"
              required
            />

            <button
              type="submit"
              [disabled]="typeForm.invalid || saving()"
            >
              {{ saving() ? 'Saving…' : 'Add leave type' }}
            </button>
          </fieldset>
        </form>
      }
    </section>
  `,
  styles: `
    :host {
      display: block;
      margin-top: 28px;
    }

    * {
      box-sizing: border-box;
    }

    .panel {
      padding: 28px;
      border: 1px solid #e1e7ef;
      border-radius: 18px;
      background: white;
    }

    h2 {
      margin-top: 0;
    }

    p {
      color: #627088;
      line-height: 1.6;
    }

    fieldset {
      display: grid;
      gap: 12px;
      max-width: 560px;
      min-width: 0;
      margin: 0;
      padding: 0;
      border: 0;
    }

    label {
      font-size: 14px;
      font-weight: 600;
    }

    input {
      min-width: 0;
      padding: 12px;
      border: 1px solid #cbd4e1;
      border-radius: 8px;
      font: inherit;
    }

    button {
      padding: 12px 18px;
      border: 0;
      border-radius: 8px;
      background: #4263eb;
      color: white;
      cursor: pointer;
      font: inherit;
      font-weight: 600;
    }

    button:disabled {
      opacity: 0.6;
      cursor: default;
    }

    input:focus-visible,
    button:focus-visible {
      outline: 3px solid #a7b8ff;
      outline-offset: 3px;
    }

    .section-heading {
      margin-top: 32px;
    }

    .allowance-form {
      display: grid;
      grid-template-columns: minmax(80px, 1fr) minmax(80px, 140px) auto;
      align-items: center;
      gap: 12px;
      max-width: 560px;
      margin-top: 12px;
    }

    .error,
    .success {
      padding: 14px;
      border-radius: 8px;
    }

    .error {
      background: #fff0f0;
      color: #a32222;
    }

    .success {
      background: #eaf8ef;
      color: #21643b;
    }

    @media (max-width: 600px) {
      .panel {
        padding: 20px;
      }

      .allowance-form {
        grid-template-columns: 1fr;
      }
    }
  `,
})
export class AdminSettings implements OnInit {
  private readonly api = inject(ApiService);

  readonly changed = output<void>();

  readonly loading = signal(false);
  readonly ready = signal(false);
  readonly saving = signal(false);
  readonly error = signal('');
  readonly success = signal('');
  readonly leaveTypes = signal<LeaveType[]>([]);

  minimumNoticeDays = 2;
  maxTeamMembersOff = 2;

  newTypeName = '';
  newTypeAllowance = 0;

  ngOnInit() {
    this.load();
  }

  load() {
    if (this.loading() || this.saving()) return;

    this.loading.set(true);
    this.ready.set(false);
    this.error.set('');

    forkJoin({
      settings: this.api.getSettings(),
      types: this.api.getLeaveTypes(),
    }).subscribe({
      next: ({ settings, types }) => {
        this.minimumNoticeDays =
          settings?.minimumNoticeDays ?? 2;
        this.maxTeamMembersOff =
          settings?.maxTeamMembersOff ?? 2;

        this.leaveTypes.set(types);
        this.loading.set(false);
        this.ready.set(true);
      },
      error: (error: HttpErrorResponse) => {
        this.loading.set(false);
        this.showError(error);
      },
    });
  }

  saveSettings() {
    if (this.saving()) return;

    this.clearMessages();

    if (
      !Number.isInteger(this.minimumNoticeDays) ||
      this.minimumNoticeDays < 0 ||
      !Number.isInteger(this.maxTeamMembersOff) ||
      this.maxTeamMembersOff < 1
    ) {
      this.error.set(
        'Notice must be a whole number of at least 0; team limit at least 1.',
      );
      return;
    }

    this.saving.set(true);

    this.api.updateSettings({
      minimumNoticeDays: this.minimumNoticeDays,
      maxTeamMembersOff: this.maxTeamMembersOff,
    }).subscribe({
      next: (settings) => {
        this.minimumNoticeDays = settings.minimumNoticeDays;
        this.maxTeamMembersOff = settings.maxTeamMembersOff;
        this.saving.set(false);
        this.success.set('Leave rules saved.');
        this.changed.emit();
      },
      error: (error: HttpErrorResponse) => {
        this.saving.set(false);
        this.showError(error);
      },
    });
  }

  saveAllowance(type: LeaveType) {
    if (this.saving()) return;

    this.clearMessages();

    if (
      !Number.isInteger(type.yearlyAllowance) ||
      type.yearlyAllowance < 0
    ) {
      this.error.set(
        'Allowance must be a whole number of at least 0.',
      );
      return;
    }

    this.saving.set(true);

    this.api.updateAllowance(
      type.id,
      type.yearlyAllowance,
    ).subscribe({
      next: (updated) => {
        this.leaveTypes.update((types) =>
          types.map((item) =>
            item.id === updated.id ? updated : item,
          ),
        );

        this.saving.set(false);
        this.success.set(`${updated.name} allowance saved.`);
        this.changed.emit();
      },
      error: (error: HttpErrorResponse) => {
        this.saving.set(false);
        this.showError(error);
      },
    });
  }

  addLeaveType() {
    if (this.saving()) return;

    this.clearMessages();

    const name = this.newTypeName.trim();

    if (name.length < 2 || name.length > 60) {
      this.error.set('Enter a name of 2 to 60 characters.');
      return;
    }

    if (
      !Number.isInteger(this.newTypeAllowance) ||
      this.newTypeAllowance < 0
    ) {
      this.error.set(
        'Allowance must be a whole number of at least 0.',
      );
      return;
    }

    this.saving.set(true);

    this.api.createLeaveType({
      name,
      yearlyAllowance: this.newTypeAllowance,
    }).subscribe({
      next: (created) => {
        this.leaveTypes.update((types) =>
          [...types, created].sort((a, b) =>
            a.name.localeCompare(b.name),
          ),
        );

        this.newTypeName = '';
        this.newTypeAllowance = 0;
        this.saving.set(false);
        this.success.set(`${created.name} leave type created.`);
        this.changed.emit();
      },
      error: (error: HttpErrorResponse) => {
        this.saving.set(false);
        this.showError(error);
      },
    });
  }

  private clearMessages() {
    this.error.set('');
    this.success.set('');
  }

  private showError(error: HttpErrorResponse) {
    const message = error.error?.message;

    this.error.set(
      error.status === 0
        ? 'Cannot reach the backend.'
        : Array.isArray(message)
          ? message.join(', ')
          : typeof message === 'string'
            ? message
            : 'Could not load or save configuration.',
    );
  }
}