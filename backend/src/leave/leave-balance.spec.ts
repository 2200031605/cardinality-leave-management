import {
  describe,
  expect,
  it,
  jest,
} from '@jest/globals';
import { LeaveService } from './leave.service';
import { PrismaService } from '../prisma/prisma.service';
import { MailService } from '../mail/mail.service';

describe('Leave cancellation and balances', () => {
  it.each(['PENDING', 'APPROVED'] as const)(
    'restores two days and records cancellation of a %s request',
    async (initialStatus) => {
      const request = {
        id: 100,
        userId: 1,
        leaveTypeId: 1,
        startDate: new Date('2027-01-04T00:00:00.000Z'),
        endDate: new Date('2027-01-05T00:00:00.000Z'),
        days: 2,
        status: initialStatus as
          | 'PENDING'
          | 'APPROVED'
          | 'CANCELLED',
      };

      const findMany = jest.fn(
        async (query: {
          where: {
            userId: number;
            status: { in: string[] };
          };
        }) => {
          if (
            query.where.userId === request.userId &&
            query.where.status.in.includes(request.status)
          ) {
            return [{ ...request }];
          }

          return [];
        },
      );

      const updateMany = jest.fn(
        async (query: {
          where: {
            id: number;
            userId: number;
            status: string;
          };
          data: {
            status: 'CANCELLED';
          };
        }) => {
          if (
            query.where.id !== request.id ||
            query.where.userId !== request.userId ||
            query.where.status !== request.status
          ) {
            return { count: 0 };
          }

          request.status = query.data.status;

          return { count: 1 };
        },
      );

      const createAudit = jest.fn(
        async (_data: unknown) => ({ id: 1 }),
      );

      const database = {
        leaveType: {
          findMany: jest.fn(async () => [
            {
              id: 1,
              name: 'Annual',
              yearlyAllowance: 20,
            },
          ]),
        },
        leaveBalance: {
          findMany: jest.fn(async () => []),
        },
        publicHoliday: {
          findMany: jest.fn(async () => []),
        },
        leaveAudit: {
          create: createAudit,
        },
        leaveRequest: {
          findMany,
          findUnique: jest.fn(
            async () => ({ ...request }),
          ),
          updateMany,
          findUniqueOrThrow: jest.fn(
            async () => ({ ...request }),
          ),
        },
      };

      const prisma = {
        ...database,
        $transaction: jest.fn(
          async (
            callback: (
              client: typeof database,
            ) => Promise<unknown>,
          ) => callback(database),
        ),
      };

      const mail = {
        sendLeaveRequestNotification: jest.fn(
          async () => undefined,
        ),
        sendLeaveDecisionNotification: jest.fn(
          async () => undefined,
        ),
      };

      const service = new LeaveService(
        prisma as unknown as PrismaService,
        mail as unknown as MailService,
      );

      const before = await service.getMyBalances(1, 2027);

      expect(before[0]).toEqual(
        expect.objectContaining({
          allowance: 20,
          remaining: 18,
          pending: initialStatus === 'PENDING' ? 2 : 0,
          approved: initialStatus === 'APPROVED' ? 2 : 0,
        }),
      );

      const cancelled = await service.cancel(
        1,
        request.id,
      );

      expect(cancelled.status).toBe('CANCELLED');

      expect(createAudit).toHaveBeenCalledWith({
        data: {
          requestId: 100,
          actorId: 1,
          action: 'CANCELLED',
          fromStatus: initialStatus,
          toStatus: 'CANCELLED',
        },
      });

      const after = await service.getMyBalances(1, 2027);

      expect(after[0]).toEqual(
        expect.objectContaining({
          allowance: 20,
          pending: 0,
          approved: 0,
          remaining: 20,
        }),
      );

      expect(
        after[0].remaining - before[0].remaining,
      ).toBe(2);

      // Repeating cancellation cannot restore days twice.
      await expect(
        service.cancel(1, request.id),
      ).rejects.toThrow(
        'Only pending or approved requests can be cancelled',
      );

      expect(createAudit).toHaveBeenCalledTimes(1);

      const finalBalance =
        await service.getMyBalances(1, 2027);

      expect(finalBalance[0].remaining).toBe(20);
    },
  );
});