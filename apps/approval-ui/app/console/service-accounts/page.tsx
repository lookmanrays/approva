import { ConsoleServiceAccountsPage } from '@/components/console/console-service-accounts-page';
import { getConsolePermissionContext } from '@/lib/console-permissions';

export default async function ConsoleServiceAccountsRoute() {
  const context = await getConsolePermissionContext();

  return (
    <ConsoleServiceAccountsPage
      activeRole={context.activeRole}
      canManageServiceAccounts={context.can('service_accounts:manage')}
    />
  );
}
