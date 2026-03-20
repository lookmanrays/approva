import { getConsolePermissionContext } from '@/lib/console-permissions';
import { ConsolePoliciesPage } from '@/components/console/console-policies-page';

export default async function ConsolePoliciesRoute() {
  const context = await getConsolePermissionContext();

  return (
    <ConsolePoliciesPage
      activeRole={context.activeRole}
      canManagePolicies={context.can('policies:manage')}
    />
  );
}
