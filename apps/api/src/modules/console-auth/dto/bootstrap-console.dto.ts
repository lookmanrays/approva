import { ApiProperty } from '@nestjs/swagger';
import { IsString, MinLength } from 'class-validator';

export class BootstrapConsoleDto {
  @ApiProperty({ minLength: 8, example: 'change-me-owner-password' })
  @IsString()
  @MinLength(8)
  password!: string;
}
