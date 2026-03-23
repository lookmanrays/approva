import { ApiProperty } from '@nestjs/swagger';
import { IsString, MinLength } from 'class-validator';

export class UpdateConsolePasswordDto {
  @ApiProperty({ minLength: 8, example: 'current-owner-password' })
  @IsString()
  @MinLength(8)
  currentPassword!: string;

  @ApiProperty({ minLength: 8, example: 'new-owner-password' })
  @IsString()
  @MinLength(8)
  newPassword!: string;
}
