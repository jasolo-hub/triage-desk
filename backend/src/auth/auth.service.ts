import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import type { Env } from '../config/env.validation.js';
import type { User } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import type { JwtPayload } from './auth-user.js';
import { hashPassword, verifyPassword } from './password.js';

const DAY_MS = 24 * 60 * 60 * 1000;

export type PublicUser = Pick<User, 'id' | 'email' | 'name' | 'role'>;

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  user: PublicUser;
}

@Injectable()
export class AuthService {
  // Hash of a random string, verified against when the email is unknown so a
  // login attempt takes the same time whether or not the account exists.
  private dummyHash?: Promise<string>;

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService<Env, true>,
  ) {}

  async login(email: string, password: string): Promise<AuthTokens> {
    const user = await this.prisma.user.findUnique({
      where: { email: email.toLowerCase() },
    });
    if (!user) {
      this.dummyHash ??= hashPassword(randomBytes(16).toString('hex'));
      await verifyPassword(await this.dummyHash, password);
      throw new UnauthorizedException('Invalid email or password');
    }
    if (!(await verifyPassword(user.passwordHash, password))) {
      throw new UnauthorizedException('Invalid email or password');
    }
    return this.issueTokens(user, null);
  }

  // Rotation with replay detection (D3). Token format is "<userId>.<secret>":
  // the id lets us find the session even when the secret is stale, which is
  // exactly the case we must detect (someone re-using an already rotated token).
  async refresh(refreshToken: string): Promise<AuthTokens> {
    const [idPart, secret] = refreshToken.split('.');
    const userId = Number(idPart);
    if (!Number.isInteger(userId) || !secret)
      throw new UnauthorizedException('Invalid refresh token');

    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user?.refreshTokenHash || !user.refreshTokenExpiresAt) {
      throw new UnauthorizedException('Session expired, please log in again');
    }

    const presented = sha256(refreshToken);
    if (!safeEqual(presented, user.refreshTokenHash)) {
      // A syntactically valid but stale token = replay of a rotated token
      // (possibly stolen). Kill the session so neither party can continue.
      await this.revoke(user.id);
      throw new UnauthorizedException(
        'Refresh token reuse detected, session revoked',
      );
    }
    if (user.refreshTokenExpiresAt < new Date()) {
      await this.revoke(user.id);
      throw new UnauthorizedException('Session expired, please log in again');
    }
    return this.issueTokens(user, presented);
  }

  async logout(userId: number): Promise<void> {
    await this.revoke(userId);
  }

  private async issueTokens(
    user: User,
    previousHash: string | null,
  ): Promise<AuthTokens> {
    const payload: JwtPayload = { sub: user.id, role: user.role };
    const accessToken = await this.jwt.signAsync(payload);

    const refreshToken = `${user.id}.${randomBytes(32).toString('base64url')}`; // 256 random bits
    const ttlDays = this.config.get('JWT_REFRESH_TTL_DAYS', { infer: true });
    const data = {
      refreshTokenHash: sha256(refreshToken),
      refreshTokenExpiresAt: new Date(Date.now() + ttlDays * DAY_MS),
    };

    if (previousHash === null) {
      // Login: replaces any previous session (one session per user, D3).
      await this.prisma.user.update({ where: { id: user.id }, data });
    } else {
      // Refresh: compare-and-swap on the old hash, so two concurrent refreshes
      // with the same token cannot both succeed.
      const { count } = await this.prisma.user.updateMany({
        where: { id: user.id, refreshTokenHash: previousHash },
        data,
      });
      if (count !== 1)
        throw new UnauthorizedException('Refresh token already used');
    }

    return {
      accessToken,
      refreshToken,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
      },
    };
  }

  private async revoke(userId: number): Promise<void> {
    await this.prisma.user.update({
      where: { id: userId },
      data: { refreshTokenHash: null, refreshTokenExpiresAt: null },
    });
  }
}

// D3: the refresh token is 256 random bits, not a guessable password, so a fast
// hash is enough (nothing to brute-force) and needs no salt.
function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}
