import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { AdminService } from './admin.service';
import { AssignEmployeeDto } from './assign-employee.dto';
import { CreateLeaveTypeDto } from './create-leave-type.dto';
import {
  UpdateAllowanceDto,
  UpdateSettingsDto,
} from './update-settings.dto';

@Controller('admin')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN')
export class AdminController {
  constructor(private readonly adminService: AdminService) {}

  @Get('settings')
  getSettings() {
    return this.adminService.getSettings();
  }

  @Patch('settings')
  updateSettings(@Body() dto: UpdateSettingsDto) {
    return this.adminService.updateSettings(dto);
  }

  @Post('leave-types')
  createLeaveType(@Body() dto: CreateLeaveTypeDto) {
    return this.adminService.createLeaveType(dto);
  }

  @Patch('leave-types/:id')
  updateAllowance(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateAllowanceDto,
  ) {
    return this.adminService.updateAllowance(id, dto);
  }

  @Get('employees')
  getEmployees() {
    return this.adminService.getEmployees();
  }

  @Get('employee-options')
  getEmployeeOptions() {
    return this.adminService.getEmployeeOptions();
  }

  @Patch('employees/:id/assignment')
  assignEmployee(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: AssignEmployeeDto,
  ) {
    return this.adminService.assignEmployee(id, dto);
  }
}