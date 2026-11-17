import { IsIn } from 'class-validator';

export class DecideLeaveDto {
  @IsIn(['APPROVED', 'REJECTED'])
  status!: 'APPROVED' | 'REJECTED';
}