import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateLeaveTypeDto } from './create-leave-type.dto';
import { AssignEmployeeDto } from './assign-employee.dto';
import {
  UpdateAllowanceDto,
  UpdateSettingsDto,
} from './update-settings.dto';

@Injectable()
export class AdminService {
  constructor(private readonly prisma: PrismaService) {}

  getSettings() {
    return this.prisma.appSettings.findUnique({
      where: { id: 1 },
    });
  }

  updateSettings(dto: UpdateSettingsDto) {
    return this.prisma.appSettings.upsert({
      where: { id: 1 },
      create: {
        id: 1,
        minimumNoticeDays: dto.minimumNoticeDays,
        maxTeamMembersOff: dto.maxTeamMembersOff,
      },
      update: {
        minimumNoticeDays: dto.minimumNoticeDays,
        maxTeamMembersOff: dto.maxTeamMembersOff,
      },
    });
  }

  async updateAllowance(id: number, dto: UpdateAllowanceDto) {
    const result = await this.prisma.leaveType.updateMany({
      where: { id },
      data: {
        yearlyAllowance: dto.yearlyAllowance,
      },
    });

    if (result.count === 0) {
      throw new NotFoundException('Leave type not found');
    }

    return this.prisma.leaveType.findUniqueOrThrow({
      where: { id },
    });
  }

  async createLeaveType(dto: CreateLeaveTypeDto) {
    const name = dto.name.trim();

    if (name.length < 2) {
      throw new BadRequestException(
        'Leave type name must contain at least 2 characters',
      );
    }

    try {
      return await this.prisma.leaveType.create({
        data: {
          name,
          yearlyAllowance: dto.yearlyAllowance,
        },
      });
    } catch (error) {
      if (
        typeof error === 'object' &&
        error !== null &&
        'code' in error &&
        error.code === 'P2002'
      ) {
        throw new ConflictException('Leave type already exists');
      }

      throw error;
    }
  }

  getEmployees() {
  return this.prisma.user.findMany({
    where: { role: 'EMPLOYEE' },
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
    orderBy: { createdAt: 'desc' },
  });
}

async getEmployeeOptions() {
  const [teams, managers] = await Promise.all([
    this.prisma.team.findMany({
      select: { id: true, name: true },
      orderBy: { name: 'asc' },
    }),
    this.prisma.user.findMany({
      where: { role: 'MANAGER' },
      select: {
        id: true,
        name: true,
        email: true,
        teamId: true,
      },
      orderBy: { name: 'asc' },
    }),
  ]);

  return { teams, managers };
}

async assignEmployee(id: number, dto: AssignEmployeeDto) {
  return this.prisma.$transaction(async (tx) => {
    const employee = await tx.user.findUnique({
      where: { id },
    });

    if (!employee || employee.role !== 'EMPLOYEE') {
      throw new NotFoundException('Employee not found');
    }

    const team = await tx.team.findUnique({
      where: { id: dto.teamId },
    });

    if (!team) {
      throw new NotFoundException('Team not found');
    }

    const manager = await tx.user.findUnique({
      where: { id: dto.managerId },
    });

    if (
      !manager ||
      manager.role !== 'MANAGER' ||
      manager.teamId !== dto.teamId
    ) {
      throw new BadRequestException(
        'Select a manager belonging to the selected team',
      );
    }

    // Existing active leave must retain its team coverage context.
    if (
      employee.teamId !== null &&
      employee.teamId !== dto.teamId
    ) {
      const activeLeave = await tx.leaveRequest.findFirst({
        where: {
          userId: id,
          status: { in: ['PENDING', 'APPROVED'] },
          endDate: {
            gte: new Date(
              new Date().toISOString().slice(0, 10) +
                'T00:00:00.000Z',
            ),
          },
        },
      });

      if (activeLeave) {
        throw new BadRequestException(
          'Resolve current and future active leave before changing teams',
        );
      }
    }

    return tx.user.update({
      where: { id },
      data: {
        teamId: dto.teamId,
        managerId: dto.managerId,
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
  }, { isolationLevel: 'Serializable' });
}
}