import { Global, Module } from '@nestjs/common';
import { OrganizationsModule } from '../organizations/organizations.module';
import { ConsoleAuthController } from './console-auth.controller';
import { ConsoleAuthService } from './console-auth.service';

@Global()
@Module({
  imports: [OrganizationsModule],
  controllers: [ConsoleAuthController],
  providers: [ConsoleAuthService],
  exports: [ConsoleAuthService],
})
export class ConsoleAuthModule {}
