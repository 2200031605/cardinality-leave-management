import {
  Component,
  DestroyRef,
  OnDestroy,
  inject,
  output,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { HttpErrorResponse } from '@angular/common/http';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ApiService } from './api.service';

@Component({
  selector: 'app-signup',
  standalone: true,
  imports: [FormsModule],
  template: `
    <section class="signup-card">
      <h2>{{ verifying() ? 'Verify your email' : 'Create account' }}</h2>

      @if (error()) {
        <p class="error" role="alert">{{ error() }}</p>
      }

      @if (message()) {
        <p class="success" role="status">{{ message() }}</p>
      }

      @if (!verifying()) {
        <p>Register as an employee to manage your leave.</p>

        <form #signupForm="ngForm" (ngSubmit)="sendCode()">
          <fieldset [disabled]="busy()">
            <label for="signupName">Full name</label>
            <input
              id="signupName"
              name="signupName"
              [(ngModel)]="name"
              autocomplete="name"
              minlength="2"
              maxlength="100"
              required
            />

            <label for="signupEmail">Email</label>
            <input
              id="signupEmail"
              name="signupEmail"
              type="email"
              [(ngModel)]="email"
              autocomplete="email"
              maxlength="254"
              email
              required
            />

            <label for="signupPassword">Password</label>
            <input
              id="signupPassword"
              name="signupPassword"
              type="password"
              [(ngModel)]="password"
              autocomplete="new-password"
              minlength="8"
              maxlength="72"
              required
            />

            <label for="confirmPassword">Confirm password</label>
            <input
              id="confirmPassword"
              name="confirmPassword"
              type="password"
              [(ngModel)]="confirmPassword"
              autocomplete="new-password"
              minlength="8"
              maxlength="72"
              required
            />

            <button
              type="submit"
              [disabled]="signupForm.invalid || busy()"
            >
              {{ busy() ? 'Sending…' : 'Send verification code' }}
            </button>
          </fieldset>
        </form>
      } @else {
        <p>
          Enter the six-digit code sent to
          <strong>{{ email }}</strong>.
          It expires in 10 minutes.
        </p>

        <form #otpForm="ngForm" (ngSubmit)="verify()">
          <fieldset [disabled]="busy()">
            <label for="signupOtp">Verification code</label>
            <input
              id="signupOtp"
              name="signupOtp"
              [(ngModel)]="otp"
              inputmode="numeric"
              autocomplete="one-time-code"
              pattern="[0-9]{6}"
              maxlength="6"
              required
            />

            <button
              type="submit"
              [disabled]="otpForm.invalid || busy()"
            >
              {{ busy() ? 'Verifying…' : 'Verify and create account' }}
            </button>
          </fieldset>
        </form>

        <button
          class="secondary"
          type="button"
          (click)="sendCode()"
          [disabled]="busy() || cooldown() > 0"
        >
          {{
            cooldown() > 0
              ? 'Resend code in ' + cooldown() + 's'
              : 'Resend code'
          }}
        </button>

        <button
          class="link"
          type="button"
          (click)="editDetails()"
          [disabled]="busy()"
        >
          Edit signup details
        </button>
      }

      <button
        class="link"
        type="button"
        (click)="cancelled.emit()"
        [disabled]="busy()"
      >
        Back to sign in
      </button>
    </section>
  `,
  styles: `
    :host {
      display: block;
    }

    * {
      box-sizing: border-box;
    }

    .signup-card {
      max-width: 460px;
      margin: 40px auto;
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
      overflow-wrap: anywhere;
    }

    fieldset {
      display: grid;
      gap: 12px;
      min-width: 0;
      margin: 20px 0;
      padding: 0;
      border: 0;
    }

    label {
      font-size: 14px;
      font-weight: 600;
    }

    input {
      width: 100%;
      min-width: 0;
      padding: 12px;
      border: 1px solid #cbd4e1;
      border-radius: 8px;
      font: inherit;
    }

    button {
      padding: 12px 16px;
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

    .secondary {
      width: 100%;
      background: #edf1fa;
      color: #334155;
    }

    .link {
      display: block;
      margin-top: 12px;
      padding-left: 0;
      background: transparent;
      color: #4263eb;
    }

    .error,
    .success {
      padding: 12px;
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
  `,
})
export class Signup implements OnDestroy {
  private readonly api = inject(ApiService);
  private readonly destroyRef = inject(DestroyRef);
  private timer?: ReturnType<typeof setInterval>;
  private resendAt = 0;

  readonly completed = output<string>();
  readonly cancelled = output<void>();

  name = '';
  email = '';
  password = '';
  confirmPassword = '';
  otp = '';

  readonly verifying = signal(false);
  readonly busy = signal(false);
  readonly error = signal('');
  readonly message = signal('');
  readonly cooldown = signal(0);

  sendCode() {
    if (this.busy() || this.cooldown() > 0) return;

    this.error.set('');
    this.message.set('');

    if (this.name.trim().length < 2 || !this.email.trim()) {
      this.error.set('Enter your name and email.');
      return;
    }

    if (
      this.password.length < 8 ||
      new TextEncoder().encode(this.password).length > 72
    ) {
      this.error.set(
        'Password must contain at least 8 characters and at most 72 UTF-8 bytes.',
      );
      return;
    }

    if (this.password !== this.confirmPassword) {
      this.error.set('Passwords do not match.');
      return;
    }

    this.busy.set(true);

    this.api.signup({
      name: this.name.trim(),
      email: this.email.trim().toLowerCase(),
      password: this.password,
      confirmPassword: this.confirmPassword,
    })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (response) => {
          this.email = response.email;
          this.otp = '';
          this.verifying.set(true);
          this.busy.set(false);
          this.message.set(response.message);
          this.startCooldown(response.resendAfterSeconds);
        },
        error: (error: HttpErrorResponse) => {
          this.busy.set(false);
          this.showError(error);
        },
      });
  }

  verify() {
    if (this.busy()) return;

    this.error.set('');
    this.message.set('');

    const otp = this.otp.trim();

    if (!/^\d{6}$/.test(otp)) {
      this.error.set('Enter the six-digit code.');
      return;
    }

    this.busy.set(true);

    this.api.verifySignup(this.email, otp)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.password = '';
          this.confirmPassword = '';
          this.otp = '';
          this.busy.set(false);
          this.completed.emit(this.email);
        },
        error: (error: HttpErrorResponse) => {
          this.busy.set(false);
          this.showError(error);
        },
      });
  }

  editDetails() {
    this.verifying.set(false);
    this.otp = '';
    this.error.set('');
    this.message.set('');
  }

  private startCooldown(seconds: number) {
    if (this.timer) clearInterval(this.timer);

    this.resendAt = Date.now() + seconds * 1000;
    this.cooldown.set(seconds);

    this.timer = setInterval(() => {
      const remaining = Math.max(
        0,
        Math.ceil((this.resendAt - Date.now()) / 1000),
      );

      this.cooldown.set(remaining);

      if (remaining === 0 && this.timer) {
        clearInterval(this.timer);
        this.timer = undefined;
      }
    }, 1000);
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
            : 'Request failed. Please try again.',
    );
  }

  ngOnDestroy() {
    if (this.timer) clearInterval(this.timer);
    this.password = '';
    this.confirmPassword = '';
    this.otp = '';
  }
}