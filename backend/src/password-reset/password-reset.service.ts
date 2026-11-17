import {
  BadRequestException,
  Injectable,
  Logger,
} from '@nestjs/common';
import { randomInt } from 'node:crypto';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../prisma/prisma.service';
import { MailService } from '../mail/mail.service';
import {
  ForgotPasswordDto,
  ResetPasswordDto,
} from './password-reset.dto';

@Injectable()
export class PasswordResetService {
  private readonly logger = new Logger(
    PasswordResetService.name,
  );

  constructor(
    private readonly prisma: PrismaService,
    private readonly mail: MailService,
  ) {}

  async forgotPassword(dto: ForgotPasswordDto) {
    const email = dto.email.trim().toLowerCase();
    const otp = randomInt(100000, 1000000).toString();
    const otpHash = await bcrypt.hash(otp, 10);

    const shouldSend = await this.prisma.$transaction(
      async (tx) => {
        await tx.$queryRaw`
          SELECT pg_advisory_xact_lock(
            hashtextextended(${email}, 0)
          )::text
        `;

        const user = await tx.user.findUnique({
          where: { email },
          select: { id: true },
        });

        if (!user) return false;

        const existing = await tx.passwordReset.findUnique({
          where: { email },
        });

        const now = new Date();

        if (
          existing &&
          existing.resendAvailableAt.getTime() > now.getTime()
        ) {
          return false;
        }

        const data = {
          otpHash,
          attempts: 0,
          expiresAt: new Date(now.getTime() + 600_000),
          resendAvailableAt: new Date(now.getTime() + 60_000),
        };

        await tx.passwordReset.upsert({
          where: { email },
          create: { email, ...data },
          update: data,
        });

        return true;
      },
    );

    if (shouldSend) {
      try {
        await this.mail.sendPasswordResetOtp(email, otp);
      } catch {
        this.logger.warn(
          'Password reset email delivery failed.',
        );
      }
    }

    // Do not disclose whether the account exists.
    return {
      message:
        'If an account exists for this email, a reset code will be sent. Check your inbox and spam folder.',
      resendAfterSeconds: 60,
      expiresInSeconds: 600,
    };
  }

  async resetPassword(dto: ResetPasswordDto) {
    const email = dto.email.trim().toLowerCase();

    if (dto.password !== dto.confirmPassword) {
      throw new BadRequestException('Passwords do not match');
    }

    if (Buffer.byteLength(dto.password, 'utf8') > 72) {
      throw new BadRequestException(
        'Password must not exceed 72 UTF-8 bytes',
      );
    }

    const result = await this.prisma.$transaction(
      async (tx) => {
        await tx.$queryRaw`
          SELECT pg_advisory_xact_lock(
            hashtextextended(${email}, 0)
          )::text
        `;

        const pending = await tx.passwordReset.findUnique({
          where: { email },
        });

        if (!pending) {
          return {
            ok: false as const,
            message: 'Invalid or expired reset code.',
          };
        }

        if (pending.expiresAt.getTime() <= Date.now()) {
          await tx.passwordReset.delete({
            where: { email },
          });

          return {
            ok: false as const,
            message: 'Invalid or expired reset code.',
          };
        }

        if (pending.attempts >= 5) {
          return {
            ok: false as const,
            message: 'Too many attempts. Request a new code.',
          };
        }

        const valid = await bcrypt.compare(
          dto.otp,
          pending.otpHash,
        );

        if (!valid) {
          await tx.passwordReset.update({
            where: { email },
            data: {
              attempts: { increment: 1 },
            },
          });

          return {
            ok: false as const,
            message: 'Invalid or expired reset code.',
          };
        }

        const user = await tx.user.findUnique({
          where: { email },
          select: { id: true },
        });

        if (!user) {
          await tx.passwordReset.delete({
            where: { email },
          });

          return {
            ok: false as const,
            message: 'Invalid or expired reset code.',
          };
        }

        const passwordHash = await bcrypt.hash(
          dto.password,
          12,
        );

        await tx.user.update({
          where: { id: user.id },
          data: {
            passwordHash,
            tokenVersion: { increment: 1 },
          },
        });

        await tx.passwordReset.delete({
          where: { email },
        });

        return { ok: true as const };
      },
    );

    if (!result.ok) {
      throw new BadRequestException(result.message);
    }

    try {
      await this.mail.sendPasswordChanged(email);
    } catch {
      this.logger.warn(
        'Password changed, but notification email delivery failed.',
      );
    }

    return {
      message:
        'Password reset successfully. Sign in with your new password.',
    };
  }
}