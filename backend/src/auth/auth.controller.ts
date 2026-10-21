import {
  Body,
  Controller,
  Get,
  HttpCode,
  NotFoundException,
  Post,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { CasbinService } from '../casbin/casbin.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import type { AuthUser } from './auth-user.js';
import { AuthService } from './auth.service.js';
import { AuthenticatedOnly, CurrentUser, Public } from './decorators.js';
import { LoginDto } from './dto/login.dto.js';
import { RefreshDto } from './dto/refresh.dto.js';

@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly prisma: PrismaService,
    private readonly casbin: CasbinService,
  ) {}

  @Public()
  @Throttle({ default: { limit: 10, ttl: 60_000 } }) // brute-force brake: 10/min/IP
  @Post('login')
  @HttpCode(200)
  login(@Body() dto: LoginDto) {
    return this.auth.login(dto.email, dto.password);
  }

  @Public()
  // Public, so counted per IP (D22). A browser refreshes about once per 15-min
  // access token; 20/min leaves room for an office behind one NAT while capping
  // the DB lookups an anonymous caller can trigger.
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @Post('refresh')
  @HttpCode(200)
  refresh(@Body() dto: RefreshDto) {
    return this.auth.refresh(dto.refreshToken);
  }

  @AuthenticatedOnly()
  @Post('logout')
  @HttpCode(204)
  async logout(@CurrentUser() user: AuthUser): Promise<void> {
    await this.auth.logout(user.id);
  }

  @AuthenticatedOnly()
  @Get('me')
  async me(@CurrentUser() current: AuthUser) {
    const user = await this.prisma.user.findUnique({
      where: { id: current.id },
      select: { id: true, email: true, name: true, role: true },
    });
    if (!user) throw new NotFoundException('User no longer exists');
    // Role from the DB (not the token) so the UI reflects a role change immediately.
    return {
      ...user,
      permissions: await this.casbin.permissionsFor(user.role),
    };
  }
}
