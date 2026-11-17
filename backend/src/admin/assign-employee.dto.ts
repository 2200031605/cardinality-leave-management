import { IsInt, Min } from 'class-validator';

export class AssignEmployeeDto {
  @IsInt()
  @Min(1)
  teamId!: number;

  @IsInt()
  @Min(1)
  managerId!: number;
}