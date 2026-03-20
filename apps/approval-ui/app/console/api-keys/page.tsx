import { ConsoleApiKeysPage } from '@/components/console/console-api-keys-page';
import { getConsolePermissionContext } from '@/lib/console-permissions';

export default async function ConsoleApiKeysRoute() {
  const context = await getConsolePermissionContext();

  return (
    <ConsoleApiKeysPage
      activeRole={context.activeRole}
      canManageApiKeys={context.can('api_keys:manage')}
      canManageServiceAccounts={context.can('service_accounts:manage')}
    />
  );
}
