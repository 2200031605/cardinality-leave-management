import {
  beforeEach,
  describe,
  expect,
  it,
  jest,
} from '@jest/globals';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from './prisma.service';

describe('PrismaService', () => {
  let service: PrismaService;

  beforeEach(() => {
    const config = {
      getOrThrow: jest.fn((key: string) => {
        if (key === 'DATABASE_URL') {
          return 'postgresql://test:test@localhost:5432/test';
        }

        throw new Error(`Unexpected configuration key: ${key}`);
      }),
    };

    service = new PrismaService(
      config as unknown as ConfigService,
    );
  });

  it('creates the service with database configuration', () => {
    expect(service).toBeDefined();
  });

  it('connects when the module initializes', async () => {
    const connect = jest
      .spyOn(service, '$connect')
      .mockResolvedValue(undefined);

    try {
      await service.onModuleInit();
      expect(connect).toHaveBeenCalledTimes(1);
    } finally {
      connect.mockRestore();
    }
  });

  it('disconnects when the module is destroyed', async () => {
    const disconnect = jest
      .spyOn(service, '$disconnect')
      .mockResolvedValue(undefined);

    try {
      await service.onModuleDestroy();
      expect(disconnect).toHaveBeenCalledTimes(1);
    } finally {
      disconnect.mockRestore();
    }
  });
});