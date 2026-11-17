import {
  BadRequestException,
  ConflictException,
  Injectable,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateHolidayDto } from './create-holiday.dto';

@Injectable()
export class HolidaysService {
  constructor(private readonly prisma: PrismaService) {}

  findAll() {
    return this.prisma.publicHoliday.findMany({
      orderBy: { date: 'asc' },
    });
  }

  async create(dto: CreateHolidayDto) {
    const name = dto.name.trim();
    const date = new Date(`${dto.date}T00:00:00.000Z`);

    if (
      !Number.isFinite(date.getTime()) ||
      date.toISOString().slice(0, 10) !== dto.date
    ) {
      throw new BadRequestException('Invalid holiday date');
    }

    if (name.length < 2) {
      throw new BadRequestException(
        'Holiday name must contain at least 2 characters',
      );
    }

    try {
      return await this.prisma.publicHoliday.create({
        data: { name, date },
      });
    } catch (error) {
      if (
        typeof error === 'object' &&
        error !== null &&
        'code' in error &&
        error.code === 'P2002'
      ) {
        throw new ConflictException(
          'A holiday already exists on this date',
        );
      }

      throw error;
    }
  }
}