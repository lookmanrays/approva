import { getConsolePermissionContext } from '@/lib/console-permissions';
import { ConsoleLedgerPage } from '@/components/console/console-ledger-page';

interface ConsoleLedgerRouteProps {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}

export default async function ConsoleLedgerRoute({
  searchParams,
}: ConsoleLedgerRouteProps) {
  const context = await getConsolePermissionContext();
  const resolvedSearchParams = await searchParams;
  const fromSeq = resolvedSearchParams?.fromSeq;
  const toSeq = resolvedSearchParams?.toSeq;

  return (
    <ConsoleLedgerPage
      canVerifyLedger={context.can('ledger:verify')}
      activeRole={context.activeRole}
      initialFromSeq={Array.isArray(fromSeq) ? fromSeq[0] : fromSeq ?? null}
      initialToSeq={Array.isArray(toSeq) ? toSeq[0] : toSeq ?? null}
    />
  );
}
