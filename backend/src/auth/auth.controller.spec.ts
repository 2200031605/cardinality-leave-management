import { describe, it, expect, jest } from '@jest/globals';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';

describe('AuthController', () => {
  it('passes login credentials to AuthService', async () => {
    const response = {
      accessToken: 'test-token',
      user: {
        id: 1,
        name: 'Employee',
        email: 'employee@example.com',
        role: 'EMPLOYEE',
      },
    };

    const login = jest.fn(
      async (_email: string, _password: string) => response,
    );

    const service = { login } as unknown as AuthService;
    const controller = new AuthController(service);

    const result = await controller.login({
      email: 'employee@example.com',
      password: 'DemoPass123!',
    });

    expect(login).toHaveBeenCalledWith(
      'employee@example.com',
      'DemoPass123!',
    );
    expect(result).toEqual(response);
  });
});