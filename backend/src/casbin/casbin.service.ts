import { Injectable, OnModuleInit } from '@nestjs/common';
import {
  Enforcer,
  newEnforcer,
  newModelFromString,
  StringAdapter,
} from 'casbin';
import type { Role } from '../generated/prisma/client.js';
import { CASBIN_MODEL, CASBIN_POLICY } from './casbin.policy.js';

export type Permissions = Record<string, string[]>;

@Injectable()
export class CasbinService implements OnModuleInit {
  private enforcer: Enforcer;

  // Policy is loaded once into memory; it is a constant, so there is nothing to reload.
  async onModuleInit() {
    this.enforcer = await newEnforcer(
      newModelFromString(CASBIN_MODEL),
      new StringAdapter(CASBIN_POLICY),
    );
  }

  can(role: Role, resource: string, action: string): Promise<boolean> {
    return this.enforcer.enforce(role, resource, action);
  }

  // For GET /auth/me: the frontend's accessControlProvider is a lookup in this
  // map, so UI hiding is derived from the same policy the API enforces.
  async permissionsFor(role: Role): Promise<Permissions> {
    const rows = await this.enforcer.getFilteredPolicy(0, role); // [sub, obj, act][]
    const permissions: Permissions = {};
    for (const [, resource, actions] of rows)
      permissions[resource] = actions.split('|');
    return permissions;
  }
}
