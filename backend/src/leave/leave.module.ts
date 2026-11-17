import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { MailModule } from '../mail/mail.module';
import { PrismaModule } from '../prisma/prisma.module';
import { LeaveController } from './leave.controller';
import { LeaveService } from './leave.service';

@Module({
  imports: [
    AuthModule,
    MailModule,
    PrismaModule,
  ],
  controllers: [LeaveController],
  providers: [LeaveService],
})
export class LeaveModule {}