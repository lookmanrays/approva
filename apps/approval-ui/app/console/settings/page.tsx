import { ConsoleSettingsPage } from '@/components/console/console-settings-page';

interface ConsoleSettingsRouteProps {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}

function readBooleanSearchParam(value: string | string[] | undefined) {
  const resolved = Array.isArray(value) ? value[0] : value;
  return resolved === '1' || resolved === 'true';
}

export default async function ConsoleSettingsRoute({
  searchParams,
}: ConsoleSettingsRouteProps) {
  const resolvedSearchParams = await searchParams;

  return (
    <ConsoleSettingsPage
      showSetupGuide={readBooleanSearchParam(resolvedSearchParams?.setup)}
    />
  );
}
