import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
} from '@nestjs/common';
import { randomInt } from 'node:crypto';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../prisma/prisma.service';
import { MailService } from '../mail/mail.service';
import { SignupDto, VerifySignupDto } from './signup.dto';

@Injectable()
export class SignupService {
  private readonly logger = new Logger(SignupService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly mail: MailService,
  ) {}

  async signup(dto: SignupDto) {
    const email = dto.email.trim().toLowerCase();
    const name = dto.name.trim();

    if (name.length < 2) {
      throw new BadRequestException(
        'Name must contain at least 2 characters',
      );
    }

    if (dto.password !== dto.confirmPassword) {
      throw new BadRequestException('Passwords do not match');
    }

    if (Buffer.byteLength(dto.password, 'utf8') > 72) {
      throw new BadRequestException(
        'Password must not exceed 72 UTF-8 bytes',
      );
    }

    const otp = randomInt(100000, 1000000).toString();

    const [passwordHash, otpHash] = await Promise.all([
      bcrypt.hash(dto.password, 12),
      bcrypt.hash(otp, 10),
    ]);

    await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`
        SELECT pg_advisory_xact_lock(
          hashtextextended(${email}, 0)
        )::text
      `;

      const existingUser = await tx.user.findFirst({
        where: {
          email: {
            equals: email,
            mode: 'insensitive',
          },
        },
      });

      if (existingUser) {
        throw new ConflictException(
          'Account already exists. Please sign in.',
        );
      }

      const pending = await tx.pendingSignup.findUnique({
        where: { email },
      });

      const now = new Date();

      if (
        pending &&
        pending.resendAvailableAt.getTime() > now.getTime()
      ) {
        throw new BadRequestException(
          'Wait 60 seconds before requesting another code.',
        );
      }

      const data = {
        name,
        passwordHash,
        otpHash,
        attempts: 0,
        expiresAt: new Date(now.getTime() + 10 * 60 * 1000),
        resendAvailableAt: new Date(now.getTime() + 60 * 1000),
      };

      await tx.pendingSignup.upsert({
        where: { email },
        create: { email, ...data },
        update: data,
      });
    });

    await this.mail.sendSignupOtp(email, otp);

    return {
      message: 'Verification code sent. Check your email.',
      email,
      expiresInSeconds: 600,
      resendAfterSeconds: 60,
    };
  }

  async verify(dto: VerifySignupDto) {
    const email = dto.email.trim().toLowerCase();

    const result = await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`
        SELECT pg_advisory_xact_lock(
          hashtextextended(${email}, 0)
        )::text
      `;

      const pending = await tx.pendingSignup.findUnique({
        where: { email },
      });

      if (!pending) {
        return {
          ok: false as const,
          message: 'No pending signup. Please sign up again.',
        };
      }

      if (pending.expiresAt.getTime() <= Date.now()) {
        await tx.pendingSignup.delete({
          where: { email },
        });

        return {
          ok: false as const,
          message: 'Code expired. Please sign up again.',
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
        await tx.pendingSignup.update({
          where: { email },
          data: {
            attempts: { increment: 1 },
          },
        });

        // Returning lets the failed-attempt increment commit.
        return {
          ok: false as const,
          message: 'Incorrect verification code.',
        };
      }

      const existingUser = await tx.user.findFirst({
        where: {
          email: {
            equals: email,
            mode: 'insensitive',
          },
        },
      });

      if (existingUser) {
        await tx.pendingSignup.delete({
          where: { email },
        });

        return {
          ok: false as const,
          message: 'Account already exists. Please sign in.',
        };
      }

      const user = await tx.user.create({
        data: {
          name: pending.name,
          email,
          passwordHash: pending.passwordHash,
          role: 'EMPLOYEE',
          teamId: null,
          managerId: null,
        },
        select: {
          id: true,
          name: true,
          email: true,
          role: true,
        },
      });

      await tx.pendingSignup.delete({
        where: { email },
      });

      return {
        ok: true as const,
        user,
      };
    });

    if (!result.ok) {
      throw new BadRequestException(result.message);
    }

    let confirmationEmailSent = true;

    try {
      await this.mail.sendWelcome(email);
    } catch {
      confirmationEmailSent = false;

      this.logger.warn(
        'Account created, but confirmation email delivery failed.',
      );
    }

    return {
      message: 'Account created successfully. Please sign in.',
      user: result.user,
      confirmationEmailSent,
    };
  }
}