import {
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  jest,
} from '@jest/globals';
import * as bcrypt from 'bcrypt';
import { SignupService } from './signup.service';
import { PrismaService } from '../prisma/prisma.service';
import { MailService } from '../mail/mail.service';

function asyncMock() {
  return jest.fn<(...args: unknown[]) => Promise<unknown>>();
}

describe('SignupService', () => {
  let service: SignupService;
  let otpHash: string;

  const tx = {
    $queryRaw: asyncMock(),
    user: {
      findFirst: asyncMock(),
      create: asyncMock(),
    },
    pendingSignup: {
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
    sendSignupOtp: asyncMock(),
    sendWelcome: asyncMock(),
  };

  const signup = {
    name: 'New Employee',
    email: 'new.employee@example.com',
    password: 'SignupDemo123!',
    confirmPassword: 'SignupDemo123!',
  };

  function pendingSignup() {
    return {
      id: 1,
      email: signup.email,
      name: signup.name,
      passwordHash: 'stored-password-hash',
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
    tx.user.findFirst.mockResolvedValue(null);
    tx.user.create.mockResolvedValue({
      id: 10,
      name: signup.name,
      email: signup.email,
      role: 'EMPLOYEE',
    });

    tx.pendingSignup.findUnique.mockResolvedValue(
      pendingSignup(),
    );
    tx.pendingSignup.upsert.mockResolvedValue({});
    tx.pendingSignup.update.mockResolvedValue({});
    tx.pendingSignup.delete.mockResolvedValue({});

    mail.sendSignupOtp.mockResolvedValue(undefined);
    mail.sendWelcome.mockResolvedValue(undefined);

    service = new SignupService(
      prisma as unknown as PrismaService,
      mail as unknown as MailService,
    );
  });

  it('rejects mismatched passwords', async () => {
    await expect(
      service.signup({
        ...signup,
        confirmPassword: 'DifferentPassword123!',
      }),
    ).rejects.toThrow('Passwords do not match');

    expect(mail.sendSignupOtp).not.toHaveBeenCalled();
    expect(tx.user.create).not.toHaveBeenCalled();
  });

  it('stores a pending signup and emails an OTP without creating a user', async () => {
    tx.pendingSignup.findUnique.mockResolvedValue(null);

    const result = await service.signup(signup);

    expect(tx.pendingSignup.upsert).toHaveBeenCalled();
    expect(tx.user.create).not.toHaveBeenCalled();

    expect(mail.sendSignupOtp).toHaveBeenCalledWith(
      signup.email,
      expect.stringMatching(/^\d{6}$/),
    );

    expect(result).not.toHaveProperty('otp');
    expect(result).not.toHaveProperty('passwordHash');

    const call = tx.pendingSignup.upsert.mock.calls[0][0] as {
      create: {
        passwordHash: string;
        otpHash: string;
      };
    };

    expect(call.create.passwordHash).not.toBe(signup.password);

    expect(
      await bcrypt.compare(
        signup.password,
        call.create.passwordHash,
      ),
    ).toBe(true);

    const emailedOtp =
      mail.sendSignupOtp.mock.calls[0][1] as string;

    expect(
      await bcrypt.compare(emailedOtp, call.create.otpHash),
    ).toBe(true);
  });

  it('enforces the resend cooldown', async () => {
    tx.pendingSignup.findUnique.mockResolvedValue({
      ...pendingSignup(),
      resendAvailableAt: new Date(Date.now() + 60_000),
    });

    await expect(
      service.signup(signup),
    ).rejects.toThrow('Wait 60 seconds');

    expect(mail.sendSignupOtp).not.toHaveBeenCalled();
  });

  it('rejects an expired verification code', async () => {
    tx.pendingSignup.findUnique.mockResolvedValue({
      ...pendingSignup(),
      expiresAt: new Date(Date.now() - 1000),
    });

    await expect(
      service.verify({
        email: signup.email,
        otp: '123456',
      }),
    ).rejects.toThrow('Code expired');

    expect(tx.pendingSignup.delete).toHaveBeenCalledWith({
      where: { email: signup.email },
    });

    expect(tx.user.create).not.toHaveBeenCalled();
  });

  it('records an incorrect OTP attempt', async () => {
    await expect(
      service.verify({
        email: signup.email,
        otp: '000000',
      }),
    ).rejects.toThrow('Incorrect verification code');

    expect(tx.pendingSignup.update).toHaveBeenCalledWith({
      where: { email: signup.email },
      data: {
        attempts: { increment: 1 },
      },
    });

    expect(tx.user.create).not.toHaveBeenCalled();
  });

  it('blocks verification after five incorrect attempts', async () => {
    tx.pendingSignup.findUnique.mockResolvedValue({
      ...pendingSignup(),
      attempts: 5,
    });

    await expect(
      service.verify({
        email: signup.email,
        otp: '123456',
      }),
    ).rejects.toThrow('Too many attempts');

    expect(tx.user.create).not.toHaveBeenCalled();
  });

  it('creates only an employee account after correct verification', async () => {
    const result = await service.verify({
      email: signup.email,
      otp: '123456',
    });

    expect(tx.user.create).toHaveBeenCalledWith({
      data: {
        name: signup.name,
        email: signup.email,
        passwordHash: 'stored-password-hash',
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

    expect(tx.pendingSignup.delete).toHaveBeenCalledWith({
      where: { email: signup.email },
    });

    expect(mail.sendWelcome).toHaveBeenCalledWith(
      signup.email,
    );

    expect(result.confirmationEmailSent).toBe(true);
    expect(result.user).not.toHaveProperty('passwordHash');
  });

  it('rejects verification when no pending signup exists', async () => {
    tx.pendingSignup.findUnique.mockResolvedValue(null);

    await expect(
      service.verify({
        email: signup.email,
        otp: '123456',
      }),
    ).rejects.toThrow('No pending signup');

    expect(tx.user.create).not.toHaveBeenCalled();
  });
});