import type { Role } from '../generated/prisma/client.js';

// What the JWT guard puts on req.user. Role comes from the token, so a role
// change takes effect at the next access-token refresh (max 15 min).
export interface AuthUser {
  id: number;
  role: Role;
}

export interface JwtPayload {
  sub: number;
  role: Role;
}
