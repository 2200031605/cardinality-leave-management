import {
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  jest,
} from '@jest/globals';
import * as bcrypt from 'bcrypt';
import { PasswordResetService } from './password-reset.service';
import { PrismaService } from '../prisma/prisma.service';
import { MailService } from '../mail/mail.service';

function asyncMock() {
  return jest.fn<(...args: unknown[]) => Promise<unknown>>();
}

describe('PasswordResetService', () => {
  let service: PasswordResetService;
  let otpHash: string;

  const email = 'employee@example.com';

  const tx = {
    $queryRaw: asyncMock(),
    user: {
      findUnique: asyncMock(),
      update: asyncMock(),
    },
    passwordReset: {
      findUnique: asyncMock(),
      upsert: asyncMock(),
      update: asyncMock(),
      delete: asyncMock(),
    },
  };

  const prisma = {
    $transaction: jest.fn(
      async (callback: (client: typeof tx) => Promise<unknown>) =>
        callback(tx),
    ),
  };

  const mail = {
    sendPasswordResetOtp: asyncMock(),
    sendPasswordChanged: asyncMock(),
  };

  const resetDto = {
    email,
    otp: '123456',
    password: 'NewPassword123!',
    confirmPassword: 'NewPassword123!',
  };

  function pendingReset() {
    return {
      id: 1,
      email,
      otpHash,
      attempts: 0,
      expiresAt: new Date(Date.now() + 600_000),
      resendAvailableAt: new Date(Date.now() - 1000),
    };
  }

  beforeAll(async () => {
    otpHash = await bcrypt.hash('123456', 4);
  });

  beforeEach(() => {
    jest.resetAllMocks();

    prisma.$transaction.mockImplementation(
      async (callback: (client: typeof tx) => Promise<unknown>) =>
        callback(tx),
    );

    tx.$queryRaw.mockResolvedValue([]);
    tx.user.findUnique.mockResolvedValue({ id: 1 });
    tx.user.update.mockResolvedValue({ id: 1 });

    tx.passwordReset.findUnique.mockResolvedValue(
      pendingReset(),
    );
    tx.passwordReset.upsert.mockResolvedValue({});
    tx.passwordReset.update.mockResolvedValue({});
    tx.passwordReset.delete.mockResolvedValue({});

    mail.sendPasswordResetOtp.mockResolvedValue(undefined);
    mail.sendPasswordChanged.mockResolvedValue(undefined);

    service = new PasswordResetService(
      prisma as unknown as PrismaService,
      mail as unknown as MailService,
    );
  });

  it('sends a reset OTP for an existing account', async () => {
    tx.passwordReset.findUnique.mockResolvedValue(null);

    const result = await service.forgotPassword({ email });

    expect(mail.sendPasswordResetOtp).toHaveBeenCalledWith(
      email,
      expect.stringMatching(/^\d{6}$/),
    );

    expect(result).not.toHaveProperty('otp');

    const call = tx.passwordReset.upsert.mock.calls[0][0] as {
      create: { otpHash: string };
    };

    const sentOtp =
      mail.sendPasswordResetOtp.mock.calls[0][1] as string;

    expect(
      await bcrypt.compare(sentOtp, call.create.otpHash),
    ).toBe(true);
  });

  it('returns a generic message for an unknown account', async () => {
    tx.user.findUnique.mockResolvedValue(null);

    const result = await service.forgotPassword({ email });

    expect(result.message).toContain(
      'If an account exists',
    );

    expect(mail.sendPasswordResetOtp).not.toHaveBeenCalled();
    expect(tx.passwordReset.upsert).not.toHaveBeenCalled();
  });

  it('does not resend during the cooldown', async () => {
    tx.passwordReset.findUnique.mockResolvedValue({
      ...pendingReset(),
      resendAvailableAt: new Date(Date.now() + 60_000),
    });

    await service.forgotPassword({ email });

    expect(mail.sendPasswordResetOtp).not.toHaveBeenCalled();
    expect(tx.passwordReset.upsert).not.toHaveBeenCalled();
  });

  it('rejects mismatched passwords', async () => {
    await expect(
      service.resetPassword({
        ...resetDto,
        confirmPassword: 'DifferentPassword123!',
      }),
    ).rejects.toThrow('Passwords do not match');

    expect(tx.user.update).not.toHaveBeenCalled();
  });

  it('rejects an expired reset code', async () => {
    tx.passwordReset.findUnique.mockResolvedValue({
      ...pendingReset(),
      expiresAt: new Date(Date.now() - 1000),
    });

    await expect(
      service.resetPassword(resetDto),
    ).rejects.toThrow('Invalid or expired reset code');

    expect(tx.passwordReset.delete).toHaveBeenCalledWith({
      where: { email },
    });

    expect(tx.user.update).not.toHaveBeenCalled();
  });

  it('records an incorrect OTP attempt', async () => {
    await expect(
      service.resetPassword({
        ...resetDto,
        otp: '000000',
      }),
    ).rejects.toThrow('Invalid or expired reset code');

    expect(tx.passwordReset.update).toHaveBeenCalledWith({
      where: { email },
      data: {
        attempts: { increment: 1 },
      },
    });

    expect(tx.user.update).not.toHaveBeenCalled();
  });

  it('blocks reset after five incorrect attempts', async () => {
    tx.passwordReset.findUnique.mockResolvedValue({
      ...pendingReset(),
      attempts: 5,
    });

    await expect(
      service.resetPassword(resetDto),
    ).rejects.toThrow('Too many attempts');

    expect(tx.user.update).not.toHaveBeenCalled();
  });

  it('rejects a missing or already consumed reset code', async () => {
    tx.passwordReset.findUnique.mockResolvedValue(null);

    await expect(
      service.resetPassword(resetDto),
    ).rejects.toThrow('Invalid or expired reset code');

    expect(tx.user.update).not.toHaveBeenCalled();
  });

  it('updates the password hash, increments token version, and consumes the code', async () => {
    const result = await service.resetPassword(resetDto);

    expect(tx.user.update).toHaveBeenCalledWith({
      where: { id: 1 },
      data: {
        passwordHash: expect.any(String),
        tokenVersion: { increment: 1 },
      },
    });

    const call = tx.user.update.mock.calls[0][0] as {
      data: { passwordHash: string };
    };

    expect(call.data.passwordHash).not.toBe(resetDto.password);

    expect(
      await bcrypt.compare(
        resetDto.password,
        call.data.passwordHash,
      ),
    ).toBe(true);

    expect(tx.passwordReset.delete).toHaveBeenCalledWith({
      where: { email },
    });

    expect(mail.sendPasswordChanged).toHaveBeenCalledWith(
      email,
    );

    expect(result.message).toContain(
      'Password reset successfully',
    );
  });
});