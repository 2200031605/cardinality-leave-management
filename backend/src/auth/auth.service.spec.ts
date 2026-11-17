import {
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  jest,
} from '@jest/globals';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { AuthService } from './auth.service';
import { PrismaService } from '../prisma/prisma.service';

describe('AuthService', () => {
  let passwordHash: string;
  let service: AuthService;

  const user = {
    id: 1,
    name: 'Test Employee',
    email: 'employee@example.com',
    passwordHash: '',
    role: 'EMPLOYEE',
    tokenVersion: 0,
  };

  const findUnique = jest.fn<
    (...args: unknown[]) => Promise<typeof user | null>
  >();

  const signAsync = jest.fn<
    (...args: unknown[]) => Promise<string>
  >();

  beforeAll(async () => {
    passwordHash = await bcrypt.hash('DemoPass123!', 4);
  });

  beforeEach(() => {
    jest.resetAllMocks();

    findUnique.mockResolvedValue({
      ...user,
      passwordHash,
    });

    signAsync.mockResolvedValue('test-token');

    service = new AuthService(
      {
        user: { findUnique },
      } as unknown as PrismaService,
      {
        signAsync,
      } as unknown as JwtService,
    );
  });

  it('returns a token for valid credentials', async () => {
    const result = await service.login(
      'employee@example.com',
      'DemoPass123!',
    );

    expect(result.accessToken).toBe('test-token');

    expect(signAsync).toHaveBeenCalledWith({
      sub: 1,
      role: 'EMPLOYEE',
      tokenVersion: 0,
    });
  });

  it('does not expose the password hash', async () => {
    const result = await service.login(
      'employee@example.com',
      'DemoPass123!',
    );

    expect(result.user).not.toHaveProperty('passwordHash');
    expect(result.user.email).toBe('employee@example.com');
  });

  it('rejects an unknown email', async () => {
    findUnique.mockResolvedValue(null);

    await expect(
      service.login(
        'unknown@example.com',
        'DemoPass123!',
      ),
    ).rejects.toThrow('Invalid email or password');

    expect(signAsync).not.toHaveBeenCalled();
  });

  it('rejects an incorrect password', async () => {
    await expect(
      service.login(
        'employee@example.com',
        'WrongPassword',
      ),
    ).rejects.toThrow('Invalid email or password');

    expect(signAsync).not.toHaveBeenCalled();
  });
});