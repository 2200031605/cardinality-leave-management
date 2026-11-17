import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  jest,
} from '@jest/globals';
import { Logger } from '@nestjs/common';
import { LeaveService } from './leave.service';
import { PrismaService } from '../prisma/prisma.service';
import { MailService } from '../mail/mail.service';

function asyncMock() {
  return jest.fn<(...args: unknown[]) => Promise<unknown>>();
}

describe('LeaveService', () => {
  let service: LeaveService;
  let transactionCommitted: boolean;

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

  // Separate lookup used after the transaction for notifications.
  const notificationLookup = asyncMock();

  const prisma = {
    ...tx,
    leaveRequest: {
      ...tx.leaveRequest,
      findUnique: notificationLookup,
    },
    $transaction: jest.fn(
      async (callback: (client: typeof tx) => Promise<unknown>) =>
        callback(tx),
    ),
  };

  const mail = {
    sendLeaveRequestNotification: asyncMock(),
    sendLeaveDecisionNotification: asyncMock(),
  };

  const dto = {
    leaveTypeId: 1,
    startDate: '2026-11-23',
    endDate: '2026-11-24',
    reason: 'Family appointment',
  };

  function notificationRecord() {
    return {
      startDate: new Date('2026-11-23T00:00:00.000Z'),
      endDate: new Date('2026-11-24T00:00:00.000Z'),
      days: 2,
      leaveType: { name: 'Annual' },
      user: {
        name: 'Test Employee',
        email: 'employee@example.com',
        manager: {
          email: 'manager@example.com',
          role: 'MANAGER',
        },
      },
    };
  }

  function prepareDecision() {
    tx.user.findUnique.mockResolvedValue({
      id: 3,
      role: 'MANAGER',
    });

    tx.leaveRequest.findUnique.mockResolvedValue({
      id: 10,
      userId: 1,
      user: { managerId: 3 },
    });

    tx.leaveRequest.updateMany.mockResolvedValue({
      count: 1,
    });

    tx.leaveRequest.findUniqueOrThrow.mockResolvedValue({
      id: 10,
      userId: 1,
      status: 'APPROVED',
    });

    notificationLookup.mockResolvedValue(
      notificationRecord(),
    );
  }

  beforeEach(() => {
    jest.resetAllMocks();
    jest.useFakeTimers();
    jest.setSystemTime(
      new Date('2026-11-14T06:00:00.000Z'),
    );

    transactionCommitted = false;

    jest
      .spyOn(Logger.prototype, 'warn')
      .mockImplementation(() => undefined);

    prisma.$transaction.mockImplementation(
      async (callback: (client: typeof tx) => Promise<unknown>) => {
        const result = await callback(tx);
        transactionCommitted = true;
        return result;
      },
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
    tx.leaveRequest.findUnique.mockResolvedValue(null);

    tx.leaveRequest.create.mockResolvedValue({
      id: 10,
      status: 'PENDING',
    });

    notificationLookup.mockResolvedValue(null);

    mail.sendLeaveRequestNotification.mockResolvedValue(
      undefined,
    );
    mail.sendLeaveDecisionNotification.mockResolvedValue(
      undefined,
    );

    service = new LeaveService(
      prisma as unknown as PrismaService,
      mail as unknown as MailService,
    );
  });

  afterEach(() => {
    jest.restoreAllMocks();
    jest.useRealTimers();
  });

  it('creates a pending request for two working days', async () => {
    const result = await service.create(1, dto);

    expect(result.status).toBe('PENDING');

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
    ).rejects.toThrow(
      'End date cannot precede start date',
    );
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
      data: expect.objectContaining({
        days: 2,
      }),
    });
  });

  it('excludes public holidays', async () => {
    tx.publicHoliday.findMany.mockResolvedValue([
      {
        date: new Date('2026-11-23T00:00:00.000Z'),
      },
    ]);

    await service.create(1, dto);

    expect(tx.leaveRequest.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        days: 1,
      }),
    });
  });

  it('rejects requests containing only weekends', async () => {
    await expect(
      service.create(1, {
        ...dto,
        startDate: '2026-11-21',
        endDate: '2026-11-22',
      }),
    ).rejects.toThrow(
      'Request contains no working days',
    );
  });

  it('enforces the configured minimum notice', async () => {
    tx.appSettings.findUnique.mockResolvedValue({
      minimumNoticeDays: 10,
      maxTeamMembersOff: 2,
    });

    await expect(
      service.create(1, dto),
    ).rejects.toThrow(
      'calendar days notice required',
    );
  });

  it('rejects requests exceeding the configured allowance', async () => {
    tx.leaveType.findUnique.mockResolvedValue({
      id: 1,
      name: 'Annual',
      yearlyAllowance: 1,
    });

    await expect(
      service.create(1, dto),
    ).rejects.toThrow('Insufficient balance');
  });

  it('counts pending requests against the remaining balance', async () => {
    tx.leaveType.findUnique.mockResolvedValue({
      id: 1,
      name: 'Annual',
      yearlyAllowance: 3,
    });

    tx.leaveRequest.findMany.mockResolvedValueOnce([
      {
        userId: 1,
        status: 'PENDING',
        startDate: new Date('2026-11-19T00:00:00.000Z'),
        endDate: new Date('2026-11-20T00:00:00.000Z'),
      },
    ]);

    await expect(
      service.create(1, dto),
    ).rejects.toThrow('Insufficient balance');
  });

  it('rejects an overlapping active request', async () => {
    tx.leaveRequest.findFirst.mockResolvedValue({
      id: 5,
      status: 'PENDING',
    });

    await expect(
      service.create(1, dto),
    ).rejects.toThrow(
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

    await expect(
      service.create(1, dto),
    ).rejects.toThrow(
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

    expect(
      mail.sendLeaveDecisionNotification,
    ).not.toHaveBeenCalled();
  });

  it('blocks cancellation of another employee’s request', async () => {
    notificationLookup.mockResolvedValue({
      id: 10,
      userId: 2,
      status: 'PENDING',
    });

    await expect(
      service.cancel(1, 10),
    ).rejects.toThrow(
      'You can only cancel your own leave',
    );
  });

  it('cancels an approved request', async () => {
    notificationLookup.mockResolvedValue({
      id: 10,
      userId: 1,
      status: 'APPROVED',
    });

    tx.leaveRequest.updateMany.mockResolvedValue({
      count: 1,
    });

    tx.leaveRequest.findUniqueOrThrow.mockResolvedValue({
      id: 10,
      userId: 1,
      status: 'CANCELLED',
    });

    const result = await service.cancel(1, 10);

    expect(result.status).toBe('CANCELLED');

    expect(tx.leaveRequest.updateMany).toHaveBeenCalledWith({
      where: {
        id: 10,
        userId: 1,
        status: {
          in: ['PENDING', 'APPROVED'],
        },
      },
      data: {
        status: 'CANCELLED',
      },
    });
  });

  it('notifies the manager after the creation transaction resolves', async () => {
    notificationLookup.mockResolvedValue(
      notificationRecord(),
    );

    let committedWhenEmailSent = false;

    mail.sendLeaveRequestNotification.mockImplementation(
      async () => {
        committedWhenEmailSent = transactionCommitted;
      },
    );

    await service.create(1, dto);

    expect(committedWhenEmailSent).toBe(true);

    expect(
      mail.sendLeaveRequestNotification,
    ).toHaveBeenCalledWith({
      managerEmail: 'manager@example.com',
      employeeName: 'Test Employee',
      leaveType: 'Annual',
      startDate: '2026-11-23',
      endDate: '2026-11-24',
      days: 2,
    });
  });

  it('returns the saved request even when manager email fails', async () => {
    notificationLookup.mockResolvedValue(
      notificationRecord(),
    );

    mail.sendLeaveRequestNotification.mockRejectedValue(
      new Error('SMTP unavailable'),
    );

    await expect(
      service.create(1, dto),
    ).resolves.toEqual({
      id: 10,
      status: 'PENDING',
    });

    expect(transactionCommitted).toBe(true);
    expect(
      mail.sendLeaveRequestNotification,
    ).toHaveBeenCalledTimes(1);
  });

  it('does not send a notification when creation fails', async () => {
    tx.leaveRequest.create.mockRejectedValue(
      new Error('Database write failed'),
    );

    await expect(
      service.create(1, dto),
    ).rejects.toThrow('Database write failed');

    expect(transactionCommitted).toBe(false);
    expect(notificationLookup).not.toHaveBeenCalled();

    expect(
      mail.sendLeaveRequestNotification,
    ).not.toHaveBeenCalled();
  });

  it.each(['APPROVED', 'REJECTED'] as const)(
    'notifies the employee after a request is %s',
    async (status) => {
      prepareDecision();

      tx.leaveRequest.findUniqueOrThrow.mockResolvedValue({
        id: 10,
        userId: 1,
        status,
      });

      let committedWhenEmailSent = false;

      mail.sendLeaveDecisionNotification.mockImplementation(
        async () => {
          committedWhenEmailSent = transactionCommitted;
        },
      );

      const result = await service.decide(3, 10, status);

      expect(result.status).toBe(status);
      expect(committedWhenEmailSent).toBe(true);

      expect(
        mail.sendLeaveDecisionNotification,
      ).toHaveBeenCalledWith({
        employeeEmail: 'employee@example.com',
        leaveType: 'Annual',
        startDate: '2026-11-23',
        endDate: '2026-11-24',
        status,
      });
    },
  );

  it('returns the saved decision even when employee email fails', async () => {
    prepareDecision();

    mail.sendLeaveDecisionNotification.mockRejectedValue(
      new Error('SMTP unavailable'),
    );

    await expect(
      service.decide(3, 10, 'APPROVED'),
    ).resolves.toEqual({
      id: 10,
      userId: 1,
      status: 'APPROVED',
    });

    expect(transactionCommitted).toBe(true);

    expect(
      mail.sendLeaveDecisionNotification,
    ).toHaveBeenCalledTimes(1);
  });
});