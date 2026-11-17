import {
  IsInt,
  IsString,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

export class CreateLeaveTypeDto {
  @IsString()
  @MinLength(2)
  @MaxLength(60)
  name!: string;

  @IsInt()
  @Min(0)
  yearlyAllowance!: number;
}