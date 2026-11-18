import { Component } from '@angular/core';
import { Routes } from '@angular/router';

@Component({
  selector: 'app-home-route',
  standalone: true,
  template: '',
})
class HomeRoute {}

export const routes: Routes = [
  {
    path: '',
    pathMatch: 'full',
    component: HomeRoute,
  },
  {
    path: 'leave/requests/:id/history',
    loadComponent: () =>
      import('./request-history-page').then(
        (module) => module.RequestHistoryPage,
      ),
  },
  {
    path: '**',
    redirectTo: '',
  },
];