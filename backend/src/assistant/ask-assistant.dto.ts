import {
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

export class AskAssistantDto {
  @IsIn(['policies', 'balance', 'requests', 'availability'])
  topic!: 'policies' | 'balance' | 'requests' | 'availability';

  @IsString()
  @MinLength(3)
  @MaxLength(1000)
  question!: string;

  @IsOptional()
  @IsInt()
  @Min(1900)
  @Max(9999)
  year?: number;

  @IsOptional()
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  startDate?: string;

  @IsOptional()
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  endDate?: string;
}