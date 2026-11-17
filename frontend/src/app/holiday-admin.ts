import { Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { HttpErrorResponse } from '@angular/common/http';
import { ApiService } from './api.service';
import type { PublicHoliday } from './api.service';

@Component({
  selector: 'app-holiday-admin',
  standalone: true,
  imports: [FormsModule],
  template: `
    <section class="panel">
      <h2>Public holidays</h2>
      <p>These dates are excluded from leave calculations.</p>

      @if (error()) {
        <p class="error" role="alert">{{ error() }}</p>
      }

      @if (success()) {
        <p class="success" role="status">{{ success() }}</p>
      }

      <form #holidayForm="ngForm" (ngSubmit)="save()">
        <fieldset [disabled]="saving() || loading()">
          <label for="holidayName">Holiday name</label>
          <input
            id="holidayName"
            name="holidayName"
            [(ngModel)]="name"
            minlength="2"
            maxlength="100"
            required
          />

          <label for="holidayDate">Date</label>
          <input
            id="holidayDate"
            name="holidayDate"
            type="date"
            [(ngModel)]="date"
            required
          />

          <button
            type="submit"
            [disabled]="holidayForm.invalid || saving() || loading()"
          >
            {{ saving() ? 'Saving…' : 'Add holiday' }}
          </button>
        </fieldset>
      </form>

      <div class="list-heading">
        <h3>Configured holidays</h3>
        <button
          type="button"
          (click)="load()"
          [disabled]="loading() || saving()"
        >
          {{ loading() ? 'Loading…' : 'Refresh' }}
        </button>
      </div>

      <div class="table-scroll">
        <table>
          <thead>
            <tr>
              <th scope="col">Name</th>
              <th scope="col">Date</th>
            </tr>
          </thead>

          <tbody>
            @for (holiday of holidays(); track holiday.date) {
              <tr>
                <td>{{ holiday.name }}</td>
                <td>{{ holiday.date.slice(0, 10) }}</td>
              </tr>
            } @empty {
              <tr>
                <td colspan="2">
                  {{
                    loading()
                      ? 'Loading holidays…'
                      : 'No holidays loaded.'
                  }}
                </td>
              </tr>
            }
          </tbody>
        </table>
      </div>
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
      background: white;
      border: 1px solid #e1e7ef;
      border-radius: 18px;
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
      margin: 24px 0;
      padding: 0;
      border: 0;
    }

    label {
      font-weight: 600;
      font-size: 14px;
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
      font: inherit;
      font-weight: 600;
      cursor: pointer;
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

    .list-heading {
      display: flex;
      justify-content: space-between;
      align-items: center;
      flex-wrap: wrap;
      gap: 12px;
      margin-top: 28px;
    }

    .table-scroll {
      overflow-x: auto;
    }

    table {
      width: 100%;
      border-collapse: collapse;
      text-align: left;
    }

    th,
    td {
      padding: 14px 12px;
      border-bottom: 1px solid #e1e7ef;
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
    }
  `,
})
export class HolidayAdmin implements OnInit {
  private readonly api = inject(ApiService);

  name = '';
  date = '';

  readonly holidays = signal<PublicHoliday[]>([]);
  readonly loading = signal(false);
  readonly saving = signal(false);
  readonly error = signal('');
  readonly success = signal('');

  ngOnInit() {
    this.load();
  }

  load() {
    if (this.loading() || this.saving()) return;

    this.loading.set(true);
    this.error.set('');

    this.api.getHolidays().subscribe({
      next: (holidays) => {
        this.holidays.set(holidays);
        this.loading.set(false);
      },
      error: (error: HttpErrorResponse) => {
        this.loading.set(false);
        this.showError(error);
      },
    });
  }

  save() {
    if (this.saving() || this.loading()) return;

    this.error.set('');
    this.success.set('');

    const name = this.name.trim();

    if (name.length < 2 || name.length > 100 || !this.date) {
      this.error.set('Enter a holiday name and valid date.');
      return;
    }

    this.saving.set(true);

    this.api.createHoliday({ name, date: this.date }).subscribe({
      next: (holiday) => {
        this.holidays.update((holidays) =>
          [...holidays, holiday].sort(
            (a, b) => a.date.localeCompare(b.date),
          ),
        );

        this.name = '';
        this.date = '';
        this.saving.set(false);
        this.success.set('Public holiday added.');
      },
      error: (error: HttpErrorResponse) => {
        this.saving.set(false);
        this.showError(error);
      },
    });
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
            : 'Could not load or save holidays.',
    );
  }
}