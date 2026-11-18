import {
  BadRequestException,
  Injectable,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { LeaveService } from '../leave/leave.service';
import type { AuthUser } from '../auth/jwt-auth.guard';
import type { AskAssistantDto } from './ask-assistant.dto';

@Injectable()
export class AssistantService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly leave: LeaveService,
  ) {}

  async ask(user: AuthUser, dto: AskAssistantDto) {
    let answer: string;

    switch (dto.topic) {
      case 'policies':
        answer = await this.getPolicies();
        break;

      case 'balance':
        answer = await this.getBalance(
          user.sub,
          dto.year ?? new Date().getFullYear(),
        );
        break;

      case 'requests':
        answer = await this.getRequests(user.sub);
        break;

      default:
        throw new BadRequestException(
          'Choose Policies, My leave balance or My latest requests.',
        );
    }

    return {
      answer,
      topic: dto.topic,
      source: 'database',
      generatedAt: new Date().toISOString(),
    };
  }

  private async getPolicies(): Promise<string> {
    const [settings, types] = await Promise.all([
      this.prisma.appSettings.findUnique({
        where: { id: 1 },
        select: {
          minimumNoticeDays: true,
          maxTeamMembersOff: true,
        },
      }),
      this.prisma.leaveType.findMany({
        select: {
          name: true,
          yearlyAllowance: true,
        },
        orderBy: { name: 'asc' },
      }),
    ]);

    const rules = settings
      ? [
          `Minimum notice: ${settings.minimumNoticeDays} calendar days.`,
          `Maximum team members off per working day: ${settings.maxTeamMembersOff}.`,
        ].join('\n')
      : 'Policy settings are not configured. Contact your administrator.';

    const allowances = types.length
      ? types
          .map(
            (type) =>
              `• ${type.name}: ${type.yearlyAllowance} days per year`,
          )
          .join('\n')
      : 'No leave types are configured.';

    return [
      'Leave policies',
      '',
      rules,
      '',
      'Yearly allowances',
      allowances,
      '',
      'How to apply',
      '1. Open Request leave.',
      '2. Choose the leave type, start date and end date.',
      '3. Enter your reason and submit the request.',
      '',
      'Important rules',
      '• End date cannot be before start date.',
      '• Weekends and configured public holidays do not count as leave days.',
      '• Pending and approved requests reserve your balance.',
      '• Overlapping active requests are blocked.',
      '• Cancel your pending or approved requests through My requests to restore reserved days.',
      '• Managers review requests from their direct reports and cannot approve their own requests.',
      '• View history opens the request audit page.',
    ].join('\n');
  }

  private async getBalance(
    userId: number,
    year: number,
  ): Promise<string> {
    if (
      !Number.isInteger(year) ||
      year < 1900 ||
      year > 9999
    ) {
      throw new BadRequestException(
        'Enter a valid year from 1900 to 9999.',
      );
    }

    const balances = await this.leave.getMyBalances(
      userId,
      year,
    );

    if (!balances.length) {
      return `No leave balances are configured for ${year}.`;
    }

    const details = balances
      .map((balance) =>
        [
          `${balance.name}: ${balance.remaining} days remaining`,
          `Allowance: ${balance.allowance}`,
          `Pending: ${balance.pending}`,
          `Approved: ${balance.approved}`,
        ].join('\n'),
      )
      .join('\n\n');

    return [
      `Your leave balance for ${year}`,
      '',
      details,
      '',
      'Pending and approved requests reserve your balance.',
    ].join('\n');
  }

  private async getRequests(userId: number): Promise<string> {
    const requests = await this.prisma.leaveRequest.findMany({
      where: {
        userId,
      },
      orderBy: [
        { createdAt: 'desc' },
        { id: 'desc' },
      ],
      take: 10,
      select: {
        id: true,
        status: true,
        startDate: true,
        endDate: true,
        days: true,
        leaveType: {
          select: {
            name: true,
          },
        },
      },
    });

    if (!requests.length) {
      return 'You have no leave requests. Open Request leave to submit one.';
    }

    const details = requests
      .map((request) =>
        [
          `#${request.id} — ${request.leaveType.name}`,
          `Status: ${request.status}`,
          `Dates: ${request.startDate.toISOString().slice(0, 10)} to ${request.endDate.toISOString().slice(0, 10)}`,
          `Working days: ${request.days}`,
        ].join('\n'),
      )
      .join('\n\n');

    return [
      'Your latest leave requests',
      '',
      details,
      '',
      'Shows up to 10 latest requests across all years.',
      'Open My requests to filter requests or view their history.',
    ].join('\n');
  }
}