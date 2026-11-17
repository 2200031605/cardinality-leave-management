import {
  Body,
  Controller,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';
import { SignupDto, VerifySignupDto } from './signup.dto';
import { SignupService } from './signup.service';

@Controller('auth')
@UseGuards(ThrottlerGuard)
export class SignupController {
  constructor(
    private readonly signupService: SignupService,
  ) {}

  @Post('signup')
  signup(@Body() dto: SignupDto) {
    return this.signupService.signup(dto);
  }

  @Post('verify-signup')
  verify(@Body() dto: VerifySignupDto) {
    return this.signupService.verify(dto);
  }
}