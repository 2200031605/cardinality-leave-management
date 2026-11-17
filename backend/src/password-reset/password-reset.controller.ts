import {
  Body,
  Controller,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';
import {
  ForgotPasswordDto,
  ResetPasswordDto,
} from './password-reset.dto';
import { PasswordResetService } from './password-reset.service';

@Controller('auth')
@UseGuards(ThrottlerGuard)
export class PasswordResetController {
  constructor(
    private readonly service: PasswordResetService,
  ) {}

  @Post('forgot-password')
  forgotPassword(@Body() dto: ForgotPasswordDto) {
    return this.service.forgotPassword(dto);
  }

  @Post('reset-password')
  resetPassword(@Body() dto: ResetPasswordDto) {
    return this.service.resetPassword(dto);
  }
}