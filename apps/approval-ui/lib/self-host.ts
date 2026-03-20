import type { Organization, OrganizationMembership } from '@approva/shared';

export function getDefaultOrganizationSlug() {
  return (
    process.env.APPROVA_DEFAULT_ORGANIZATION_SLUG?.trim() ||
    process.env.AUTHON_DEFAULT_ORGANIZATION_SLUG?.trim() ||
    'default'
  );
}

export function getDefaultOrganizationName() {
  return (
    process.env.APPROVA_DEFAULT_ORGANIZATION_NAME?.trim() ||
    process.env.AUTHON_DEFAULT_ORGANIZATION_NAME?.trim() ||
    'Default Organization'
  );
}

export function getLocalOperatorEmail() {
  return (
    process.env.APPROVA_LOCAL_OPERATOR_EMAIL?.trim().toLowerCase() ||
    process.env.AUTHON_LOCAL_OPERATOR_EMAIL?.trim().toLowerCase() ||
    'operator@local.approva'
  );
}

export function getLocalOperatorName() {
  return (
    process.env.APPROVA_LOCAL_OPERATOR_NAME?.trim() ||
    process.env.AUTHON_LOCAL_OPERATOR_NAME?.trim() ||
    'Local operator'
  );
}

export function getReleaseLabel() {
  return (
    process.env.NEXT_PUBLIC_APPROVA_RELEASE?.trim() ||
    process.env.NEXT_PUBLIC_AUTHON_RELEASE?.trim() ||
    '2026.03'
  );
}

export function buildDefaultOrganization(): Organization {
  const slug = getDefaultOrganizationSlug();

  return {
    id: `self-host:${slug}`,
    name: getDefaultOrganizationName(),
    slug,
    createdAt: new Date(0).toISOString(),
  };
}

export function buildSelfHostedOperatorIdentity() {
  const slug = getDefaultOrganizationSlug();

  return {
    id: `self-host:${slug}:operator`,
    name: getLocalOperatorName(),
    email: getLocalOperatorEmail(),
  };
}

export function buildDefaultOrganizationMemberships(): OrganizationMembership[] {
  const organization = buildDefaultOrganization();
  const operator = buildSelfHostedOperatorIdentity();

  return [
    {
      id: `self-host:${organization.slug}:owner-membership`,
      userId: operator.id,
      role: 'owner',
      createdAt: organization.createdAt,
      organization,
    },
  ];
}
