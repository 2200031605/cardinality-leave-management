import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { HttpErrorResponse } from '@angular/common/http';
import { forkJoin, of } from 'rxjs';

import { ApiService } from './api.service';
import { AdminSettings } from './admin-settings';
import { HolidayAdmin } from './holiday-admin';
import { Signup } from './signup';
import { EmployeeAdmin } from './employee-admin';
import { ForgotPassword } from './forgot-password';

import type {
  CalendarRequest,
  LeaveBalance,
  LeaveRequest,
  LeaveType,
  LoginResponse,
  TeamCalendar,
  TeamLeaveRequest,
} from './api.service';

type AppTab =
  | 'dashboard'
  | 'request'
  | 'history'
  | 'calendar'
  | 'approvals'
  | 'admin';

interface CalendarDay {
  date: string;
  day: number;
  weekend: boolean;
  holidays: string[];
  requests: CalendarRequest[];
}

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [
    FormsModule,
    AdminSettings,
    HolidayAdmin,
    Signup,
    EmployeeAdmin,
    ForgotPassword,
  ],
  templateUrl: './app.html',
  styleUrl: './app.scss',
})
export class App {
  private readonly api = inject(ApiService);

  email = '';
  password = '';
  year = new Date().getFullYear();

  leaveTypeId = 0;
  startDate = '';
  endDate = '';
  reason = '';

  calendarMonth = this.currentMonth();

  readonly activeTab = signal<AppTab>('dashboard');
  readonly showSignup = signal(false);
  readonly showForgotPassword = signal(false);

  readonly user = signal<LoginResponse['user'] | null>(null);
  readonly balances = signal<LeaveBalance[]>([]);
  readonly leaveTypes = signal<LeaveType[]>([]);
  readonly requests = signal<LeaveRequest[]>([]);
  readonly teamRequests = signal<TeamLeaveRequest[]>([]);

  readonly calendar = signal<TeamCalendar | null>(null);
  readonly calendarDays = signal<CalendarDay[]>([]);
  readonly calendarPadding = signal<number[]>([]);
  readonly calendarLoading = signal(false);
  readonly calendarError = signal('');

  readonly busy = signal(false);
  readonly submitting = signal(false);
  readonly cancellingId = signal<number | null>(null);
  readonly decidingId = signal<number | null>(null);

  readonly error = signal('');
  readonly success = signal('');

  isWorking() {
    return (
      this.busy() ||
      this.submitting() ||
      this.cancellingId() !== null ||
      this.decidingId() !== null ||
      this.calendarLoading()
    );
  }

  login() {
    if (this.isWorking()) return;

    this.error.set('');
    this.success.set('');
    this.busy.set(true);

    this.api.login(
      this.email.trim().toLowerCase(),
      this.password,
    ).subscribe({
      next: (response) => {
        this.user.set(response.user);
        this.showSignup.set(false);
        this.showForgotPassword.set(false);
        this.activeTab.set('dashboard');
        this.password = '';
        this.loadDashboard();
      },
      error: (error: HttpErrorResponse) => {
        this.busy.set(false);
        this.handleError(error);
      },
    });
  }

  signupCompleted(email: string) {
    this.showSignup.set(false);
    this.showForgotPassword.set(false);
    this.email = email;
    this.password = '';
    this.error.set('');
    this.success.set(
      'Account created successfully. Sign in with your signup password.',
    );
  }

  passwordResetCompleted(email: string) {
    this.showForgotPassword.set(false);
    this.showSignup.set(false);
    this.email = email;
    this.password = '';
    this.error.set('');
    this.success.set(
      'Password reset successfully. Sign in with your new password.',
    );
  }

