import {
  MiddlewareConsumer,
  Module,
  NestModule,
  RequestMethod,
} from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { validateApprovaApiEnvironment } from '@approva/config';
import { PrismaModule } from './common/prisma/prisma.module';
import { ApprovalRequestsModule } from './modules/approval-requests/approval-requests.module';
import { AuthModule } from './modules/auth/auth.module';
import { AuditModule } from './modules/audit/audit.module';
import { CapabilityModule } from './modules/capability/capability.module';
import { ConsoleAuthModule } from './modules/console-auth/console-auth.module';
import { DemoAiDeployModule } from './modules/demo-ai-deploy/demo-ai-deploy.module';
import { ImmutableLogModule } from './modules/immutable-log/immutable-log.module';
import { IntegrationsModule } from './modules/integrations/integrations.module';
import { LedgerModule } from './modules/ledger/ledger.module';
import { MachineAuthModule } from './modules/machine-auth/machine-auth.module';
import { NotificationModule } from './modules/notification/notification.module';
import { ObservabilityModule } from './modules/observability/observability.module';
import { OrganizationsModule } from './modules/organizations/organizations.module';
import { PolicyModule } from './modules/policy/policy.module';
import { RequestContextMiddleware } from './common/observability/request-context.middleware';
import { RateLimitMiddleware } from './modules/rate-limit/rate-limit.middleware';
import { RateLimitModule } from './modules/rate-limit/rate-limit.module';
import { SlackModule } from './modules/slack/slack.module';
import { WebhookModule } from './modules/webhook/webhook.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env', '../../.env'],
      validate: validateApprovaApiEnvironment,
    }),
    ConsoleAuthModule,
    ObservabilityModule,
    PrismaModule,
    AuthModule,
    PolicyModule,
    OrganizationsModule,
    IntegrationsModule,
    MachineAuthModule,
    RateLimitModule,
    ImmutableLogModule,
    LedgerModule,
    AuditModule,
    CapabilityModule,
    DemoAiDeployModule,
    WebhookModule,
    SlackModule,
    NotificationModule,
    ApprovalRequestsModule,
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(RequestContextMiddleware, RateLimitMiddleware).forRoutes({
      path: '*',
      method: RequestMethod.ALL,
    });
  }
}
