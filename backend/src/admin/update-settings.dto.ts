import { IsInt, Min } from 'class-validator';

export class UpdateSettingsDto {
  @IsInt()
  @Min(0)
  minimumNoticeDays!: number;

  @IsInt()
  @Min(1)
  maxTeamMembersOff!: number;
}

export class UpdateAllowanceDto {
  @IsInt()
  @Min(0)
  yearlyAllowance!: number;
}