import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { tap } from 'rxjs';

export interface LoginResponse {
  accessToken: string;
  user: {
    id: number;
    name: string;
    email: string;
    role: 'EMPLOYEE' | 'MANAGER' | 'ADMIN';
  };
}

export interface LeaveBalance {
  leaveTypeId: number;
  name: string;
  year: number;
  allowance: number;
  pending: number;
  approved: number;
  remaining: number;
}

export interface LeaveType {
  id: number;
  name: string;
  yearlyAllowance: number;
}

export interface CreateLeaveRequest {
  leaveTypeId: number;
  startDate: string;
  endDate: string;
  reason: string;
}

export interface LeaveRequest {
  id: number;
  startDate: string;
  endDate: string;
  days: number;
  reason: string;
  status: 'PENDING' | 'APPROVED' | 'REJECTED' | 'CANCELLED';
  leaveType: {
    id: number;
    name: string;
  };
}

export interface TeamLeaveRequest extends LeaveRequest {
  user: {
    id: number;
    name: string;
    email: string;
  };
}

export interface CalendarRequest {
  id: number;
  startDate: string;
  endDate: string;
  status: 'PENDING' | 'APPROVED';
  user: {
    id: number;
    name: string;
  };
}

export interface PublicHoliday {
  name: string;
  date: string;
}

export interface TeamCalendar {
  teamId: number;
  year: number;
  month: number;
  requests: CalendarRequest[];
  holidays: PublicHoliday[];
}

export interface TeamAvailabilityMember {
  id: number;
  name: string;
}

export interface TeamAvailabilityDay {
  date: string;
  workingDay: boolean;
  weekend: boolean;
  holiday: string | null;
  totalMembers: number;
  availableCount: number;
  pendingCount: number;
  approvedCount: number;
  available: TeamAvailabilityMember[];
  pending: TeamAvailabilityMember[];
  approved: TeamAvailabilityMember[];
}

export interface TeamAvailability {
  teamId: number;
  startDate: string;
  endDate: string;
  totalMembers: number;
  workingDays: number;
  days: TeamAvailabilityDay[];
}

export interface AppSettings {
  id: number;
  minimumNoticeDays: number;
  maxTeamMembersOff: number;
}

export interface ManagedEmployee {
  id: number;
  name: string;
  email: string;
  teamId: number | null;
  managerId: number | null;
  team: {
    id: number;
    name: string;
  } | null;
  manager: {
    id: number;
    name: string;
  } | null;
}

export interface EmployeeOptions {
  teams: {
    id: number;
    name: string;
  }[];
  managers: {
    id: number;
    name: string;
    email: string;
    teamId: number | null;
  }[];
}

export interface LeaveAuditEvent {
  id: number;
  action: 'REQUESTED' | 'APPROVED' | 'REJECTED' | 'CANCELLED';
  fromStatus:
    | 'PENDING'
    | 'APPROVED'
    | 'REJECTED'
    | 'CANCELLED'
    | null;
  toStatus: 'PENDING' | 'APPROVED' | 'REJECTED' | 'CANCELLED';
  createdAt: string;
  actor: {
    id: number;
    name: string;
    role: 'EMPLOYEE' | 'MANAGER' | 'ADMIN';
  };
}

