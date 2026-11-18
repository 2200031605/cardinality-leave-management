import {
  Component,
  DestroyRef,
  inject,
  input,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ApiService } from './api.service';

type AssistantTopic = 'policies' | 'balance' | 'requests';

@Component({
  selector: 'app-leave-assistant',
  standalone: true,
  imports: [FormsModule],
  template: `
    <div class="assistant-widget">
      @if (open()) {
        <section
          id="leave-assistant-panel"
          class="assistant-panel"
          role="region"
          aria-labelledby="assistant-title"
          (keydown.escape)="open.set(false)"
        >
          <header class="assistant-header">
            <div>
              <span class="eyebrow">QUICK HELP</span>
              <h2 id="assistant-title">Leave Assistant</h2>
            </div>

            <button
              class="close-button"
              type="button"
              aria-label="Close leave assistant"
              (click)="open.set(false)"
            >
              ×
            </button>
          </header>

          <p class="description">
            View your leave policies, balances and recent requests.
            Details come directly from the application database.
          </p>

          <form #detailsForm="ngForm" (ngSubmit)="showDetails()">
            <label for="assistant-topic">Help with</label>

            <select
              id="assistant-topic"
              name="assistantTopic"
              [ngModel]="topic"
              (ngModelChange)="changeTopic($event)"
              [disabled]="loading()"
            >
              <option value="policies">
                Policies & how to use the app
              </option>
              <option value="balance">
                My leave balance
              </option>
              <option value="requests">
                My latest requests
              </option>
            </select>

            @if (topic === 'balance') {
              <label for="assistant-year">Balance year</label>

              <input
                id="assistant-year"
                name="assistantYear"
                type="number"
                [(ngModel)]="year"
                min="1900"
                max="9999"
                step="1"
                required
                [disabled]="loading()"
              />
            }

            <button
              class="show-button"
              type="submit"
              [disabled]="loading() || detailsForm.invalid"
            >
              {{ loading() ? 'Loading details…' : 'Show details' }}
            </button>
          </form>

          @if (error()) {
            <p class="error-message" role="alert">
              {{ error() }}
            </p>
          }

          <div aria-live="polite" aria-atomic="true">
            @if (answer()) {
              <section class="answer-card">
                <h3>{{ answerTitle() }}</h3>
                <p>{{ answer() }}</p>
              </section>
            }
          </div>

          <p class="footer-note">
            To submit, cancel or approve leave, use the corresponding
            page in the application.
          </p>
        </section>
      }

      <button
        class="launcher"
        type="button"
        [attr.aria-expanded]="open()"
        [attr.aria-controls]="open() ? 'leave-assistant-panel' : null"
        [attr.aria-label]="
          open() ? 'Close leave assistant' : 'Open leave assistant'
        "
        [title]="open() ? 'Close assistant' : 'Leave Assistant'"
        (click)="open.set(!open())"
      >
        @if (open()) {
          <span class="launcher-close" aria-hidden="true">×</span>
        } @else {
          <svg
            viewBox="0 0 64 64"
            fill="none"
            aria-hidden="true"
            focusable="false"
          >
            <path
              d="M32 11v8"
              stroke="currentColor"
              stroke-width="4"
              stroke-linecap="round"
            />
            <circle cx="32" cy="8" r="4" fill="currentColor" />

            <rect
              x="12"
              y="20"
              width="40"
              height="32"
              rx="12"
              fill="white"
            />

            <rect
              x="5"
              y="30"
              width="5"
              height="14"
              rx="2.5"
              fill="currentColor"
            />
            <rect
              x="54"
              y="30"
              width="5"
              height="14"
              rx="2.5"
              fill="currentColor"
            />

            <circle cx="24" cy="33" r="4" fill="#5448db" />
            <circle cx="40" cy="33" r="4" fill="#5448db" />

            <path
              d="M25 43c4 4 10 4 14 0"
              stroke="#5448db"
              stroke-width="3"
              stroke-linecap="round"
            />
          </svg>
        }
      </button>
    </div>
  `,
  styles: `
    :host {
      display: block;
      font-family: inherit;
      color: #17243b;
    }

    * {
      box-sizing: border-box;
    }

    .assistant-widget {
      position: fixed;
      right: 24px;
      bottom: 20px;
      z-index: 100;
    }

    .assistant-panel {
      position: absolute;
      right: 0;
      bottom: 84px;
      width: min(430px, calc(100vw - 32px));
      max-height: calc(100dvh - 140px);
      overflow-y: auto;
      overscroll-behavior: contain;
      padding: 26px;
      background: #fff;
      border: 1px solid #dfe5f1;
      border-radius: 22px;
      box-shadow: 0 18px 60px rgb(23 36 59 / 15%);
    }

    .assistant-header {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      gap: 16px;
      margin-bottom: 18px;
    }

    .eyebrow {
      color: #5448db;
      font-size: 11px;
      font-weight: 700;
      letter-spacing: 2px;
    }

    h2 {
      margin: 8px 0 0;
      font-size: 23px;
      line-height: 1.3;
      color: #17243b;
    }

    .description,
    .footer-note {
      color: #65758c;
      font-size: 13px;
      line-height: 1.7;
    }

    .description {
      margin: 0 0 24px;
    }

    label {
      display: block;
      margin: 18px 0 9px;
      color: #40516b;
      font-size: 14px;
      font-weight: 600;
    }

    select,
    input {
      display: block;
      width: 100%;
      min-height: 50px;
      padding: 12px 14px;
      border: 1px solid #d5ddee;
      border-radius: 11px;
      background: #fff;
      color: #17243b;
      font: inherit;
      font-size: 15px;
    }

    button {
      cursor: pointer;
      font: inherit;
    }

    button:disabled {
      cursor: not-allowed;
      opacity: 0.65;
    }

    .show-button {
      width: 100%;
      min-height: 50px;
      margin-top: 22px;
      padding: 13px 18px;
      border: 0;
      border-radius: 11px;
      background: #5448db;
      color: #fff;
      font-weight: 600;
    }

    .show-button:hover:not(:disabled) {
      background: #4437c4;
    }

    .launcher {
      position: relative;
      display: grid;
      place-items: center;
      width: 68px;
      height: 68px;
      min-height: 68px;
      padding: 10px;
      border: 2px solid #fff;
      border-radius: 50%;
      background: #5448db;
      color: #fff;
      line-height: 1;
      box-shadow: 0 8px 26px rgb(84 72 219 / 30%);
      transition:
        transform 160ms ease,
        box-shadow 160ms ease;
    }

    .launcher:hover {
      background: #4437c4;
      transform: translateY(-3px);
      box-shadow: 0 12px 30px rgb(84 72 219 / 35%);
    }

    .launcher svg {
      display: block;
      width: 44px;
      height: 44px;
    }

    .launcher-close {
      font-size: 36px;
      font-weight: 400;
      line-height: 1;
    }

    .close-button {
      display: grid;
      place-items: center;
      flex-shrink: 0;
      width: 42px;
      height: 42px;
      padding: 0;
      border: 1px solid #d5ddee;
      border-radius: 11px;
      background: #fff;
      color: #40516b;
      font-size: 25px;
    }

    .close-button:hover {
      background: #f4f3ff;
    }

    button:focus-visible,
    select:focus-visible,
    input:focus-visible {
      outline: 3px solid #b3aaff;
      outline-offset: 3px;
    }

    .answer-card {
      margin-top: 22px;
      padding: 20px;
      border: 1px solid #e2ddff;
      border-radius: 14px;
      background: #f6f4ff;
    }

    .answer-card h3 {
      margin: 0 0 12px;
      color: #5448db;
      font-size: 14px;
    }

    .answer-card p {
      margin: 0;
      color: #263750;
      font-size: 14px;
      line-height: 1.8;
      white-space: pre-wrap;
      overflow-wrap: anywhere;
    }

    .error-message {
      margin: 18px 0 0;
      padding: 14px;
      border: 1px solid #ffcaca;
      border-radius: 11px;
      background: #fff4f4;
      color: #b42318;
      font-size: 14px;
      line-height: 1.6;
    }

    .footer-note {
      margin: 20px 0 0;
      font-size: 12px;
    }

    @media (max-width: 600px) {
      .assistant-widget {
        right: 16px;
        bottom: 14px;
      }

      .assistant-panel {
        padding: 22px;
      }
    }

    @media (prefers-reduced-motion: reduce) {
      .launcher {
        transition: none;
      }

      .launcher:hover {
        transform: none;
      }
    }
  `,
})
export class LeaveAssistant {
  private readonly api = inject(ApiService);
  private readonly destroyRef = inject(DestroyRef);

