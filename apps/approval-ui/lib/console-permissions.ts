import type { OrganizationPermission } from '@approva/shared';

function buildSelfHostedPermissionContext() {
  return {
    session: null,
    activeRole: 'owner' as const,
    can(_permission: OrganizationPermission) {
      return true;
    },
  };
}

export function getActiveOrganizationRole() {
  return 'owner' as const;
}

export async function getConsolePermissionContext() {
  return buildSelfHostedPermissionContext();
}

export async function requireConsolePermission(_permission: OrganizationPermission) {
  return buildSelfHostedPermissionContext();
}