  loadDashboard() {
    if (!this.user()) return;

    this.busy.set(true);

    const teamRequests$ =
      this.user()?.role === 'MANAGER'
        ? this.api.getTeamRequests()
        : of<TeamLeaveRequest[]>([]);

    forkJoin({
      balances: this.api.getBalances(this.year),
      types: this.api.getLeaveTypes(),
      requests: this.api.getMyRequests(),
      teamRequests: teamRequests$,
    }).subscribe({
      next: ({ balances, types, requests, teamRequests }) => {
        this.balances.set(balances);
        this.leaveTypes.set(types);
        this.requests.set(requests);
        this.teamRequests.set(teamRequests);

        if (!types.some((type) => type.id === this.leaveTypeId)) {
          this.leaveTypeId = types[0]?.id ?? 0;
        }

        this.busy.set(false);

        if (this.user()?.role !== 'ADMIN') {
          this.loadCalendar();
        }
      },
      error: (error: HttpErrorResponse) => {
        this.busy.set(false);
        this.handleError(error);
      },
    });
  }

  refresh() {
    if (this.isWorking()) return;

    if (
      !Number.isInteger(this.year) ||
      this.year < 1900 ||
      this.year > 9999
    ) {
      this.error.set('Enter a year between 1900 and 9999.');
      return;
    }

    this.error.set('');
    this.success.set('');
    this.loadDashboard();
  }

  submitLeave() {
    if (this.isWorking()) return;

    this.error.set('');
    this.success.set('');

    if (!this.leaveTypeId || !this.startDate || !this.endDate) {
      this.error.set('Select a leave type and both dates.');
      return;
    }

    if (this.endDate < this.startDate) {
      this.error.set('End date cannot precede start date.');
      return;
    }

    const reason = this.reason.trim();

    if (reason.length < 3 || reason.length > 1000) {
      this.error.set(
        'Reason must contain between 3 and 1000 characters.',
      );
      return;
    }

    const requestYear = Number(this.startDate.slice(0, 4));
    const requestMonth = this.startDate.slice(0, 7);

    this.submitting.set(true);

    this.api.createLeave({
      leaveTypeId: this.leaveTypeId,
      startDate: this.startDate,
      endDate: this.endDate,
      reason,
    }).subscribe({
      next: () => {
        this.submitting.set(false);
        this.success.set('Leave request submitted for approval.');

        this.startDate = '';
        this.endDate = '';
        this.reason = '';

        this.year = requestYear;
        this.calendarMonth = requestMonth;
        this.activeTab.set('history');

        this.loadDashboard();
      },
      error: (error: HttpErrorResponse) => {
        this.submitting.set(false);
        this.handleError(error);
      },
    });
  }

  cancelRequest(id: number) {
    if (this.isWorking()) return;
    if (!window.confirm('Cancel this leave request?')) return;

    this.error.set('');
    this.success.set('');
    this.cancellingId.set(id);

    this.api.cancelLeave(id).subscribe({
      next: () => {
        this.cancellingId.set(null);
        this.success.set(
          'Leave cancelled. Its days are available again.',
        );
        this.loadDashboard();
      },
      error: (error: HttpErrorResponse) => {
        this.cancellingId.set(null);
        this.handleError(error);
      },
    });
  }

  decideRequest(id: number, status: 'APPROVED' | 'REJECTED') {
    if (this.isWorking()) return;

    const action = status === 'APPROVED' ? 'Approve' : 'Reject';

    if (!window.confirm(`${action} this leave request?`)) return;

    this.error.set('');
    this.success.set('');
    this.decidingId.set(id);

    this.api.decideLeave(id, status).subscribe({
      next: () => {
        this.decidingId.set(null);
        this.success.set(
          status === 'APPROVED'
            ? 'Leave request approved.'
            : 'Leave request rejected.',
        );
        this.loadDashboard();
      },
      error: (error: HttpErrorResponse) => {
        this.decidingId.set(null);
        this.handleError(error);
      },
    });
  }

