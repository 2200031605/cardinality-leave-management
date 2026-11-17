import {
  beforeEach,
  describe,
  expect,
  it,
  jest,
} from '@jest/globals';
import { AdminService } from './admin.service';
import { PrismaService } from '../prisma/prisma.service';

function asyncMock() {
  return jest.fn<(...args: unknown[]) => Promise<unknown>>();
}

describe('AdminService employee assignment', () => {
  let service: AdminService;

  const tx = {
    user: {
      findUnique: asyncMock(),
      update: asyncMock(),
    },
    team: {
      findUnique: asyncMock(),
    },
    leaveRequest: {
      findFirst: asyncMock(),
    },
  };

  const prisma = {
    $transaction: jest.fn(
      async (callback: (client: typeof tx) => Promise<unknown>) =>
        callback(tx),
    ),
  };

  const employee = {
    id: 26,
    name: 'New Employee',
    role: 'EMPLOYEE',
    teamId: null,
    managerId: null,
  };

  const manager = {
    id: 3,
    name: 'Manager',
    role: 'MANAGER',
    teamId: 1,
  };

  beforeEach(() => {
    jest.resetAllMocks();

    prisma.$transaction.mockImplementation(
      async (callback: (client: typeof tx) => Promise<unknown>) =>
        callback(tx),
    );

    tx.user.findUnique
      .mockResolvedValueOnce(employee)
      .mockResolvedValueOnce(manager);

    tx.team.findUnique.mockResolvedValue({
      id: 1,
      name: 'Engineering',
    });

    tx.leaveRequest.findFirst.mockResolvedValue(null);

    tx.user.update.mockResolvedValue({
      id: 26,
      name: 'New Employee',
      email: 'new.employee@example.com',
      teamId: 1,
      managerId: 3,
      team: { id: 1, name: 'Engineering' },
      manager: { id: 3, name: 'Manager' },
    });

    service = new AdminService(
      prisma as unknown as PrismaService,
    );
  });

  it('assigns an employee to a team and its manager', async () => {
    const result = await service.assignEmployee(26, {
      teamId: 1,
      managerId: 3,
    });

    expect(result).toEqual(
      expect.objectContaining({
        id: 26,
        teamId: 1,
        managerId: 3,
      }),
    );

    expect(tx.user.update).toHaveBeenCalledWith({
      where: { id: 26 },
      data: {
        teamId: 1,
        managerId: 3,
      },
      select: {
        id: true,
        name: true,
        email: true,
        teamId: true,
        managerId: true,
        team: {
          select: { id: true, name: true },
        },
        manager: {
          select: { id: true, name: true },
        },
      },
    });

    expect(result).not.toHaveProperty('passwordHash');
  });

  it('rejects a missing employee', async () => {
    tx.user.findUnique.mockReset();
    tx.user.findUnique.mockResolvedValueOnce(null);

    await expect(
      service.assignEmployee(999, {
        teamId: 1,
        managerId: 3,
      }),
    ).rejects.toThrow('Employee not found');

    expect(tx.user.update).not.toHaveBeenCalled();
  });

  it('rejects a missing team', async () => {
    tx.team.findUnique.mockResolvedValue(null);

    await expect(
      service.assignEmployee(26, {
        teamId: 1,
        managerId: 3,
      }),
    ).rejects.toThrow('Team not found');

    expect(tx.user.update).not.toHaveBeenCalled();
  });

  it('rejects a manager from a different team', async () => {
    tx.user.findUnique.mockReset();

    tx.user.findUnique
      .mockResolvedValueOnce(employee)
      .mockResolvedValueOnce({
        ...manager,
        teamId: 2,
      });

    await expect(
      service.assignEmployee(26, {
        teamId: 1,
        managerId: 3,
      }),
    ).rejects.toThrow(
      'Select a manager belonging to the selected team',
    );

    expect(tx.user.update).not.toHaveBeenCalled();
  });

  it('rejects an employee selected as a manager', async () => {
    tx.user.findUnique.mockReset();

    tx.user.findUnique
      .mockResolvedValueOnce(employee)
      .mockResolvedValueOnce({
        ...manager,
        role: 'EMPLOYEE',
      });

    await expect(
      service.assignEmployee(26, {
        teamId: 1,
        managerId: 3,
      }),
    ).rejects.toThrow(
      'Select a manager belonging to the selected team',
    );

    expect(tx.user.update).not.toHaveBeenCalled();
  });

  it('blocks team changes while active leave exists', async () => {
    tx.user.findUnique.mockReset();

    tx.user.findUnique
      .mockResolvedValueOnce({
        ...employee,
        teamId: 2,
      })
      .mockResolvedValueOnce(manager);

    tx.leaveRequest.findFirst.mockResolvedValue({
      id: 100,
      status: 'APPROVED',
    });

    await expect(
      service.assignEmployee(26, {
        teamId: 1,
        managerId: 3,
      }),
    ).rejects.toThrow(
      'Resolve current and future active leave before changing teams',
    );

    expect(tx.user.update).not.toHaveBeenCalled();
  });
});