@Injectable({ providedIn: 'root' })
export class ApiService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = 'http://localhost:3000';
  private token = '';

  private get headers() {
    return new HttpHeaders({
      Authorization: `Bearer ${this.token}`,
    });
  }

  login(email: string, password: string) {
    this.token = '';

    return this.http
      .post<LoginResponse>(`${this.baseUrl}/auth/login`, {
        email,
        password,
      })
      .pipe(
        tap((response) => {
          this.token = response.accessToken;
        }),
      );
  }

  getBalances(year: number) {
    return this.http.get<LeaveBalance[]>(
      `${this.baseUrl}/leave/balances`,
      {
        params: { year },
        headers: this.headers,
      },
    );
  }

  getLeaveTypes() {
    return this.http.get<LeaveType[]>(
      `${this.baseUrl}/leave/types`,
      { headers: this.headers },
    );
  }

  createLeave(data: CreateLeaveRequest) {
    return this.http.post(
      `${this.baseUrl}/leave/requests`,
      data,
      { headers: this.headers },
    );
  }

  getMyRequests() {
    return this.http.get<LeaveRequest[]>(
      `${this.baseUrl}/leave/my-requests`,
      { headers: this.headers },
    );
  }

  cancelLeave(id: number) {
    return this.http.patch(
      `${this.baseUrl}/leave/requests/${id}/cancel`,
      {},
      { headers: this.headers },
    );
  }

  getTeamRequests() {
    return this.http.get<TeamLeaveRequest[]>(
      `${this.baseUrl}/leave/team-requests`,
      { headers: this.headers },
    );
  }

  decideLeave(
    id: number,
    status: 'APPROVED' | 'REJECTED',
  ) {
    return this.http.patch(
      `${this.baseUrl}/leave/requests/${id}/decision`,
      { status },
      { headers: this.headers },
    );
  }

  getTeamCalendar(year: number, month: number) {
    return this.http.get<TeamCalendar>(
      `${this.baseUrl}/leave/calendar`,
      {
        params: { year, month },
        headers: this.headers,
      },
    );
  }

  getTeamAvailability(
    startDate: string,
    endDate: string,
  ) {
    return this.http.get<TeamAvailability>(
      `${this.baseUrl}/leave/availability`,
      {
        params: {
          startDate,
          endDate,
        },
        headers: this.headers,
      },
    );
  }

  getSettings() {
    return this.http.get<AppSettings | null>(
      `${this.baseUrl}/admin/settings`,
      { headers: this.headers },
    );
  }

  updateSettings(data: {
    minimumNoticeDays: number;
    maxTeamMembersOff: number;
  }) {
    return this.http.patch<AppSettings>(
      `${this.baseUrl}/admin/settings`,
      data,
      { headers: this.headers },
    );
  }

  updateAllowance(
    id: number,
    yearlyAllowance: number,
  ) {
    return this.http.patch<LeaveType>(
      `${this.baseUrl}/admin/leave-types/${id}`,
      { yearlyAllowance },
      { headers: this.headers },
    );
  }

  getHolidays() {
    return this.http.get<PublicHoliday[]>(
      `${this.baseUrl}/holidays`,
      { headers: this.headers },
    );
  }

  createHoliday(data: {
    name: string;
    date: string;
  }) {
    return this.http.post<PublicHoliday>(
      `${this.baseUrl}/holidays`,
      data,
      { headers: this.headers },
    );
  }

  createLeaveType(data: {
    name: string;
    yearlyAllowance: number;
  }) {
    return this.http.post<LeaveType>(
      `${this.baseUrl}/admin/leave-types`,
      data,
      { headers: this.headers },
    );
  }

  signup(data: {
    name: string;
    email: string;
    password: string;
    confirmPassword: string;
  }) {
    return this.http.post<{
      message: string;
      email: string;
      resendAfterSeconds: number;
    }>(
      `${this.baseUrl}/auth/signup`,
      data,
    );
  }

  verifySignup(email: string, otp: string) {
    return this.http.post<{
      message: string;
      confirmationEmailSent: boolean;
    }>(
      `${this.baseUrl}/auth/verify-signup`,
      { email, otp },
    );
  }

  getEmployees() {
    return this.http.get<ManagedEmployee[]>(
      `${this.baseUrl}/admin/employees`,
      { headers: this.headers },
    );
  }

  getEmployeeOptions() {
    return this.http.get<EmployeeOptions>(
      `${this.baseUrl}/admin/employee-options`,
      { headers: this.headers },
    );
  }

  assignEmployee(
    id: number,
    data: {
      teamId: number;
      managerId: number;
    },
  ) {
    return this.http.patch<ManagedEmployee>(
      `${this.baseUrl}/admin/employees/${id}/assignment`,
      data,
      { headers: this.headers },
    );
  }

  forgotPassword(email: string) {
    return this.http.post<{
      message: string;
      resendAfterSeconds: number;
      expiresInSeconds: number;
    }>(
      `${this.baseUrl}/auth/forgot-password`,
      { email },
    );
  }

  resetPassword(data: {
    email: string;
    otp: string;
    password: string;
    confirmPassword: string;
  }) {
    return this.http.post<{ message: string }>(
      `${this.baseUrl}/auth/reset-password`,
      data,
    );
  }

  getLeaveAudit(requestId: number) {
    return this.http.get<LeaveAuditEvent[]>(
      `${this.baseUrl}/leave/requests/${requestId}/audit`,
      { headers: this.headers },
    );
  }

    askAssistant(data: {
    topic: 'policies' | 'balance' | 'requests' | 'availability';
    question: string;
    year?: number;
    startDate?: string;
    endDate?: string;
  }) {
    return this.http.post<{
      answer: string;
      topic: string;
      generatedAt: string;
    }>(
      `${this.baseUrl}/assistant/ask`,
      data,
      { headers: this.headers },
    );
  }

  logout() {
    this.token = '';
  }
}