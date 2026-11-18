# Cardinality Leave Management

A leave management application for employees, managers and administrators.

## Technology

- Frontend: Angular, TypeScript and SCSS
- Backend: NestJS and TypeScript
- Database: PostgreSQL
- ORM: Prisma
- Authentication: JWT
- Email: SMTP
- Backend tests: Jest

## Features

### Employee

- Sign up and verify email.
- Sign in and reset a forgotten password.
- View yearly leave balances.
- Submit leave requests.
- Search and filter personal requests.
- Cancel pending or approved requests.
- Open request history on a separate page.
- View the team leave calendar.

### Manager

- Review requests from direct reports.
- Approve or reject pending requests.
- Check team availability for a date range.
- View employee counts by leave type and year.
- Use personal leave features.

### Administrator

- Assign employees to teams and reporting managers.
- Configure leave types and yearly allowances.
- Configure minimum notice and maximum team members off per day.
- Manage public holidays.

### Leave Assistant

The floating robot opens three options:

1. Policies and application instructions
2. Personal leave balance for a selected year
3. The user's latest 10 leave requests

The current assistant uses database queries and predefined response
templates. It does not use an external AI service or require an AI API key.
It cannot submit, cancel or approve leave.

## Leave Rules

- End date must not precede start date.
- Weekends and configured public holidays are excluded from leave days.
- Pending and approved requests reserve leave balance.
- Insufficient balance and overlapping active requests are rejected.
- Minimum notice and team coverage rules are enforced on the backend.
- Cancellation restores reserved balance.
- Managers cannot approve their own requests.
- Request changes are recorded in the audit history.

## Project Structure

```text
cardinality-leave-management/
├── backend/
│   ├── prisma/
│   ├── src/
│   │   ├── admin/
│   │   ├── assistant/
│   │   ├── auth/
│   │   ├── holidays/
│   │   ├── leave/
│   │   ├── mail/
│   │   ├── password-reset/
│   │   ├── prisma/
│   │   ├── signup/
│   │   └── users/
│   ├── prisma7.config.ts
│   └── seed.cjs
├── frontend/
│   └── src/app/
└── README.md
```

## Requirements

- Node.js and npm
- PostgreSQL
- Git
- SMTP credentials for signup verification and password-reset emails

The application was tested locally using Node.js 26.13.1.

## Installation

Clone this repository and open its root directory.

### 1. Install Backend Dependencies

```powershell
cd backend
npm ci
```

### 2. Configure Backend Environment

Create `backend/.env` using the following format:

```env
DATABASE_URL="postgresql://postgres:YOUR_URL_ENCODED_PASSWORD@localhost:5432/leave_management?schema=public"

JWT_SECRET="YOUR_RANDOM_SECRET"
JWT_EXPIRES_IN="1h"

SMTP_HOST="smtp.gmail.com"
SMTP_PORT="465"
SMTP_USER="YOUR_EMAIL"
SMTP_PASS="YOUR_APP_PASSWORD"
MAIL_FROM="Leave Management <YOUR_EMAIL>"
```

Use your own credentials. For Gmail, use an app password.

URL-encode special characters in the database password when writing
`DATABASE_URL`. For example, `@` becomes `%40`.

Generate a JWT secret with:

```powershell
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Never commit the actual `.env` file.

### 3. Create the Database

Using pgAdmin Query Tool or psql with a PostgreSQL administrator account:

```sql
CREATE DATABASE leave_management;
```

### 4. Generate Prisma Client and Apply Migrations

Run from the `backend` directory:

```powershell
npx prisma generate --config prisma7.config.ts
npx prisma migrate deploy --config prisma7.config.ts
```

### 5. Load Demo Data

Run from the `backend` directory:

```powershell
node seed.cjs
```

The demo seed provides:

- An administrator
- Two managers
- Eight employees
- Leave types and yearly allowances
- Public holidays
- Forty mixed-status demo leave requests

The seed may reset demo account passwords to the demo password below.
Use a dedicated local demonstration database.
### Seed Behaviour

Fresh database defaults are Annual: 20, Sick: 10 and Unpaid: 30 days.
Existing leave allowances and policy settings are preserved.

New demo requests use the next calendar year. Re-running the seed
does not duplicate requests identified by the same demo seed marker,
but resets demo account passwords to `DemoPass123!`.

Seeded requests do not include historical audit events. Create and
update a new request through the application to demonstrate its
audit history.

### 6. Start the Backend

```powershell
npm run start:dev
```

Default backend address:

```text
http://localhost:3000
```

### 7. Install and Start the Frontend

Open a separate terminal:

```powershell
cd frontend
npm ci
npm start
```

If the terminal is currently inside `backend`, use `cd ../frontend`.

Frontend address:

```text
http://localhost:4200
```

Keep PostgreSQL and the backend running while using the frontend.

## Demo Accounts

These accounts are available after running the seed.

| Role | Email | Password |
|---|---|---|
| Admin | demo.admin@example.com | DemoPass123! |
| Manager 1 | demo.manager1@example.com | DemoPass123! |
| Manager 2 | demo.manager2@example.com | DemoPass123! |
| Employee 1 | demo.employee1@example.com | DemoPass123! |

Additional employee accounts follow the pattern
`demo.employee2@example.com` through `demo.employee8@example.com`.

These are local demo credentials, not production credentials.

## Architecture

The Angular frontend calls the NestJS HTTP API.
NestJS validates requests, authenticates users, checks permissions and
executes business rules. Prisma accesses PostgreSQL.

The server derives the current user from the authenticated session.
Personal requests are scoped to that user, and manager approvals are
scoped to their direct reports.

Leave creation, status changes and audit entries use database
transactions where required.

## Data Model

- Users: identity, role, team and reporting manager.
- Teams: employee grouping.
- Leave types: names and yearly allowances.
- Leave requests: owner, type, dates, working days, reason and status.
- Holidays: non-working public holiday dates.
- Application settings: notice and team coverage rules.
- Leave audits: request status changes and actors.
- Pending signup and password reset records: verification workflows.

## Tests

From `backend`:

```powershell
npm test -- --runInBand
```

Latest verified backend result:

```text
Test Suites: 11 passed
Tests:       70 passed
```

Tests cover authentication, signup, password reset, permissions,
users, leave rules, balances and administration.

The database-based assistant also requires manual verification.
The 70-test result does not imply every UI flow has automated coverage.

## Build

Backend:

```powershell
cd backend
npm run build
```

Frontend, from a separate terminal at the repository root:

```powershell
cd frontend
npm run build
```

Both builds passed during local verification.

## Manual Verification

1. Sign in as an employee and submit a valid leave request.
2. Confirm that pending leave reserves the balance.
3. Sign in as the reporting manager and approve or reject it.
4. Check the team calendar and team availability.
5. Cancel an eligible personal request and verify the restored balance.
6. Open View history and inspect the status timeline.
7. Test insufficient balance, overlapping dates and invalid date order.
8. Verify that unauthorized API operations are rejected.
9. Check administrator assignments, policies and public holidays.
10. Check all three Leave Assistant options against application data.

## Limitations

- The current Leave Assistant uses predefined database summaries.
- Email delivery depends on SMTP configuration and provider availability.
- Authentication tokens are held in memory; refreshing may require sign-in.
- Historical leave calculations can be affected by changes to holiday
  and allowance configuration.

## Demonstration

Prepare a recording under five minutes showing:

- Employee request submission, balance and history
- Manager decisions, calendar, availability and chart
- Administrator configuration
- The three-option Leave Assistant