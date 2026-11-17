import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import type { Request } from 'express';
import { PrismaService } from '../prisma/prisma.service';

export interface AuthUser {
  sub: number;
  role: 'EMPLOYEE' | 'MANAGER' | 'ADMIN';
  tokenVersion: number;
}

export type AuthRequest = Request & {
  user?: AuthUser;
};

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly jwt: JwtService,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(
    context: ExecutionContext,
  ): Promise<boolean> {
    const request = context
      .switchToHttp()
      .getRequest<AuthRequest>();

    const parts = request.headers.authorization?.split(' ');

    if (
      parts?.length !== 2 ||
      parts[0] !== 'Bearer' ||
      !parts[1]
    ) {
      throw new UnauthorizedException(
        'Bearer token required',
      );
    }

    let payload: AuthUser;

    try {
      payload = await this.jwt.verifyAsync<AuthUser>(
        parts[1],
      );
    } catch {
      throw new UnauthorizedException(
        'Invalid or expired token',
      );
    }

    if (
      !payload ||
      !Number.isInteger(payload.sub) ||
      !Number.isInteger(payload.tokenVersion)
    ) {
      throw new UnauthorizedException(
        'Invalid token. Please sign in again.',
      );
    }

    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
      select: {
        id: true,
        role: true,
        tokenVersion: true,
      },
    });

    if (
      !user ||
      user.tokenVersion !== payload.tokenVersion
    ) {
      throw new UnauthorizedException(
        'Session expired. Please sign in again.',
      );
    }

    // Use the current database role for permissions.
    request.user = {
      sub: user.id,
      role: user.role,
      tokenVersion: user.tokenVersion,
    };

    return true;
  }
}