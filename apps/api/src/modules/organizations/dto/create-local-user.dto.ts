import { ApiProperty } from '@nestjs/swagger';
import type { OrganizationMemberRole } from '@approva/shared';
import { IsEmail, IsIn, IsString, MinLength } from 'class-validator';

const ROLE_OPTIONS: OrganizationMemberRole[] = ['admin', 'member', 'approver'];

export class CreateLocalUserDto {
  @ApiProperty({ example: 'alex@example.com' })
  @IsEmail()
  email!: string;

  @ApiProperty({ example: 'Alex Rivera' })
  @IsString()
  @MinLength(1)
  name!: string;

  @ApiProperty({ example: 'change-me-password', minLength: 8 })
  @IsString()
  @MinLength(8)
  password!: string;

  @ApiProperty({ enum: ROLE_OPTIONS, example: 'admin' })
  @IsIn(ROLE_OPTIONS)
  role!: OrganizationMemberRole;
}
