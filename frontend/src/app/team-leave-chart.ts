import {
  Component,
  computed,
  input,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import type {
  LeaveType,
  TeamLeaveRequest,
} from './api.service';

@Component({
  selector: 'app-team-leave-chart',
  standalone: true,
  imports: [FormsModule],
  template: `
    <section class="chart-card" aria-labelledby="team-chart-title">
      <div class="chart-heading">
        <div>
          <span class="eyebrow">TEAM INSIGHTS</span>
          <h2 id="team-chart-title">Employees by leave type</h2>
          <p>
            Unique direct reports with pending or approved
            leave overlapping the selected year.
          </p>
        </div>

        <div class="chart-year">
          <label for="team-chart-year">Year</label>
          <input
            id="team-chart-year"
            name="teamChartYear"
            type="number"
            min="1900"
            max="9999"
            step="1"
            [ngModel]="year()"
            (ngModelChange)="year.set($event)"
          />
        </div>
      </div>

      @if (!validYear()) {
        <p class="error" role="alert">
          Enter a whole year between 1900 and 9999.
        </p>
      } @else if (loading()) {
        <p role="status">Loading team insights…</p>
      } @else {
        <div class="chart-summary">
          <strong>{{ employeeCount() }}</strong>
          <span>employees with active-status leave in {{ year() }}</span>
        </div>

        <div class="chart-legend">
          <span><i class="pending-key"></i>Pending</span>
          <span><i class="approved-key"></i>Approved</span>
        </div>

        @if (employeeCount() === 0) {
          <p class="empty-state">
            No pending or approved team leave recorded for this year.
          </p>
        } @else {
          <div
            class="chart-scroll"
            role="region"
            aria-label="Employee counts by leave type"
            tabindex="0"
          >
            <div class="chart">
              <div class="chart-scale" aria-hidden="true">
                <span>{{ scaleMax() }}</span>
                <span>0</span>
              </div>

              <div class="chart-groups">
                @for (row of rows(); track row.id) {
                  <div class="chart-group">
                    <div class="bar-pair">
                      <div class="bar-column">
                        <span class="bar-value">{{ row.pending }}</span>
                        <div
                          class="chart-bar pending-bar"
                          role="img"
                          [style.height.px]="barHeight(row.pending)"
                          [attr.aria-label]="
                            row.name + ': ' + row.pending +
                            ' employees with pending leave'
                          "
                        ></div>
                      </div>

                      <div class="bar-column">
                        <span class="bar-value">{{ row.approved }}</span>
                        <div
                          class="chart-bar approved-bar"
                          role="img"
                          [style.height.px]="barHeight(row.approved)"
                          [attr.aria-label]="
                            row.name + ': ' + row.approved +
                            ' employees with approved leave'
                          "
                        ></div>
                      </div>
                    </div>

                    <strong class="type-label">{{ row.name }}</strong>
                    <span class="type-total">
                      {{ row.total }} unique employees
                    </span>
                  </div>
                }
              </div>
            </div>
          </div>
        }

        <p class="chart-note">
          Repeated requests count once per employee, type and status.
          An employee can appear in both status bars or multiple leave types.
          Totals count distinct employees; rejected and cancelled requests
          are excluded.
        </p>
      }
    </section>
  `,
  styles: `
    :host {
      display: block;
      margin-bottom: 28px;
    }

    .chart-card {
      background: white;
      border: 1px solid var(--line);
      border-radius: 14px;
      padding: 24px;
      min-width: 0;
    }

    .chart-heading {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      gap: 20px;
      flex-wrap: wrap;
    }

    .chart-heading p {
      margin: 6px 0 0;
      font-size: 12px;
      max-width: 540px;
    }

    .chart-year {
      display: flex;
      align-items: center;
      gap: 8px;
    }

    .chart-year input {
      width: 96px;
    }

    .chart-summary {
      display: flex;
      align-items: baseline;
      flex-wrap: wrap;
      gap: 10px;
      margin-top: 24px;
    }

    .chart-summary strong {
      font-size: 32px;
      color: var(--primary);
      line-height: 1;
    }

    .chart-summary span {
      font-size: 12px;
      color: var(--muted);
    }

    .chart-legend {
      display: flex;
      gap: 20px;
      margin: 22px 0;
      font-size: 11px;
      color: var(--muted);
    }

    .chart-legend span {
      display: flex;
      align-items: center;
      gap: 7px;
    }

    .chart-legend i {
      width: 10px;
      height: 10px;
      border-radius: 3px;
    }

    .pending-key,
    .pending-bar {
      background: #dfab5d;
    }

    .approved-key,
    .approved-bar {
      background: #7765df;
    }

    .chart-scroll {
      overflow-x: auto;
    }

    .chart {
      display: flex;
      gap: 12px;
      min-width: 420px;
      padding-top: 10px;
    }

    .chart-scale {
      height: 198px;
      display: flex;
      flex-direction: column;
      justify-content: space-between;
      min-width: 22px;
      font-size: 10px;
      color: var(--muted);
    }

    .chart-groups {
      display: flex;
      flex: 1;
      min-width: 0;
    }

    .chart-group {
      flex: 1;
      min-width: 110px;
      text-align: center;
    }

    .bar-pair {
      height: 200px;
      display: flex;
      align-items: flex-end;
      justify-content: center;
      gap: 10px;
      border-bottom: 1px solid var(--line);
      background: repeating-linear-gradient(
        to top,
        transparent 0,
        transparent 49px,
        #f1f2f7 49px,
        #f1f2f7 50px
      );
    }

    .bar-column {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: flex-end;
    }

    .bar-value {
      font-size: 11px;
      font-weight: 600;
      margin-bottom: 6px;
      color: var(--ink);
    }

    .chart-bar {
      width: 28px;
      border-radius: 5px 5px 0 0;
    }

    .type-label {
      display: block;
      margin-top: 12px;
      padding: 0 8px;
      font-size: 11px;
      overflow-wrap: anywhere;
    }

    .type-total {
      display: block;
      margin-top: 4px;
      font-size: 9px;
      color: var(--muted);
    }

    .chart-note {
      margin: 22px 0 0;
      font-size: 10px;
      line-height: 1.7;
      color: var(--muted);
    }

    @media (max-width: 600px) {
      .chart-card {
        padding: 18px;
      }
    }
  `,
})
export class TeamLeaveChart {
  readonly requests = input.required<TeamLeaveRequest[]>();
  readonly leaveTypes = input<LeaveType[]>([]);
  readonly loading = input(false);

  readonly year = signal(new Date().getFullYear());

  readonly validYear = computed(
    () =>
      Number.isInteger(this.year()) &&
      this.year() >= 1900 &&
      this.year() <= 9999,
  );

  private readonly selectedRequests = computed(() => {
    if (!this.validYear()) return [];

    const first = `${this.year()}-01-01`;
    const last = `${this.year()}-12-31`;

    return this.requests().filter(
      (request) =>
        (request.status === 'PENDING' ||
          request.status === 'APPROVED') &&
        request.startDate.slice(0, 10) <= last &&
        request.endDate.slice(0, 10) >= first,
    );
  });

  readonly employeeCount = computed(
    () =>
      new Set(
        this.selectedRequests().map(
          (request) => request.user.id,
        ),
      ).size,
  );

  readonly rows = computed(() => {
    const types = new Map<number, string>();

    for (const type of this.leaveTypes()) {
      types.set(type.id, type.name);
    }

    for (const request of this.selectedRequests()) {
      types.set(
        request.leaveType.id,
        request.leaveType.name,
      );
    }

    return [...types.entries()]
      .map(([id, name]) => {
        const pending = new Set<number>();
        const approved = new Set<number>();

        for (const request of this.selectedRequests()) {
          if (request.leaveType.id !== id) continue;

          if (request.status === 'PENDING') {
            pending.add(request.user.id);
          } else {
            approved.add(request.user.id);
          }
        }

        return {
          id,
          name,
          pending: pending.size,
          approved: approved.size,
          total: new Set([...pending, ...approved]).size,
        };
      })
      .sort((a, b) => a.name.localeCompare(b.name));
  });

  readonly scaleMax = computed(() =>
    Math.max(
      1,
      ...this.rows().map((row) =>
        Math.max(row.pending, row.approved),
      ),
    ),
  );

  barHeight(count: number): number {
    return (count / this.scaleMax()) * 170;
  }
}