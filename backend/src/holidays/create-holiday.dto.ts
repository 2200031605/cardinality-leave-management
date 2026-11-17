import { IsString, Matches, MaxLength, MinLength } from 'class-validator';

export class CreateHolidayDto {
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  name!: string;

  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  date!: string;
}