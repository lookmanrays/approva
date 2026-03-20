import { Module } from '@nestjs/common';
import { ApprovalRequestsController } from './approval-requests.controller';
import { ApprovalRequestsService } from './approval-requests.service';
import { AuditModule } from '../audit/audit.module';
import { AuthModule } from '../auth/auth.module';
import { CapabilityModule } from '../capability/capability.module';
import { MachineAuthModule } from '../machine-auth/machine-auth.module';
import { NotificationModule } from '../notification/notification.module';
import { OrganizationsModule } from '../organizations/organizations.module';
import { PolicyModule } from '../policy/policy.module';
import { WebhookModule } from '../webhook/webhook.module';
import { InternalApprovalRequestsController } from './internal-approval-requests.controller';

@Module({
  imports: [
    PolicyModule,
    CapabilityModule,
    MachineAuthModule,
    AuditModule,
    WebhookModule,
    NotificationModule,
    AuthModule,
    OrganizationsModule,
  ],
  controllers: [ApprovalRequestsController, InternalApprovalRequestsController],
  providers: [ApprovalRequestsService],
})
export class ApprovalRequestsModule {}
