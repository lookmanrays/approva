import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsObject, IsString, IsUUID } from 'class-validator';

export class PasskeyRegistrationFinishDto {
  @ApiProperty({ example: '00000000-0000-4000-8000-000000000001' })
  @IsUUID()
  requestId!: string;

  @ApiProperty({ example: 'aat_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx' })
  @IsString()
  token!: string;

  @ApiProperty({ example: 'approver@example.com' })
  @IsEmail()
  email!: string;

  @ApiProperty({ type: Object, additionalProperties: true })
  @IsObject()
  response!: Record<string, unknown>;
}
