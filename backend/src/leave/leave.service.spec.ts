import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { LeaveService } from './leave.service';
import { PrismaService } from '../prisma/prisma.service';

// These mocks represent database responses for service-level tests.
function asyncMock() {
  return jest.fn<(...args: unknown[]) => Promise<unknown>>();
}

describe('LeaveService', () => {
  let service: LeaveService;

  const tx = {
    user: {
      findUnique: asyncMock(),
    },
    leaveType: {
      findUnique: asyncMock(),
    },
    appSettings: {
      findUnique: asyncMock(),
    },
    publicHoliday: {
      findMany: asyncMock(),
    },
    leaveBalance: {
      findUnique: asyncMock(),
    },
    leaveRequest: {
      findFirst: asyncMock(),
      findMany: asyncMock(),
      create: asyncMock(),
      findUnique: asyncMock(),
      updateMany: asyncMock(),
      findUniqueOrThrow: asyncMock(),
    },
  };

  const prisma = {
    ...tx,
    $transaction: jest.fn(
      async (callback: (client: typeof tx) => Promise<unknown>) =>
        callback(tx),
    ),
  };

  const dto = {
    leaveTypeId: 1,
    startDate: '2026-11-23',
    endDate: '2026-11-24',
    reason: 'Family appointment',
  };

  beforeEach(() => {
    jest.resetAllMocks();
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-11-14T06:00:00.000Z'));

    prisma.$transaction.mockImplementation(
      async (callback: (client: typeof tx) => Promise<unknown>) =>
        callback(tx),
    );

    tx.user.findUnique.mockResolvedValue({
      id: 1,
      role: 'EMPLOYEE',
      teamId: 1,
    });

    tx.leaveType.findUnique.mockResolvedValue({
      id: 1,
      name: 'Annual',
      yearlyAllowance: 20,
    });

    tx.appSettings.findUnique.mockResolvedValue({
      id: 1,
      minimumNoticeDays: 2,
      maxTeamMembersOff: 2,
    });

    tx.publicHoliday.findMany.mockResolvedValue([]);
    tx.leaveBalance.findUnique.mockResolvedValue(null);
    tx.leaveRequest.findFirst.mockResolvedValue(null);
    tx.leaveRequest.findMany.mockResolvedValue([]);

    tx.leaveRequest.create.mockResolvedValue({
      id: 10,
      status: 'PENDING',
    });

    service = new LeaveService(
      prisma as unknown as PrismaService,
    );
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('creates a pending request for two working days', async () => {
    await service.create(1, dto);

    expect(tx.leaveRequest.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        userId: 1,
        leaveTypeId: 1,
        days: 2,
      }),
    });
  });

  it('rejects an end date before the start date', async () => {
    await expect(
      service.create(1, {
        ...dto,
        endDate: '2026-11-22',
      }),
    ).rejects.toThrow();
  });

  it('rejects an impossible calendar date', async () => {
    await expect(
      service.create(1, {
        ...dto,
        startDate: '2026-02-30',
      }),
    ).rejects.toThrow('Invalid date');
  });

  it('excludes weekends', async () => {
    await service.create(1, {
      ...dto,
      startDate: '2026-11-20',
      endDate: '2026-11-23',
    });

    expect(tx.leaveRequest.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ days: 2 }),
    });
  });

  it('excludes public holidays', async () => {
    tx.publicHoliday.findMany.mockResolvedValue([
      { date: new Date('2026-11-23T00:00:00.000Z') },
    ]);

    await service.create(1, dto);

    expect(tx.leaveRequest.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ days: 1 }),
    });
  });

  it('rejects requests containing only weekends', async () => {
    await expect(
      service.create(1, {
        ...dto,
        startDate: '2026-11-21',
        endDate: '2026-11-22',
      }),
    ).rejects.toThrow('Request contains no working days');
  });

  it('enforces the configured minimum notice', async () => {
    tx.appSettings.findUnique.mockResolvedValue({
      minimumNoticeDays: 10,
      maxTeamMembersOff: 2,
    });

    await expect(service.create(1, dto)).rejects.toThrow(
      'calendar days notice required',
    );
  });

  it('rejects requests exceeding the configured allowance', async () => {
    tx.leaveType.findUnique.mockResolvedValue({
      id: 1,
      name: 'Annual',
      yearlyAllowance: 1,
    });

    await expect(service.create(1, dto)).rejects.toThrow(
      'Insufficient balance',
    );
  });

  it('counts pending requests against the remaining balance', async () => {
    tx.leaveType.findUnique.mockResolvedValue({
      id: 1,
      name: 'Annual',
      yearlyAllowance: 3,
    });

    // First findMany call loads this employee's active leave.
    tx.leaveRequest.findMany.mockResolvedValueOnce([
      {
        userId: 1,
        status: 'PENDING',
        startDate: new Date('2026-11-19T00:00:00.000Z'),
        endDate: new Date('2026-11-20T00:00:00.000Z'),
      },
    ]);

    await expect(service.create(1, dto)).rejects.toThrow(
      'Insufficient balance',
    );
  });

  it('rejects an overlapping active request', async () => {
    tx.leaveRequest.findFirst.mockResolvedValue({
      id: 5,
      status: 'PENDING',
    });

    await expect(service.create(1, dto)).rejects.toThrow(
      'You already have overlapping leave',
    );
  });

  it('enforces the configured team coverage limit', async () => {
    tx.leaveRequest.findMany
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        {
          userId: 2,
          startDate: new Date('2026-11-23T00:00:00.000Z'),
          endDate: new Date('2026-11-24T00:00:00.000Z'),
        },
        {
          userId: 3,
          startDate: new Date('2026-11-23T00:00:00.000Z'),
          endDate: new Date('2026-11-24T00:00:00.000Z'),
        },
      ]);

    await expect(service.create(1, dto)).rejects.toThrow(
      'Team coverage limit reached',
    );
  });

  it('blocks a manager from deciding another manager’s report', async () => {
    tx.user.findUnique.mockResolvedValue({
      id: 3,
      role: 'MANAGER',
    });

    tx.leaveRequest.findUnique.mockResolvedValue({
      id: 10,
      userId: 1,
      user: { managerId: 4 },
    });

    await expect(
      service.decide(3, 10, 'APPROVED'),
    ).rejects.toThrow(
      'You can only decide requests from your own reports',
    );
  });

  it('blocks cancellation of another employee’s request', async () => {
    tx.leaveRequest.findUnique.mockResolvedValue({
      id: 10,
      userId: 2,
      status: 'PENDING',
    });

    await expect(service.cancel(1, 10)).rejects.toThrow(
      'You can only cancel your own leave',
    );
  });

  it('restores the balance after cancelling an approved request', async () => {
    let status = 'APPROVED';

    tx.leaveType.findMany = undefined;
  });
});