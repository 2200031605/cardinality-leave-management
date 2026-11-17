import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import type { AuthRequest } from '../auth/jwt-auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { CreateLeaveDto } from './create-leave.dto';
import { DecideLeaveDto } from './decide-leave.dto';
import { LeaveService } from './leave.service';

@Controller('leave')
@UseGuards(JwtAuthGuard)
export class LeaveController {
  constructor(private readonly leaveService: LeaveService) {}

  @Get('types')
  getLeaveTypes() {
    return this.leaveService.getLeaveTypes();
  }

  @Get('my-requests')
  getMyRequests(@Req() request: AuthRequest) {
    return this.leaveService.getMyRequests(request.user!.sub);
  }

  @Post('requests')
  create(
    @Req() request: AuthRequest,
    @Body() dto: CreateLeaveDto,
  ) {
    return this.leaveService.create(request.user!.sub, dto);
  }

  @Get('team-requests')
  @UseGuards(RolesGuard)
  @Roles('MANAGER')
  getTeamRequests(@Req() request: AuthRequest) {
    return this.leaveService.getTeamRequests(request.user!.sub);
  }

  @Patch('requests/:id/decision')
  @UseGuards(RolesGuard)
  @Roles('MANAGER')
  decide(
    @Req() request: AuthRequest,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: DecideLeaveDto,
  ) {
    return this.leaveService.decide(request.user!.sub, id, dto.status);
  }

  @Patch('requests/:id/cancel')
  cancel(
    @Req() request: AuthRequest,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.leaveService.cancel(request.user!.sub, id);
  }

  @Get('balances')
getMyBalances(
  @Req() request: AuthRequest,
  @Query('year', ParseIntPipe) year: number,
) {
  return this.leaveService.getMyBalances(request.user!.sub, year);
}

@Get('calendar')
getTeamCalendar(
  @Req() request: AuthRequest,
  @Query('year', ParseIntPipe) year: number,
  @Query('month', ParseIntPipe) month: number,
) {
  return this.leaveService.getTeamCalendar(
    request.user!.sub,
    year,
    month,
  );
}
}