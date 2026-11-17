import {
  Component,
  DestroyRef,
  OnInit,
  inject,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { HttpErrorResponse } from '@angular/common/http';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { forkJoin } from 'rxjs';
import { ApiService } from './api.service';
import type {
  EmployeeOptions,
  ManagedEmployee,
} from './api.service';

@Component({
  selector: 'app-employee-admin',
  standalone: true,
  imports: [FormsModule],
  template: `
    <section class="panel">
      <div class="heading">
        <div>
          <h2>Employee management</h2>
          <p>Assign employees to teams and reporting managers.</p>
        </div>

        <button
          type="button"
          (click)="load()"
          [disabled]="busy()"
        >
          {{ busy() ? 'Loading…' : 'Refresh' }}
        </button>
      </div>

      @if (error()) {
        <p class="error" role="alert">{{ error() }}</p>
      }

      @if (success()) {
        <p class="success" role="status">{{ success() }}</p>
      }

      <form #assignmentForm="ngForm" (ngSubmit)="save()">
        <fieldset [disabled]="busy()">
          <label for="managedEmployee">Employee</label>
          <select
            id="managedEmployee"
            name="managedEmployee"
            [(ngModel)]="employeeId"
            (ngModelChange)="selectEmployee()"
          >
            <option [ngValue]="0">Select employee</option>

            @for (employee of employees(); track employee.id) {
              <option [ngValue]="employee.id">
                {{ employee.name }} — {{ employee.email }}
              </option>
            }
          </select>

          <label for="employeeTeam">Team</label>
          <select
            id="employeeTeam"
            name="employeeTeam"
            [(ngModel)]="teamId"
            (ngModelChange)="managerId = 0"
          >
            <option [ngValue]="0">Select team</option>

            @for (team of options().teams; track team.id) {
              <option [ngValue]="team.id">{{ team.name }}</option>
            }
          </select>

          <label for="employeeManager">Reporting manager</label>
          <select
            id="employeeManager"
            name="employeeManager"
            [(ngModel)]="managerId"
            [disabled]="!teamId || busy()"
          >
            <option [ngValue]="0">Select manager</option>

            @for (manager of availableManagers(); track manager.id) {
              <option [ngValue]="manager.id">
                {{ manager.name }} — {{ manager.email }}
              </option>
            }
          </select>

          @if (teamId && availableManagers().length === 0) {
            <p>No manager is assigned to this team.</p>
          }

          <button
            type="submit"
            [disabled]="
              busy() || !employeeId || !teamId || !managerId
            "
          >
            Save assignment
          </button>
        </fieldset>
      </form>

      <h3>Employees</h3>

      <div class="table-scroll">
        <table>
          <thead>
            <tr>
              <th scope="col">Employee</th>
              <th scope="col">Email</th>
              <th scope="col">Team</th>
              <th scope="col">Manager</th>
            </tr>
          </thead>

          <tbody>
            @for (employee of employees(); track employee.id) {
              <tr>
                <td>{{ employee.name }}</td>
                <td>{{ employee.email }}</td>
                <td>{{ employee.team?.name ?? 'Not assigned' }}</td>
                <td>{{ employee.manager?.name ?? 'Not assigned' }}</td>
              </tr>
            } @empty {
              <tr>
                <td colspan="4">
                  {{ busy() ? 'Loading employees…' : 'No employees loaded.' }}
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

    .heading {
      display: flex;
      justify-content: space-between;
      align-items: center;
      flex-wrap: wrap;
      gap: 16px;
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
      max-width: 600px;
      min-width: 0;
      margin: 24px 0;
      padding: 0;
      border: 0;
    }

    label {
      font-size: 14px;
      font-weight: 600;
    }

    select {
      width: 100%;
      min-width: 0;
      padding: 12px;
      border: 1px solid #cbd4e1;
      border-radius: 8px;
      background: white;
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

    button:focus-visible,
    select:focus-visible {
      outline: 3px solid #a7b8ff;
      outline-offset: 3px;
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
export class EmployeeAdmin implements OnInit {
  private readonly api = inject(ApiService);
  private readonly destroyRef = inject(DestroyRef);

  readonly employees = signal<ManagedEmployee[]>([]);
  readonly options = signal<EmployeeOptions>({
    teams: [],
    managers: [],
  });

  readonly busy = signal(false);
  readonly error = signal('');
  readonly success = signal('');

  employeeId = 0;
  teamId = 0;
  managerId = 0;

  ngOnInit() {
    this.load();
  }

  load() {
    if (this.busy()) return;

    this.error.set('');
    this.success.set('');
    this.busy.set(true);

    forkJoin({
      employees: this.api.getEmployees(),
      options: this.api.getEmployeeOptions(),
    })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: ({ employees, options }) => {
          this.employees.set(employees);
          this.options.set(options);
          this.selectEmployee();
          this.busy.set(false);
        },
        error: (error: HttpErrorResponse) => {
          this.busy.set(false);
          this.showError(error);
        },
      });
  }

  selectEmployee() {
    const employee = this.employees().find(
      (item) => item.id === this.employeeId,
    );

    this.teamId = employee?.teamId ?? 0;
    this.managerId = employee?.managerId ?? 0;
  }

  availableManagers() {
    return this.options().managers.filter(
      (manager) => manager.teamId === this.teamId,
    );
  }

  save() {
    if (this.busy()) return;

    this.error.set('');
    this.success.set('');

    const employee = this.employees().find(
      (item) => item.id === this.employeeId,
    );

    const manager = this.availableManagers().find(
      (item) => item.id === this.managerId,
    );

    if (!employee || !this.teamId || !manager) {
      this.error.set(
        'Select an employee, team, and manager from that team.',
      );
      return;
    }

    this.busy.set(true);

    this.api.assignEmployee(this.employeeId, {
      teamId: this.teamId,
      managerId: this.managerId,
    })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (updated) => {
          this.employees.update((employees) =>
            employees.map((item) =>
              item.id === updated.id ? updated : item,
            ),
          );

          this.busy.set(false);
          this.success.set(
            `Team and manager assigned to ${updated.name}.`,
          );
        },
        error: (error: HttpErrorResponse) => {
          this.busy.set(false);
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
            : 'Could not load or save employee assignments.',
    );
  }
}