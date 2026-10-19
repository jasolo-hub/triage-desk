import { Injectable } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';

// Rate limits count per logged-in user (contract: AI 10/min per user); public
// routes such as login fall back to the client IP. Needs req.user, so this
// guard runs after JwtAuthGuard.
@Injectable()
export class UserThrottlerGuard extends ThrottlerGuard {
  protected override async getTracker(
    req: Record<string, any>,
  ): Promise<string> {
    return req.user?.id ? `user:${req.user.id}` : req.ip;
  }
}
