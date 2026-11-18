import {
  Component,
  DestroyRef,
  OnInit,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { DatePipe } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ApiService } from './api.service';
import type { LeaveAuditEvent } from './api.service';

@Component({
  selector: 'app-leave-audit',
  standalone: true,
  imports: [DatePipe],
  template: `
    <section class="audit-panel" aria-labelledby="auditHeading">
      <div class="heading">
        <div>
          <h2 id="auditHeading">Request history</h2>
          <p>Request #{{ requestId() }}</p>
        </div>

        <button
          class="secondary"
          type="button"
          (click)="closed.emit()"
        >
          Close
        </button>
      </div>

      @if (loading()) {
        <p role="status">Loading history…</p>
      } @else if (error()) {
        <p class="error" role="alert">{{ error() }}</p>
        <button type="button" (click)="load()">Retry</button>
      } @else {
        <ol class="timeline">
          @for (event of events(); track event.id) {
            <li>
              <div class="event-heading">
                <strong>{{ event.action }}</strong>

                <time [attr.datetime]="event.createdAt">
                  {{ event.createdAt | date:'medium' }}
                </time>
              </div>

              <p>
                {{ event.actor.name }}
                <span class="role">({{ event.actor.role }})</span>
              </p>

              <p class="transition">
                {{ event.fromStatus ?? 'New request' }}
                →
                {{ event.toStatus }}
              </p>
            </li>
          } @empty {
            <li>
              No audit events have been recorded for this request.
              Requests created before audit tracking may have
              incomplete or empty history.
            </li>
          }
        </ol>
      }
    </section>
  `,
  styles: `
    :host {
      display: block;
      margin-top: 28px;
    }

    .audit-panel {
      padding: 28px;
      border: 1px solid #dce3ee;
      border-radius: 18px;
      background: white;
    }

    .heading,
    .event-heading {
      display: flex;
      justify-content: space-between;
      align-items: center;
      flex-wrap: wrap;
      gap: 12px;
    }

    h2 {
      margin: 0;
    }

    p {
      color: #627088;
      line-height: 1.6;
      overflow-wrap: anywhere;
    }

    .timeline {
      list-style: none;
      margin: 24px 0 0;
      padding: 0 0 0 20px;
      border-left: 3px solid #dce3ee;
    }

    .timeline li {
      position: relative;
      padding: 0 0 24px 16px;
    }

    .timeline li:last-child {
      padding-bottom: 0;
    }

    .timeline li::before {
      position: absolute;
      top: 4px;
      left: -28px;
      width: 12px;
      height: 12px;
      border-radius: 50%;
      background: #4263eb;
      content: '';
    }

    time,
    .role {
      font-size: 12px;
      color: #627088;
    }

    .transition {
      font-size: 13px;
    }

    button {
      padding: 10px 16px;
      border: 0;
      border-radius: 8px;
      background: #4263eb;
      color: white;
      cursor: pointer;
      font: inherit;
      font-weight: 600;
    }

    button:focus-visible {
      outline: 3px solid #a7b8ff;
      outline-offset: 3px;
    }

    .secondary {
      background: white;
      color: #334155;
      border: 1px solid #cbd4e1;
    }

    .error {
      padding: 12px;
      border-radius: 8px;
      background: #fff0f0;
      color: #a32222;
    }

    @media (max-width: 600px) {
      .audit-panel {
        padding: 20px;
      }
    }
  `,
})
export class LeaveAudit implements OnInit {
  private readonly api = inject(ApiService);
  private readonly destroyRef = inject(DestroyRef);

  readonly requestId = input.required<number>();
  readonly closed = output<void>();

  readonly events = signal<LeaveAuditEvent[]>([]);
  readonly loading = signal(false);
  readonly error = signal('');

  ngOnInit() {
    this.load();
  }

  load() {
    if (this.loading()) return;

    this.loading.set(true);
    this.error.set('');

    this.api.getLeaveAudit(this.requestId())
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (events) => {
          this.events.set(events);
          this.loading.set(false);
        },
        error: (error: HttpErrorResponse) => {
          this.loading.set(false);

          const message = error.error?.message;

          this.error.set(
            error.status === 0
              ? 'Cannot reach the backend.'
              : typeof message === 'string'
                ? message
                : 'Could not load request history.',
          );
        },
      });
  }
}