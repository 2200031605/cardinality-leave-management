import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { PrismaModule } from '../prisma/prisma.module';
import { LeaveController } from './leave.controller';
import { LeaveService } from './leave.service';

@Module({
  imports: [AuthModule, PrismaModule],
  controllers: [LeaveController],
  providers: [LeaveService],
})
export class LeaveModule {}