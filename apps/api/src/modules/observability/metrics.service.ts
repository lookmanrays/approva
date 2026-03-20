import { Injectable } from '@nestjs/common';

const METRIC_DEFINITIONS = [
  {
    name: 'approva_approval_requests_created_total',
    description: 'Total approval requests created.',
  },
  {
    name: 'approva_approval_requests_approved_total',
    description: 'Total approval requests approved by a human decision.',
  },
  {
    name: 'approva_approval_requests_denied_total',
    description: 'Total approval requests denied or blocked.',
  },
  {
    name: 'approva_policy_auto_approve_total',
    description: 'Total policy evaluations that auto-approved.',
  },
  {
    name: 'approva_policy_reject_total',
    description: 'Total policy evaluations that rejected.',
  },
  {
    name: 'approva_webhook_deliveries_total',
    description: 'Total successful webhook deliveries.',
  },
  {
    name: 'approva_webhook_failures_total',
    description: 'Total failed webhook deliveries.',
  },
  {
    name: 'approva_email_deliveries_total',
    description: 'Total successful email deliveries.',
  },
  {
    name: 'approva_email_failures_total',
    description: 'Total failed email deliveries.',
  },
] as const;

type MetricName = (typeof METRIC_DEFINITIONS)[number]['name'];
type LegacyMetricName =
  | 'approva_approval_requests_created_total'
  | 'approva_approval_requests_approved_total'
  | 'approva_approval_requests_denied_total'
  | 'approva_policy_auto_approve_total'
  | 'approva_policy_reject_total'
  | 'approva_webhook_deliveries_total'
  | 'approva_webhook_failures_total'
  | 'approva_email_deliveries_total'
  | 'approva_email_failures_total';

const LEGACY_METRIC_NAME_MAP: Record<LegacyMetricName, MetricName> = {
  approva_approval_requests_created_total: 'approva_approval_requests_created_total',
  approva_approval_requests_approved_total: 'approva_approval_requests_approved_total',
  approva_approval_requests_denied_total: 'approva_approval_requests_denied_total',
  approva_policy_auto_approve_total: 'approva_policy_auto_approve_total',
  approva_policy_reject_total: 'approva_policy_reject_total',
  approva_webhook_deliveries_total: 'approva_webhook_deliveries_total',
  approva_webhook_failures_total: 'approva_webhook_failures_total',
  approva_email_deliveries_total: 'approva_email_deliveries_total',
  approva_email_failures_total: 'approva_email_failures_total',
};

@Injectable()
export class MetricsService {
  private readonly counters = new Map<MetricName, number>(
    METRIC_DEFINITIONS.map((definition) => [definition.name, 0]),
  );

  increment(name: MetricName | LegacyMetricName, value = 1) {
    const normalizedName = LEGACY_METRIC_NAME_MAP[name as LegacyMetricName] ?? name;
    const current = this.counters.get(normalizedName as MetricName) ?? 0;
    this.counters.set(normalizedName as MetricName, current + value);
  }

  renderPrometheus() {
    const lines: string[] = [];

    for (const metric of METRIC_DEFINITIONS) {
      const value = this.counters.get(metric.name) ?? 0;

      lines.push(`# HELP ${metric.name} ${metric.description}`);
      lines.push(`# TYPE ${metric.name} counter`);
      lines.push(`${metric.name} ${value}`);
    }

    for (const [legacyName, metricName] of Object.entries(LEGACY_METRIC_NAME_MAP)) {
      const metric = METRIC_DEFINITIONS.find((candidate) => candidate.name === metricName);
      const value = this.counters.get(metricName) ?? 0;

      if (!metric) {
        continue;
      }

      lines.push(`# HELP ${legacyName} Legacy alias for ${metricName}.`);
      lines.push(`# TYPE ${legacyName} counter`);
      lines.push(`${legacyName} ${value}`);
    }

    return `${lines.join('\n')}\n`;
  }
}
