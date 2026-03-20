import { getConsolePermissionContext } from '@/lib/console-permissions';
import { ConsoleIntegrationsPage } from '@/components/console/console-integrations-page';

export default async function ConsoleIntegrationsRoute() {
  const context = await getConsolePermissionContext();

  return (
    <ConsoleIntegrationsPage
      activeRole={context.activeRole}
      canManageIntegrations={context.can('integrations:manage')}
    />
  );
}
