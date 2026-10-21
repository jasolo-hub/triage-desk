import { createHash } from 'node:crypto';
import { AuthService } from './auth.service.js';

// AuthService.refresh against an in-memory fake of the three Prisma calls it
// makes (same approach as tickets.service.spec.ts). Tokens are built by hand:
// the service only ever sees their SHA-256, exactly like the database.

const DAY_MS = 24 * 60 * 60 * 1000;
const sha256 = (value: string) =>
  createHash('sha256').update(value).digest('hex');

function setup(session: { current: string; expiresAt?: Date }) {
  const row = {
    id: 1,
    email: 'admin@triage.dev',
    name: 'Alex Admin',
    role: 'ADMIN',
    passwordHash: 'unused',
    refreshTokenHash: sha256(session.current) as string | null,
    refreshTokenExpiresAt: (session.expiresAt ??
      new Date(Date.now() + DAY_MS)) as Date | null,
    previousRefreshTokenHash: null as string | null,
  };
  const prisma = {
    user: {
      // A copy, like a real read: later writes must not change what the service holds.
      findUnique: vi.fn(async ({ where }) =>
        where.id === row.id ? { ...row } : null,
      ),
      update: vi.fn(async ({ data }) => Object.assign(row, data)),
      // Mirrors the compare-and-swap in issueTokens(): only matches the expected hash.
      updateMany: vi.fn(async ({ where, data }) => {
        if (
          where.id !== row.id ||
          where.refreshTokenHash !== row.refreshTokenHash
        )
          return { count: 0 };
        Object.assign(row, data);
        return { count: 1 };
      }),
    },
  };
  const jwt = { signAsync: vi.fn(async () => 'access-token') };
  const config = { get: vi.fn(() => 7) }; // JWT_REFRESH_TTL_DAYS
  const service = new AuthService(
    prisma as never,
    jwt as never,
    config as never,
  );
  return { service, row, prisma };
}

describe('AuthService.refresh (rotation + replay detection, D27)', () => {
  it('rotates the current token and remembers the outgoing one as previous', async () => {
    const { service, row } = setup({ current: '1.current' });

    const result = await service.refresh('1.current');

    expect(result.refreshToken).toMatch(/^1\./);
    expect(row.refreshTokenHash).toBe(sha256(result.refreshToken));
    expect(row.previousRefreshTokenHash).toBe(sha256('1.current'));
  });

  it('treats the previous (already rotated) token as replay and revokes the session', async () => {
    const { service, row } = setup({ current: '1.current' });
    const { refreshToken: rotated } = await service.refresh('1.current');

    await expect(service.refresh('1.current')).rejects.toThrow(
      'Refresh token reuse detected, session revoked',
    );
    expect(row).toMatchObject({
      refreshTokenHash: null,
      refreshTokenExpiresAt: null,
      previousRefreshTokenHash: null,
    });
    // The newer token is dead too: neither the thief nor the victim continues.
    await expect(service.refresh(rotated)).rejects.toThrow('Session expired');
  });

  it('rejects a garbage token with 401 and leaves the session alone', async () => {
    const { service, prisma } = setup({ current: '1.current' });

    await expect(service.refresh('1.anything')).rejects.toThrow(
      'Invalid refresh token',
    );
    expect(prisma.user.update).not.toHaveBeenCalled();
    expect(prisma.user.updateMany).not.toHaveBeenCalled();
    await expect(service.refresh('1.current')).resolves.toHaveProperty(
      'accessToken',
    );
  });

  it('lets only one of two concurrent refreshes win, without revoking', async () => {
    const { service, row } = setup({ current: '1.current' });

    const [first, second] = await Promise.allSettled([
      service.refresh('1.current'),
      service.refresh('1.current'),
    ]);

    expect(first.status).toBe('fulfilled');
    expect(second).toMatchObject({
      status: 'rejected',
      reason: { message: 'Refresh token already used' },
    });
    expect(row.refreshTokenHash).not.toBeNull(); // the winner's session lives on
  });

  it('revokes an expired session', async () => {
    const { service, row } = setup({
      current: '1.current',
      expiresAt: new Date(Date.now() - 1000),
    });

    await expect(service.refresh('1.current')).rejects.toThrow(
      'Session expired',
    );
    expect(row.refreshTokenHash).toBeNull();
  });
});
