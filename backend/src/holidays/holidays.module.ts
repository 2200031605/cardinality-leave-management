import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { PrismaModule } from '../prisma/prisma.module';
import { HolidaysController } from './holidays.controller';
import { HolidaysService } from './holidays.service';

@Module({
  imports: [AuthModule, PrismaModule],
  controllers: [HolidaysController],
  providers: [HolidaysService],
})
export class HolidaysModule {}