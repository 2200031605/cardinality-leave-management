import {
  beforeEach,
  describe,
  expect,
  it,
  jest,
} from '@jest/globals';
import type { ExecutionContext } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../prisma/prisma.service';
import { JwtAuthGuard } from './jwt-auth.guard';
import type { AuthRequest } from './jwt-auth.guard';

function asyncMock() {
  return jest.fn<(...args: unknown[]) => Promise<unknown>>();
}

describe('JwtAuthGuard', () => {
  const verifyAsync = asyncMock();
  const findUnique = asyncMock();

  let guard: JwtAuthGuard;
  let request: AuthRequest;

  function context() {
    return {
      switchToHttp: () => ({
        getRequest: () => request,
      }),
    } as unknown as ExecutionContext;
  }

  beforeEach(() => {
    jest.resetAllMocks();

    request = {
      headers: {
        authorization: 'Bearer test-token',
      },
    } as AuthRequest;

    verifyAsync.mockResolvedValue({
      sub: 1,
      role: 'EMPLOYEE',
      tokenVersion: 0,
    });

    findUnique.mockResolvedValue({
      id: 1,
      role: 'EMPLOYEE',
      tokenVersion: 0,
    });

    guard = new JwtAuthGuard(
      { verifyAsync } as unknown as JwtService,
      {
        user: { findUnique },
      } as unknown as PrismaService,
    );
  });

  it('accepts a token matching the current account version', async () => {
    await expect(
      guard.canActivate(context()),
    ).resolves.toBe(true);

    expect(request.user).toEqual({
      sub: 1,
      role: 'EMPLOYEE',
      tokenVersion: 0,
    });
  });

  it('rejects a token issued before the password reset', async () => {
    findUnique.mockResolvedValue({
      id: 1,
      role: 'EMPLOYEE',
      tokenVersion: 1,
    });

    await expect(
      guard.canActivate(context()),
    ).rejects.toThrow(
      'Session expired. Please sign in again.',
    );

    expect(request.user).toBeUndefined();
  });

  it('accepts a new token after the password reset', async () => {
    verifyAsync.mockResolvedValue({
      sub: 1,
      role: 'EMPLOYEE',
      tokenVersion: 1,
    });

    findUnique.mockResolvedValue({
      id: 1,
      role: 'EMPLOYEE',
      tokenVersion: 1,
    });

    await expect(
      guard.canActivate(context()),
    ).resolves.toBe(true);
  });

  it('uses the current database role for permissions', async () => {
    findUnique.mockResolvedValue({
      id: 1,
      role: 'MANAGER',
      tokenVersion: 0,
    });

    await guard.canActivate(context());

    expect(request.user?.role).toBe('MANAGER');
  });

  it('rejects requests without a Bearer token', async () => {
    request.headers = {};

    await expect(
      guard.canActivate(context()),
    ).rejects.toThrow('Bearer token required');

    expect(verifyAsync).not.toHaveBeenCalled();
  });

  it('rejects invalid or expired tokens', async () => {
    verifyAsync.mockRejectedValue(
      new Error('Invalid signature'),
    );

    await expect(
      guard.canActivate(context()),
    ).rejects.toThrow('Invalid or expired token');

    expect(findUnique).not.toHaveBeenCalled();
  });

  it('rejects tokens without a token version', async () => {
    verifyAsync.mockResolvedValue({
      sub: 1,
      role: 'EMPLOYEE',
    });

    await expect(
      guard.canActivate(context()),
    ).rejects.toThrow(
      'Invalid token. Please sign in again.',
    );
  });

  it('rejects tokens for deleted accounts', async () => {
    findUnique.mockResolvedValue(null);

    await expect(
      guard.canActivate(context()),
    ).rejects.toThrow(
      'Session expired. Please sign in again.',
    );
  });
});