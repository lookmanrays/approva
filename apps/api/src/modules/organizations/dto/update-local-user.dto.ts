import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import type { OrganizationMemberRole } from '@approva/shared';
import { IsEmail, IsIn, IsOptional, IsString, MinLength } from 'class-validator';

const ROLE_OPTIONS: OrganizationMemberRole[] = ['owner', 'admin', 'member', 'approver'];

export class UpdateLocalUserDto {
  @ApiProperty({ example: 'Alex Rivera' })
  @IsString()
  @MinLength(1)
  name!: string;

  @ApiProperty({ enum: ROLE_OPTIONS, example: 'admin' })
  @IsIn(ROLE_OPTIONS)
  role!: OrganizationMemberRole;

  @ApiPropertyOptional({ example: 'new-password-123', minLength: 8 })
  @IsOptional()
  @IsString()
  @MinLength(8)
  password?: string;
}
