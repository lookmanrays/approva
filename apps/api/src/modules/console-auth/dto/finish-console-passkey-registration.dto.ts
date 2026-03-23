import { ApiProperty } from '@nestjs/swagger';
import { IsObject } from 'class-validator';

export class FinishConsolePasskeyRegistrationDto {
  @ApiProperty({ type: Object, additionalProperties: true })
  @IsObject()
  response!: Record<string, unknown>;
}
