import { ApiProperty } from '@nestjs/swagger';
import { IsString, MaxLength } from 'class-validator';

export class UpdateCurrentOrganizationDto {
  @ApiProperty()
  @IsString()
  @MaxLength(120)
  name!: string;
}
