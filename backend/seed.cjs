require('dotenv').config();

const { Pool } = require('pg');
const bcrypt = require('bcrypt');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

const DAY = 86400000;

function dateKey(date) {
  return date.toISOString().slice(0, 10);
}

function addDays(date, count) {
  return new Date(date.getTime() + count * DAY);
}

async function main() {
  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL is missing from backend/.env');
  }

  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const passwordHash = await bcrypt.hash('DemoPass123!', 12);

    // Preserve settings that an admin has already configured.
    await client.query(`
      INSERT INTO "AppSettings"
        ("id", "minimumNoticeDays", "maxTeamMembersOff")
      VALUES (1, 2, 2)
      ON CONFLICT ("id") DO NOTHING
    `);

    const leaveTypes = [];

    for (const [name, allowance] of [
      ['Annual', 20],
      ['Sick', 10],
      ['Unpaid', 30],
    ]) {
      await client.query(
        `INSERT INTO "LeaveType" ("name", "yearlyAllowance")
         VALUES ($1, $2)
         ON CONFLICT ("name") DO NOTHING`,
        [name, allowance],
      );

      const result = await client.query(
        `SELECT "id", "name" FROM "LeaveType" WHERE "name" = $1`,
        [name],
      );

      leaveTypes.push(result.rows[0]);
    }

    const teams = [];

    for (const name of ['Demo Engineering', 'Demo Operations']) {
      await client.query(
        `INSERT INTO "Team" ("name")
         VALUES ($1)
         ON CONFLICT ("name") DO NOTHING`,
        [name],
      );

      const result = await client.query(
        `SELECT "id" FROM "Team" WHERE "name" = $1`,
        [name],
      );

      teams.push(result.rows[0]);
    }

    async function upsertUser({
      name,
      email,
      role,
      teamId = null,
      managerId = null,
    }) {
      const result = await client.query(
        `INSERT INTO "User"
          ("name", "email", "passwordHash", "role", "teamId", "managerId")
         VALUES ($1, $2, $3, $4, $5, $6)
         ON CONFLICT ("email") DO UPDATE SET
           "name" = EXCLUDED."name",
           "passwordHash" = EXCLUDED."passwordHash",
           "role" = EXCLUDED."role",
           "teamId" = EXCLUDED."teamId",
           "managerId" = EXCLUDED."managerId"
         RETURNING "id", "email"`,
        [name, email, passwordHash, role, teamId, managerId],
      );

      return result.rows[0];
    }

    await upsertUser({
      name: 'Demo Admin',
      email: 'demo.admin@example.com',
      role: 'ADMIN',
    });

    const managers = [];

    for (let index = 0; index < 2; index++) {
      managers.push(
        await upsertUser({
          name: `Demo Manager ${index + 1}`,
          email: `demo.manager${index + 1}@example.com`,
          role: 'MANAGER',
          teamId: teams[index].id,
        }),
      );
    }

    const employees = [];

    for (let index = 0; index < 8; index++) {
      const teamIndex = Math.floor(index / 4);

      employees.push(
        await upsertUser({
          name: `Demo Employee ${index + 1}`,
          email: `demo.employee${index + 1}@example.com`,
          role: 'EMPLOYEE',
          teamId: teams[teamIndex].id,
          managerId: managers[teamIndex].id,
        }),
      );
    }

    // Use next year so seeded active requests are in the future.
    const year = new Date().getUTCFullYear() + 1;

    for (const [name, date] of [
      ['Demo New Year Holiday', `${year}-01-01`],
      ['Demo Year End Holiday', `${year}-12-25`],
    ]) {
      await client.query(
        `INSERT INTO "PublicHoliday" ("name", "date")
         VALUES ($1, $2::date)
         ON CONFLICT ("date") DO NOTHING`,
        [name, date],
      );
    }

    const holidayResult = await client.query(`
      SELECT to_char("date", 'YYYY-MM-DD') AS "date"
      FROM "PublicHoliday"
    `);

    const holidays = new Set(
      holidayResult.rows.map((holiday) => holiday.date),
    );

    function nextWorkingDay(date) {
      let result = date;

      while (
        result.getUTCDay() === 0 ||
        result.getUTCDay() === 6 ||
        holidays.has(dateKey(result))
      ) {
        result = addDays(result, 1);
      }

      return result;
    }

    const baseDate = nextWorkingDay(
      new Date(Date.UTC(year, 0, 4)),
    );

    const states = [
      'PENDING',
      'APPROVED',
      'REJECTED',
      'CANCELLED',
      'APPROVED',
    ];

    let inserted = 0;

    for (let index = 0; index < employees.length; index++) {
      const employee = employees[index];
      const teamIndex = Math.floor(index / 4);
      const manager = managers[teamIndex];

      for (let requestIndex = 0; requestIndex < 5; requestIndex++) {
        const status = states[requestIndex];
        const type = leaveTypes[requestIndex % leaveTypes.length];

        const start = nextWorkingDay(
          addDays(
            baseDate,
            (index % 4) * 7 + requestIndex * 35,
          ),
        );

        const reason =
          `Demo seed v1: employee ${index + 1}, request ${requestIndex + 1}`;

        const decidedById =
          status === 'APPROVED' || status === 'REJECTED'
            ? manager.id
            : null;

        const result = await client.query(
          `INSERT INTO "LeaveRequest"
            (
              "userId",
              "leaveTypeId",
              "startDate",
              "endDate",
              "reason",
              "days",
              "status",
              "decidedById",
              "createdAt",
              "updatedAt"
            )
           SELECT
             $1, $2, $3::date, $3::date, $4, 1, $5, $6, NOW(), NOW()
           WHERE NOT EXISTS (
             SELECT 1 FROM "LeaveRequest"
             WHERE "userId" = $1 AND "reason" = $4
           )`,
          [
            employee.id,
            type.id,
            dateKey(start),
            reason,
            status,
            decidedById,
          ],
        );

        inserted += result.rowCount;
      }
    }

    await client.query('COMMIT');

    console.log('Seed completed.');
    console.log('Demo accounts: 1 admin, 2 managers, 8 employees.');
    console.log(`New requests inserted: ${inserted}`);
    console.log(`Calendar year for newly seeded requests: ${year}`);
    console.log('Admin: demo.admin@example.com');
    console.log('Managers: demo.manager1@example.com, demo.manager2@example.com');
    console.log('Employees: demo.employee1@example.com through demo.employee8@example.com');
    console.log('Local demo password: DemoPass123!');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

main()
  .catch((error) => {
    console.error('Seed failed:', error.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });