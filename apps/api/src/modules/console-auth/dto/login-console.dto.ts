import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsString, MinLength } from 'class-validator';

export class LoginConsoleDto {
  @ApiProperty({ example: 'operator@local.approva' })
  @IsEmail()
  email!: string;

  @ApiProperty({ minLength: 8, example: 'change-me-owner-password' })
  @IsString()
  @MinLength(8)
  password!: string;
}
