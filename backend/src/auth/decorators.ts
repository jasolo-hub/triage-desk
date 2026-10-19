import {
  createParamDecorator,
  ExecutionContext,
  SetMetadata,
} from '@nestjs/common';
import type { AuthUser } from './auth-user.js';

export const IS_PUBLIC_KEY = 'isPublic';
export const ACCESS_KEY = 'access';

export type AccessRule = { resource: string; action: string } | 'authenticated';

/** Route needs no token at all (login, refresh, health). */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);

/** Route is checked by Casbin: may this role perform `action` on `resource`? */
export const Access = (resource: string, action: string) =>
  SetMetadata(ACCESS_KEY, { resource, action } satisfies AccessRule);

/** Any logged-in user, no Casbin check (logout, /auth/me). Must be explicit: the
 *  Casbin guard rejects routes that declare nothing (fail closed). */
export const AuthenticatedOnly = () =>
  SetMetadata(ACCESS_KEY, 'authenticated' satisfies AccessRule);

/** Injects req.user set by JwtAuthGuard. */
export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): AuthUser =>
    ctx.switchToHttp().getRequest<{ user: AuthUser }>().user,
);
