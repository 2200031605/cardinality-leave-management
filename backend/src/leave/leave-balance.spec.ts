import { describe, expect, it, jest } from '@jest/globals';
import { LeaveService } from './leave.service';
import { PrismaService } from '../prisma/prisma.service';

describe('Leave cancellation and balances', () => {
  it.each(['PENDING', 'APPROVED'] as const)(
    'restores two days after cancelling a %s request',
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
            status: { in: string[] };
          };
          data: { status: 'CANCELLED' };
        }) => {
          if (
            query.where.id !== request.id ||
            query.where.userId !== request.userId ||
            !query.where.status.in.includes(request.status)
          ) {
            return { count: 0 };
          }

          request.status = query.data.status;
          return { count: 1 };
        },
      );

      const prisma = {
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
        leaveRequest: {
          findMany,
          findUnique: jest.fn(async () => ({ ...request })),
          updateMany,
          findUniqueOrThrow: jest.fn(
            async () => ({ ...request }),
          ),
        },
      };

      const service = new LeaveService(
        prisma as unknown as PrismaService,
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

      const cancelled = await service.cancel(1, request.id);

      expect(cancelled.status).toBe('CANCELLED');

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

      // Repeating cancellation must not return the days twice.
      await expect(
        service.cancel(1, request.id),
      ).rejects.toThrow(
        'Only pending or approved requests can be cancelled',
      );

      const finalBalance = await service.getMyBalances(1, 2027);

      expect(finalBalance[0].remaining).toBe(20);
    },
  );
});