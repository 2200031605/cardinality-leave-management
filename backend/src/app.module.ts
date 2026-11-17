import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { LeaveModule } from './leave/leave.module';
import { AdminModule } from './admin/admin.module';
import { HolidaysModule } from './holidays/holidays.module';
import { SignupModule } from './signup/signup.module';
import { PasswordResetModule } from './password-reset/password-reset.module';
@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    PrismaModule,
    SignupModule,
    AuthModule,
    UsersModule,
    LeaveModule,
    AdminModule,
    HolidaysModule,
    PasswordResetModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}