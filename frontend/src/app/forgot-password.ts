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
  selector: 'app-forgot-password',
  standalone: true,
  imports: [FormsModule],
  template: `
    <section class="reset-card">
      <h2>{{ codeSent() ? 'Reset password' : 'Forgot password?' }}</h2>

      @if (error()) {
        <p class="error" role="alert">{{ error() }}</p>
      }

      @if (message()) {
        <p class="success" role="status">{{ message() }}</p>
      }

      @if (!codeSent()) {
        <p>Enter your registered email to request a reset code.</p>

        <form #emailForm="ngForm" (ngSubmit)="sendCode()">
          <fieldset [disabled]="busy()">
            <label for="resetEmail">Email</label>
            <input
              id="resetEmail"
              name="resetEmail"
              type="email"
              [(ngModel)]="email"
              autocomplete="email"
              maxlength="254"
              email
              required
            />

            <button
              type="submit"
              [disabled]="emailForm.invalid || busy() || cooldown() > 0"
            >
              {{ busy() ? 'Sending…' : 'Send reset code' }}
            </button>
          </fieldset>
        </form>

        @if (cooldown() > 0) {
          <p>Please wait {{ cooldown() }} seconds before requesting again.</p>
        }
      } @else {
        <p>
          If an account exists for <strong>{{ email }}</strong>,
          check its inbox and spam folder for the reset code.
          Codes expire in 10 minutes.
        </p>

        <form #resetForm="ngForm" (ngSubmit)="reset()">
          <fieldset [disabled]="busy()">
            <label for="resetOtp">Verification code</label>
            <input
              id="resetOtp"
              name="resetOtp"
              [(ngModel)]="otp"
              inputmode="numeric"
              autocomplete="one-time-code"
              pattern="[0-9]{6}"
              maxlength="6"
              required
            />

            <label for="newPassword">New password</label>
            <input
              id="newPassword"
              name="newPassword"
              type="password"
              [(ngModel)]="password"
              autocomplete="new-password"
              minlength="8"
              maxlength="72"
              required
            />

            <label for="confirmNewPassword">Confirm new password</label>
            <input
              id="confirmNewPassword"
              name="confirmNewPassword"
              type="password"
              [(ngModel)]="confirmPassword"
              autocomplete="new-password"
              minlength="8"
              maxlength="72"
              required
            />

            <button
              type="submit"
              [disabled]="resetForm.invalid || busy()"
            >
              {{ busy() ? 'Resetting…' : 'Reset password' }}
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
          (click)="editEmail()"
          [disabled]="busy()"
        >
          Change email
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

    .reset-card {
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
export class ForgotPassword implements OnDestroy {
  private readonly api = inject(ApiService);
  private readonly destroyRef = inject(DestroyRef);

  private timer?: ReturnType<typeof setInterval>;
  private resendAt = 0;

  readonly completed = output<string>();
  readonly cancelled = output<void>();

  email = '';
  otp = '';
  password = '';
  confirmPassword = '';

  readonly codeSent = signal(false);
  readonly busy = signal(false);
  readonly error = signal('');
  readonly message = signal('');
  readonly cooldown = signal(0);

  sendCode() {
    if (this.busy() || this.cooldown() > 0) return;

    this.error.set('');
    this.message.set('');

    const email = this.email.trim().toLowerCase();

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      this.error.set('Enter a valid email address.');
      return;
    }

    this.busy.set(true);

    this.api.forgotPassword(email)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (response) => {
          this.email = email;
          this.otp = '';
          this.codeSent.set(true);
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

  reset() {
    if (this.busy()) return;

    this.error.set('');
    this.message.set('');

    if (!/^\d{6}$/.test(this.otp.trim())) {
      this.error.set('Enter the six-digit reset code.');
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

    this.api.resetPassword({
      email: this.email,
      otp: this.otp.trim(),
      password: this.password,
      confirmPassword: this.confirmPassword,
    })
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

  editEmail() {
    this.codeSent.set(false);
    this.otp = '';
    this.password = '';
    this.confirmPassword = '';
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