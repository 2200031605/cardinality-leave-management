import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateLeaveDto } from './create-leave.dto';

const DAY = 86400000;

function parseDate(value: string) {
  const date = new Date(`${value}T00:00:00.000Z`);
  if (
    !Number.isFinite(date.getTime()) ||
    date.toISOString().slice(0, 10) !== value
  ) {
    throw new BadRequestException('Invalid date');
  }
  return date;
}

function workingDays(start: Date, end: Date, holidays: Set<string>) {
  const days: Date[] = [];
  for (let time = +start; time <= +end; time += DAY) {
    const date = new Date(time);
    if (
      date.getUTCDay() !== 0 &&
      date.getUTCDay() !== 6 &&
      !holidays.has(date.toISOString().slice(0, 10))
    ) {
      days.push(date);
    }
  }
  return days;
}

@Injectable()
export class LeaveService {
  constructor(private readonly prisma: PrismaService) {}

  getLeaveTypes() {
    return this.prisma.leaveType.findMany({
      orderBy: { name: 'asc' },
    });
  }

  getMyRequests(userId: number) {
    return this.prisma.leaveRequest.findMany({
      where: { userId },
      include: { leaveType: true },
      orderBy: { createdAt: 'desc' },
    });
  }

  getTeamRequests(managerId: number) {
    return this.prisma.leaveRequest.findMany({
      where: { user: { managerId } },
      include: {
        user: { select: { id: true, name: true, email: true } },
        leaveType: true,
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async create(userId: number, dto: CreateLeaveDto) {
    const start = parseDate(dto.startDate);
    const end = parseDate(dto.endDate);
    const reason = dto.reason.trim();

    if (end < start) {
      throw new BadRequestException('End date cannot precede start date');
    }
    if (reason.length < 3) {
      throw new BadRequestException('Enter a meaningful reason');
    }
    if (+end - +start > 366 * DAY) {
      throw new BadRequestException('Request cannot span more than 367 days');
    }

    try {
      return await this.prisma.$transaction(async (tx) => {
        const user = await tx.user.findUnique({ where: { id: userId } });
        const type = await tx.leaveType.findUnique({
          where: { id: dto.leaveTypeId },
        });
        const settings = await tx.appSettings.findUnique({
          where: { id: 1 },
        });

        if (!user) throw new BadRequestException('User not found');
        if (!type) throw new BadRequestException('Leave type not found');
        if (!settings) {
          throw new BadRequestException('Admin must configure leave settings');
        }
        if (user.teamId === null) {
          throw new BadRequestException('Admin must assign you to a team');
        }

        const now = new Date();
        const today = Date.UTC(
          now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(),
        );
        if (+start < today + settings.minimumNoticeDays * DAY) {
          throw new BadRequestException(
            `At least ${settings.minimumNoticeDays} calendar days notice required`,
          );
        }

        const holidayRows = await tx.publicHoliday.findMany();
        const holidays = new Set(
          holidayRows.map((h) => h.date.toISOString().slice(0, 10)),
        );
        const dates = workingDays(start, end, holidays);
        if (!dates.length) {
          throw new BadRequestException('Request contains no working days');
        }

        const overlap = await tx.leaveRequest.findFirst({
          where: {
            userId,
            status: { in: ['PENDING', 'APPROVED'] },
            startDate: { lte: end },
            endDate: { gte: start },
          },
        });
        if (overlap) {
          throw new ConflictException('You already have overlapping leave');
        }

        for (
          let year = start.getUTCFullYear();
          year <= end.getUTCFullYear();
          year++
        ) {
          const first = new Date(Date.UTC(year, 0, 1));
          const last = new Date(Date.UTC(year, 11, 31));
          const existing = await tx.leaveRequest.findMany({
            where: {
              userId,
              leaveTypeId: dto.leaveTypeId,
              status: { in: ['PENDING', 'APPROVED'] },
              startDate: { lte: last },
              endDate: { gte: first },
            },
          });
          const adjustment = await tx.leaveBalance.findUnique({
            where: {
              userId_leaveTypeId_year: {
                userId, leaveTypeId: dto.leaveTypeId, year,
              },
            },
          });
          const used = existing.reduce((total, request) => {
            const from = request.startDate > first ? request.startDate : first;
            const to = request.endDate < last ? request.endDate : last;
            return total + workingDays(from, to, holidays).length;
          }, 0);
          const requested = dates.filter(
            (date) => date.getUTCFullYear() === year,
          ).length;
          const remaining =
            type.yearlyAllowance + (adjustment?.adjustment ?? 0) - used;

          if (requested > remaining) {
            throw new BadRequestException(
              `Insufficient balance for ${year}: ${remaining} days remaining`,
            );
          }
        }

        const teamRequests = await tx.leaveRequest.findMany({
          where: {
            user: { teamId: user.teamId },
            status: { in: ['PENDING', 'APPROVED'] },
            startDate: { lte: end },
            endDate: { gte: start },
          },
        });
        for (const date of dates) {
          const off = new Set(
            teamRequests
              .filter((r) => r.startDate <= date && r.endDate >= date)
              .map((r) => r.userId),
          );
          if (off.size >= settings.maxTeamMembersOff) {
            throw new ConflictException(
              `Team coverage limit reached on ${date.toISOString().slice(0, 10)}`,
            );
          }
        }

        return tx.leaveRequest.create({
          data: {
            userId,
            leaveTypeId: dto.leaveTypeId,
            startDate: start,
            endDate: end,
            reason,
            days: dates.length,
          },
        });
      }, { isolationLevel: 'Serializable' });
    } catch (error) {
      if (
        typeof error === 'object' &&
        error !== null &&
        'code' in error &&
        error.code === 'P2034'
      ) {
        throw new ConflictException('Availability changed. Please retry.');
      }
      throw error;
    }
  }

  async decide(
    managerId: number,
    requestId: number,
    status: 'APPROVED' | 'REJECTED',
  ) {
    return this.prisma.$transaction(async (tx) => {
      const manager = await tx.user.findUnique({
        where: { id: managerId },
      });
      if (manager?.role !== 'MANAGER') {
        throw new ForbiddenException('Manager access required');
      }
      const request = await tx.leaveRequest.findUnique({
        where: { id: requestId },
        include: { user: { select: { managerId: true } } },
      });
      if (!request) {
        throw new NotFoundException('Leave request not found');
      }
      if (
        request.userId === managerId ||
        request.user.managerId !== managerId
      ) {
        throw new ForbiddenException(
          'You can only decide requests from your own reports',
        );
      }
      const updated = await tx.leaveRequest.updateMany({
        where: {
          id: requestId,
          status: 'PENDING',
          user: { managerId },
        },
        data: { status, decidedById: managerId },
      });
      if (updated.count !== 1) {
        throw new ConflictException('Request is no longer pending');
      }
      return tx.leaveRequest.findUniqueOrThrow({
        where: { id: requestId },
      });
    });
  }

  async cancel(userId: number, requestId: number) {
    const request = await this.prisma.leaveRequest.findUnique({
      where: { id: requestId },
    });
    if (!request) {
      throw new NotFoundException('Leave request not found');
    }
    if (request.userId !== userId) {
      throw new ForbiddenException('You can only cancel your own leave');
    }
    const updated = await this.prisma.leaveRequest.updateMany({
      where: {
        id: requestId,
        userId,
        status: { in: ['PENDING', 'APPROVED'] },
      },
      data: { status: 'CANCELLED' },
    });
    if (updated.count !== 1) {
      throw new ConflictException(
        'Only pending or approved requests can be cancelled',
      );
    }
    return this.prisma.leaveRequest.findUniqueOrThrow({
      where: { id: requestId },
    });
  }
  async getMyBalances(userId: number, year: number) {
  const first = new Date(Date.UTC(year, 0, 1));
  const last = new Date(Date.UTC(year, 11, 31));

  const [types, adjustments, requests, holidayRows] = await Promise.all([
    this.prisma.leaveType.findMany({
      orderBy: { name: 'asc' },
    }),
    this.prisma.leaveBalance.findMany({
      where: { userId, year },
    }),
    this.prisma.leaveRequest.findMany({
      where: {
        userId,
        status: { in: ['PENDING', 'APPROVED'] },
        startDate: { lte: last },
        endDate: { gte: first },
      },
    }),
    this.prisma.publicHoliday.findMany(),
  ]);

  const holidays = new Set(
    holidayRows.map((holiday) =>
      holiday.date.toISOString().slice(0, 10),
    ),
  );

  return types.map((type) => {
    const adjustment =
      adjustments.find((balance) => balance.leaveTypeId === type.id)
        ?.adjustment ?? 0;

    let pending = 0;
    let approved = 0;

    for (const request of requests) {
      if (request.leaveTypeId !== type.id) continue;

      const from = request.startDate > first ? request.startDate : first;
      const to = request.endDate < last ? request.endDate : last;
      const days = workingDays(from, to, holidays).length;

      if (request.status === 'PENDING') pending += days;
      if (request.status === 'APPROVED') approved += days;
    }

    const allowance = type.yearlyAllowance + adjustment;

    return {
      leaveTypeId: type.id,
      name: type.name,
      year,
      allowance,
      pending,
      approved,
      remaining: allowance - pending - approved,
    };
  });
}
async getTeamCalendar(userId: number, year: number, month: number) {
  if (
    !Number.isInteger(year) ||
    year < 1900 ||
    year > 9999 ||
    !Number.isInteger(month) ||
    month < 1 ||
    month > 12
  ) {
    throw new BadRequestException('Enter a valid year and month');
  }

  const user = await this.prisma.user.findUnique({
    where: { id: userId },
  });

  if (!user) {
    throw new NotFoundException('User not found');
  }

  if (user.teamId === null) {
    throw new BadRequestException('Admin must assign you to a team');
  }

  const start = new Date(Date.UTC(year, month - 1, 1));
  const end = new Date(Date.UTC(year, month, 0));

  const [requests, holidays] = await Promise.all([
    this.prisma.leaveRequest.findMany({
      where: {
        user: { teamId: user.teamId },
        status: { in: ['PENDING', 'APPROVED'] },
        startDate: { lte: end },
        endDate: { gte: start },
      },
      select: {
        id: true,
        startDate: true,
        endDate: true,
        status: true,
        user: {
          select: { id: true, name: true },
        },
      },
      orderBy: { startDate: 'asc' },
    }),
    this.prisma.publicHoliday.findMany({
      where: { date: { gte: start, lte: end } },
      select: { name: true, date: true },
      orderBy: { date: 'asc' },
    }),
  ]);

  return { teamId: user.teamId, year, month, requests, holidays };
}
}