  readonly role = input.required<
    'EMPLOYEE' | 'MANAGER' | 'ADMIN'
  >();

  readonly open = signal(false);
  readonly loading = signal(false);
  readonly answer = signal('');
  readonly error = signal('');
  readonly answerTitle = signal('');

  topic: AssistantTopic = 'policies';
  year = new Date().getFullYear();

  changeTopic(value: AssistantTopic) {
    this.topic = value;
    this.answer.set('');
    this.error.set('');
    this.answerTitle.set('');
  }

  showDetails() {
    if (this.loading()) {
      return;
    }

    this.error.set('');
    this.answer.set('');

    if (
      this.topic === 'balance' &&
      (
        !Number.isInteger(this.year) ||
        this.year < 1900 ||
        this.year > 9999
      )
    ) {
      this.error.set('Enter a valid year from 1900 to 9999.');
      return;
    }

    const questions: Record<AssistantTopic, string> = {
      policies: 'Show the leave policies and application steps.',
      balance: 'Show my leave balance for the selected year.',
      requests: 'Show my latest leave requests and statuses.',
    };

    const titles: Record<AssistantTopic, string> = {
      policies: 'Leave policies',
      balance: 'Your leave balance - ' + this.year,
      requests: 'Your latest requests',
    };

    this.answerTitle.set(titles[this.topic]);
    this.loading.set(true);

    this.api
      .askAssistant({
        topic: this.topic,
        question: questions[this.topic],
        ...(this.topic === 'balance'
          ? { year: this.year }
          : {}),
      })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (response) => {
          this.answer.set(response.answer);
          this.loading.set(false);
        },
        error: (err) => {
          this.loading.set(false);

          if (err.status === 401) {
            this.error.set(
              'Your session expired. Please sign out and sign in again.',
            );
            return;
          }

          if (err.status === 0) {
            this.error.set(
              'Cannot connect to the backend. Check that it is running.',
            );
            return;
          }

          const message = err.error?.message;

          this.error.set(
            Array.isArray(message)
              ? message.join(' ')
              : typeof message === 'string'
                ? message
                : 'Could not load details. Please try again.',
          );
        },
      });
  }
}