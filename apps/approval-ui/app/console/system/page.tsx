import { ConsoleSystemPage } from '@/components/console/console-system-page';
import {
  buildDefaultOrganization,
  buildDefaultOrganizationMemberships,
  buildSelfHostedOperatorIdentity,
} from '@/lib/self-host';

export default async function ConsoleSystemRoute() {
  const operator = buildSelfHostedOperatorIdentity();
  const organizationMemberships = buildDefaultOrganizationMemberships();

  return (
    <ConsoleSystemPage
      activeRole="owner"
      canManagePolicies
      canManageIntegrations
      canVerifyLedger
      operatorIdentity={operator}
      activeOrganization={buildDefaultOrganization()}
      organizationMemberships={organizationMemberships}
    />
  );
}
