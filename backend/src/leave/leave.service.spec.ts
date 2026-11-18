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
    leaveAudit: {
      create: asyncMock(),
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

  const notificationLookup = asyncMock();
  const historyLookup = asyncMock();

  const prisma = {
    ...tx,
    leaveRequest: {
      ...tx.leaveRequest,
      findUnique: notificationLookup,
      findFirst: historyLookup,
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
      status: 'PENDING',
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
    tx.leaveAudit.create.mockResolvedValue({ id: 1 });

    tx.leaveRequest.findFirst.mockResolvedValue(null);
    tx.leaveRequest.findMany.mockResolvedValue([]);
    tx.leaveRequest.findUnique.mockResolvedValue(null);

    tx.leaveRequest.create.mockResolvedValue({
      id: 10,
      status: 'PENDING',
    });

    notificationLookup.mockResolvedValue(null);
    historyLookup.mockResolvedValue(null);

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

  it('creates a pending request and its audit entry', async () => {
    const result = await service.create(1, dto);

    expect(result.status).toBe('PENDING');

    expect(tx.leaveRequest.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        userId: 1,
        leaveTypeId: 1,
        days: 2,
      }),
    });

    expect(tx.leaveAudit.create).toHaveBeenCalledWith({
      data: {
        requestId: 10,
        actorId: 1,
        action: 'REQUESTED',
        fromStatus: null,
        toStatus: 'PENDING',
      },
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
      data: expect.objectContaining({ days: 2 }),
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
    ).rejects.toThrow('Team coverage limit reached');
  });

  it('blocks decisions on another manager’s report', async () => {
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

    expect(tx.leaveAudit.create).not.toHaveBeenCalled();

    expect(
      mail.sendLeaveDecisionNotification,
    ).not.toHaveBeenCalled();
  });

  it('blocks cancellation of another employee’s request', async () => {
    tx.leaveRequest.findUnique.mockResolvedValue({
      id: 10,
      userId: 2,
      status: 'PENDING',
    });

    await expect(
      service.cancel(1, 10),
    ).rejects.toThrow(
      'You can only cancel your own leave',
    );

    expect(tx.leaveAudit.create).not.toHaveBeenCalled();
  });

  it('cancels approved leave and records its previous status', async () => {
    tx.leaveRequest.findUnique.mockResolvedValue({
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
        status: 'APPROVED',
      },
      data: {
        status: 'CANCELLED',
      },
    });

    expect(tx.leaveAudit.create).toHaveBeenCalledWith({
      data: {
        requestId: 10,
        actorId: 1,
        action: 'CANCELLED',
        fromStatus: 'APPROVED',
        toStatus: 'CANCELLED',
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

  it('returns the saved request when manager email fails', async () => {
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

  it('does not send email when request creation fails', async () => {
    tx.leaveRequest.create.mockRejectedValue(
      new Error('Database write failed'),
    );

    await expect(
      service.create(1, dto),
    ).rejects.toThrow('Database write failed');

    expect(transactionCommitted).toBe(false);
    expect(tx.leaveAudit.create).not.toHaveBeenCalled();

    expect(
      mail.sendLeaveRequestNotification,
    ).not.toHaveBeenCalled();
  });

  it.each(['APPROVED', 'REJECTED'] as const)(
    'records and emails a %s decision',
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

      expect(tx.leaveAudit.create).toHaveBeenCalledWith({
        data: {
          requestId: 10,
          actorId: 3,
          action: status,
          fromStatus: 'PENDING',
          toStatus: status,
        },
      });

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

  it('returns the saved decision when employee email fails', async () => {
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
  });

  it('does not finish creation or send email when audit writing fails', async () => {
    tx.leaveAudit.create.mockRejectedValue(
      new Error('Audit write failed'),
    );

    await expect(
      service.create(1, dto),
    ).rejects.toThrow('Audit write failed');

    expect(transactionCommitted).toBe(false);

    expect(
      mail.sendLeaveRequestNotification,
    ).not.toHaveBeenCalled();
  });

  it('does not finish a decision when audit writing fails', async () => {
    prepareDecision();

    tx.leaveAudit.create.mockRejectedValue(
      new Error('Audit write failed'),
    );

    await expect(
      service.decide(3, 10, 'APPROVED'),
    ).rejects.toThrow('Audit write failed');

    expect(transactionCommitted).toBe(false);

    expect(
      mail.sendLeaveDecisionNotification,
    ).not.toHaveBeenCalled();
  });

  it('does not record cancellation when the request changed concurrently', async () => {
    tx.leaveRequest.findUnique.mockResolvedValue({
      id: 10,
      userId: 1,
      status: 'PENDING',
    });

    tx.leaveRequest.updateMany.mockResolvedValue({
      count: 0,
    });

    await expect(
      service.cancel(1, 10),
    ).rejects.toThrow(
      'Request changed. Refresh and try again.',
    );

    expect(tx.leaveAudit.create).not.toHaveBeenCalled();
  });

  it('restricts an employee audit query to their own request', async () => {
    tx.user.findUnique.mockResolvedValue({
      id: 1,
      role: 'EMPLOYEE',
    });

    const events = [
      {
        id: 1,
        action: 'REQUESTED',
        actor: { id: 1, name: 'Employee' },
      },
    ];

    historyLookup.mockResolvedValue({
      id: 10,
      auditEvents: events,
    });

    await expect(
      service.getAudit(1, 10),
    ).resolves.toEqual(events);

    expect(historyLookup).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          id: 10,
          userId: 1,
        },
      }),
    );
  });

  it('scopes manager audit queries to self or direct reports', async () => {
    tx.user.findUnique.mockResolvedValue({
      id: 3,
      role: 'MANAGER',
    });

    historyLookup.mockResolvedValue({
      id: 10,
      auditEvents: [],
    });

    await service.getAudit(3, 10);

    expect(historyLookup).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          id: 10,
          OR: [
            { userId: 3 },
            { user: { managerId: 3 } },
          ],
        },
      }),
    );
  });

  it('allows an admin audit query without an ownership restriction', async () => {
    tx.user.findUnique.mockResolvedValue({
      id: 2,
      role: 'ADMIN',
    });

    historyLookup.mockResolvedValue({
      id: 10,
      auditEvents: [],
    });

    await service.getAudit(2, 10);

    expect(historyLookup).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 10 },
      }),
    );
  });

  it('returns an error when no accessible audit request is found', async () => {
    tx.user.findUnique.mockResolvedValue({
      id: 1,
      role: 'EMPLOYEE',
    });

    historyLookup.mockResolvedValue(null);

    await expect(
      service.getAudit(1, 999),
    ).rejects.toThrow(
      'Request not found or access denied',
    );
  });
});