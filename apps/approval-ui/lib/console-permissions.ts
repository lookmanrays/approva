import {
  hasOrganizationPermission,
  type ConsoleSessionState,
  type OrganizationPermission,
} from '@approva/shared';
import { requireConsolePageSession } from './console-proxy';

function buildPermissionContext(session: ConsoleSessionState) {
  return {
    session,
    activeRole: session.activeRole ?? null,
    can(permission: OrganizationPermission) {
      return hasOrganizationPermission(session.activeRole, permission);
    },
  };
}

export async function getConsolePermissionContext() {
  return buildPermissionContext(await requireConsolePageSession());
}

export async function requireConsolePermission(permission: OrganizationPermission) {
  const context = buildPermissionContext(await requireConsolePageSession());

  if (!context.can(permission)) {
    throw new Error(`Missing console permission: ${permission}`);
  }

  return context;
}
