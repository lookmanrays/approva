import { ConsoleUsersPage } from '@/components/console/console-users-page';
import { getConsolePermissionContext } from '@/lib/console-permissions';

export default async function ConsoleUsersRoute() {
  const context = await getConsolePermissionContext();

  return (
    <ConsoleUsersPage
      activeRole={context.activeRole}
      canManageUsers={context.can('organization:manage')}
      currentUserId={context.session.user?.id ?? null}
    />
  );
}
