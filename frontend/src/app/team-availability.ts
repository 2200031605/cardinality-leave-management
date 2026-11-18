import {
  Component,
  DestroyRef,
  inject,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { HttpErrorResponse } from '@angular/common/http';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ApiService } from './api.service';
import type { TeamAvailability } from './api.service';

const DAY = 86_400_000;

function todayText(): string {
  const now = new Date();

  return [
    String(now.getFullYear()).padStart(4, '0'),
    String(now.getMonth() + 1).padStart(2, '0'),
    String(now.getDate()).padStart(2, '0'),
  ].join('-');
}

function parseDate(value: string): number | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return null;
  }

  const date = new Date(`${value}T00:00:00.000Z`);
  const time = date.getTime();

  if (
    !Number.isFinite(time) ||
    date.toISOString().slice(0, 10) !== value
  ) {
    return null;
  }

  return time;
}

@Component({
  selector: 'app-team-availability',
  standalone: true,
  imports: [FormsModule],
  template: `
    <section class="availability" aria-labelledby="availability-title">
      <header>
        <div>
          <h2 id="availability-title">Team availability</h2>
          <p>
            Check your team's availability for up to 31 days.
            Pending leave reserves availability.
          </p>
        </div>
      </header>

      <form #availabilityForm="ngForm" (ngSubmit)="load()">
        <div>
          <label for="availability-start">From</label>
          <input
            id="availability-start"
            name="availabilityStart"
            type="date"
            [(ngModel)]="startDate"
            min="1900-01-01"
            max="9999-12-31"
            required
            [disabled]="loading()"
          />
        </div>

        <div>
          <label for="availability-end">To</label>
          <input
            id="availability-end"
            name="availabilityEnd"
            type="date"
            [(ngModel)]="endDate"
            [min]="startDate || '1900-01-01'"
            max="9999-12-31"
            required
            [disabled]="loading()"
          />
        </div>

        <button
          type="submit"
          [disabled]="availabilityForm.invalid || loading()"
        >
          {{ loading() ? 'Loading…' : 'Check availability' }}
        </button>
      </form>

      @if (error()) {
        <p class="error" role="alert">{{ error() }}</p>
      }

      @if (loading()) {
        <p role="status">Loading team availability…</p>
      }

      @if (result(); as summary) {
        <p class="summary" role="status">
          {{ summary.startDate }} → {{ summary.endDate }}
          · {{ summary.totalMembers }} team members
          · {{ summary.workingDays }} working days
        </p>

        <p class="hint">
          Availability is based on recorded leave.
          Weekends and public holidays are non-working days.
        </p>

        <div
          class="table-scroll"
          role="region"
          aria-label="Daily team availability"
          tabindex="0"
        >
          <table>
            <thead>
              <tr>
                <th scope="col">Date</th>
                <th scope="col">Available</th>
                <th scope="col">Pending leave</th>
                <th scope="col">Approved leave</th>
              </tr>
            </thead>

            <tbody>
              @for (day of summary.days; track day.date) {
                <tr [class.non-working]="!day.workingDay">
                  <th scope="row">{{ day.date }}</th>

                  @if (day.workingDay) {
                    <td>
                      <strong class="available">
                        {{ day.availableCount }} available
                      </strong>
                      <ul>
                        @for (member of day.available; track member.id) {
                          <li>{{ member.name }}</li>
                        } @empty {
                          <li class="muted">None</li>
                        }
                      </ul>
                    </td>

                    <td>
                      <strong class="pending">
                        {{ day.pendingCount }} pending
                      </strong>
                      <ul>
                        @for (member of day.pending; track member.id) {
                          <li>{{ member.name }}</li>
                        } @empty {
                          <li class="muted">None</li>
                        }
                      </ul>
                    </td>

                    <td>
                      <strong class="approved">
                        {{ day.approvedCount }} approved
                      </strong>
                      <ul>
                        @for (member of day.approved; track member.id) {
                          <li>{{ member.name }}</li>
                        } @empty {
                          <li class="muted">None</li>
                        }
                      </ul>
                    </td>
                  } @else {
                    <td colspan="3">
                      <strong>Non-working day</strong>

                      @if (day.weekend) {
                        <span> · Weekend</span>
                      }

                      @if (day.holiday !== null) {
                        <span> · {{ day.holiday }}</span>
                      }
                    </td>
                  }
                </tr>
              }
            </tbody>
          </table>
        </div>
      }
    </section>
  `,
  styleUrl: './workspace-panels.scss',
})
export class TeamAvailabilityComponent {
  private readonly api = inject(ApiService);
  private readonly destroyRef = inject(DestroyRef);

  startDate = todayText();
  endDate = this.startDate;

  readonly result = signal<TeamAvailability | null>(null);
  readonly loading = signal(false);
  readonly error = signal('');

  load(): void {
    if (this.loading()) return;

    this.error.set('');
    this.result.set(null);

    const start = parseDate(this.startDate);
    const end = parseDate(this.endDate);

    if (start === null || end === null) {
      this.error.set('Enter valid From and To dates.');
      return;
    }

    if (
      this.startDate < '1900-01-01' ||
      this.endDate > '9999-12-31'
    ) {
      this.error.set('Dates must be between 1900 and 9999.');
      return;
    }

    if (end < start) {
      this.error.set('From date cannot be after To date.');
      return;
    }

    if (Math.round((end - start) / DAY) + 1 > 31) {
      this.error.set('Select a maximum of 31 days.');
      return;
    }

    this.loading.set(true);

    this.api
      .getTeamAvailability(this.startDate, this.endDate)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (response) => {
          this.result.set(response);
          this.loading.set(false);
        },
        error: (error: HttpErrorResponse) => {
          this.loading.set(false);

          if (error.status === 0) {
            this.error.set(
              'Cannot reach the backend. Check that it is running.',
            );
            return;
          }

          if (error.status === 401) {
            this.error.set(
              'Your session has expired. Sign out and sign in again.',
            );
            return;
          }

          const message = error.error?.message;

          this.error.set(
            Array.isArray(message)
              ? message.join(' ')
              : typeof message === 'string'
                ? message
                : 'Could not load team availability. Please try again.',
          );
        },
      });
  }
}