  loadCalendar() {
    if (this.isWorking() || !this.user()) return;

    const match = /^(\d{4})-(\d{2})$/.exec(this.calendarMonth);

    if (!match) {
      this.calendarError.set('Choose a valid month.');
      return;
    }

    const year = Number(match[1]);
    const month = Number(match[2]);

    if (
      year < 1900 ||
      year > 9999 ||
      month < 1 ||
      month > 12
    ) {
      this.calendarError.set('Choose a valid month.');
      return;
    }

    this.calendarLoading.set(true);
    this.calendarError.set('');
    this.calendar.set(null);
    this.calendarDays.set([]);
    this.calendarPadding.set([]);

    this.api.getTeamCalendar(year, month).subscribe({
      next: (calendar) => {
        this.calendar.set(calendar);

        const first = new Date(Date.UTC(year, month - 1, 1));
        const dayCount = new Date(
          Date.UTC(year, month, 0),
        ).getUTCDate();

        const padding = (first.getUTCDay() + 6) % 7;

        this.calendarPadding.set(
          Array.from({ length: padding }, (_, index) => index),
        );

        const days: CalendarDay[] = [];

        for (let day = 1; day <= dayCount; day++) {
          const date = new Date(Date.UTC(year, month - 1, day));
          const key = date.toISOString().slice(0, 10);

          const weekend =
            date.getUTCDay() === 0 || date.getUTCDay() === 6;

          const holidays = calendar.holidays
            .filter(
              (holiday) => holiday.date.slice(0, 10) === key,
            )
            .map((holiday) => holiday.name);

          const requests =
            weekend || holidays.length > 0
              ? []
              : calendar.requests.filter(
                  (request) =>
                    request.startDate.slice(0, 10) <= key &&
                    request.endDate.slice(0, 10) >= key,
                );

          days.push({
            date: key,
            day,
            weekend,
            holidays,
            requests,
          });
        }

        this.calendarDays.set(days);
        this.calendarLoading.set(false);
      },
      error: (error: HttpErrorResponse) => {
        this.calendarLoading.set(false);

        if (error.status === 401) {
          this.handleError(error);
          return;
        }

        const message = error.error?.message;

        this.calendarError.set(
          error.status === 0
            ? 'Cannot reach the server.'
            : typeof message === 'string'
              ? message
              : 'Could not load the calendar.',
        );
      },
    });
  }

  usedPercent(balance: LeaveBalance) {
    if (balance.allowance <= 0) return 0;

    const reserved = balance.pending + balance.approved;

    return Math.min(
      100,
      Math.max(0, (reserved / balance.allowance) * 100),
    );
  }

  logout() {
    this.showSignup.set(false);
    this.showForgotPassword.set(false);
    this.activeTab.set('dashboard');
    this.api.logout();

    this.user.set(null);
    this.balances.set([]);
    this.leaveTypes.set([]);
    this.requests.set([]);
    this.teamRequests.set([]);

    this.calendar.set(null);
    this.calendarDays.set([]);
    this.calendarPadding.set([]);
    this.calendarError.set('');
    this.calendarLoading.set(false);

    this.error.set('');
    this.success.set('');

    this.password = '';
    this.leaveTypeId = 0;
    this.startDate = '';
    this.endDate = '';
    this.reason = '';
    this.calendarMonth = this.currentMonth();

    this.busy.set(false);
    this.submitting.set(false);
    this.cancellingId.set(null);
    this.decidingId.set(null);
  }

  private currentMonth() {
    const now = new Date();

    return (
      `${now.getFullYear()}-` +
      String(now.getMonth() + 1).padStart(2, '0')
    );
  }

  private handleError(error: HttpErrorResponse) {
    if (error.status === 401 && this.user()) {
      this.logout();
      this.error.set(
        'Your session expired. Please sign in again.',
      );
      return;
    }

    if (error.status === 0) {
      this.error.set(
        'Cannot reach the server. Check that the backend is running.',
      );
      return;
    }

    const message = error.error?.message;

    this.error.set(
      Array.isArray(message)
        ? message.join(', ')
        : typeof message === 'string'
          ? message
          : 'Request failed. Please try again.',
    );
  }
}