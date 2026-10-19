import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { AuthUser } from '../auth/auth-user.js';
import { ACCESS_KEY, AccessRule, IS_PUBLIC_KEY } from '../auth/decorators.js';
import { CasbinService } from './casbin.service.js';

// Runs after JwtAuthGuard, so req.user is set for every non-public route.
@Injectable()
export class CasbinGuard implements CanActivate {
  constructor(
    private readonly casbin: CasbinService,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const targets = [context.getHandler(), context.getClass()];
    if (this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, targets))
      return true;

    const rule = this.reflector.getAllAndOverride<AccessRule | undefined>(
      ACCESS_KEY,
      targets,
    );
    // Fail closed: a route that forgot to declare @Access is denied, not open.
    if (!rule)
      throw new ForbiddenException('No access rule declared for this route');
    if (rule === 'authenticated') return true;

    const { user } = context.switchToHttp().getRequest<{ user: AuthUser }>();
    if (!(await this.casbin.can(user.role, rule.resource, rule.action))) {
      throw new ForbiddenException(
        `Role ${user.role} cannot ${rule.action} ${rule.resource}`,
      );
    }
    return true;
  }
}
