import { ConsoleSystemPage } from '@/components/console/console-system-page';
import { getConsolePermissionContext } from '@/lib/console-permissions';

export default async function ConsoleSystemRoute() {
  const context = await getConsolePermissionContext();
  const session = context.session;
  const activeOrganization = session.activeOrganization ?? null;
  const organizationMemberships =
    activeOrganization && session.user
      ? [
          {
            id: `console:${activeOrganization.id}:${session.user.id}`,
            userId: session.user.id,
            role: session.activeRole ?? 'member',
            createdAt: activeOrganization.createdAt,
            organization: activeOrganization,
          },
        ]
      : [];

  return (
    <ConsoleSystemPage
      activeRole={context.activeRole}
      canManageOrganization={context.can('organization:manage')}
      canManagePolicies={context.can('policies:manage')}
      canManageIntegrations={context.can('integrations:manage')}
      canVerifyLedger={context.can('ledger:verify')}
      operatorIdentity={session.user ?? null}
      activeOrganization={activeOrganization}
      organizationMemberships={organizationMemberships}
    />
  );
}
