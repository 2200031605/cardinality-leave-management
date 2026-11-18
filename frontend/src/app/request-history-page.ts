import { Component, inject } from '@angular/core';
import {
  ActivatedRoute,
  Router,
  RouterLink,
} from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { map } from 'rxjs';
import { LeaveAudit } from './leave-audit';

@Component({
  selector: 'app-request-history-page',
  standalone: true,
  imports: [RouterLink, LeaveAudit],
  template: `
    <main class="history-page">
      <header>
        <div>
          <span class="brand">CARDINALITY</span>
          <h1>Leave request history</h1>
        </div>

        <a routerLink="/">Back to requests</a>
      </header>

      @if (requestId(); as id) {
        @for (selectedId of [id]; track selectedId) {
          <app-leave-audit
            [requestId]="selectedId"
            (closed)="back()"
          ></app-leave-audit>
        }
      } @else {
        <p class="error" role="alert">
          Invalid request ID.
        </p>
      }
    </main>
  `,
  styleUrl: './history-page.scss',
})
export class RequestHistoryPage {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);

  readonly requestId = toSignal(
    this.route.paramMap.pipe(
      map((params) => {
        const value = params.get('id') ?? '';

        if (!/^[1-9]\d*$/.test(value)) {
          return null;
        }

        const id = Number(value);

        return Number.isSafeInteger(id) ? id : null;
      }),
    ),
    { initialValue: null },
  );

  back() {
    void this.router.navigateByUrl('/');
  }
}