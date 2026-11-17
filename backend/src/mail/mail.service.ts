import {
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';

@Injectable()
export class MailService {
  constructor(private readonly config: ConfigService) {}

  private async send(
    to: string,
    subject: string,
    text: string,
  ): Promise<void> {
    const port = Number(
      this.config.get('SMTP_PORT') ?? 465,
    );

    const transporter = nodemailer.createTransport({
      host: this.config.getOrThrow<string>('SMTP_HOST'),
      port,
      secure: port === 465,
      requireTLS: port !== 465,
      auth: {
        user: this.config.getOrThrow<string>('SMTP_USER'),
        pass: this.config
          .getOrThrow<string>('SMTP_PASS')
          .replace(/\s/g, ''),
      },
      connectionTimeout: 10000,
      greetingTimeout: 10000,
      socketTimeout: 15000,
      tls: {
        minVersion: 'TLSv1.2',
      },
    });

    try {
      await transporter.sendMail({
        from: this.config.getOrThrow<string>('MAIL_FROM'),
        to,
        subject,
        text,
      });
    } catch {
      throw new ServiceUnavailableException(
        'Email could not be sent. Please try again later.',
      );
    } finally {
      transporter.close();
    }
  }

  async sendSignupOtp(
    email: string,
    otp: string,
  ): Promise<void> {
    await this.send(
      email,
      'Verify your Leave Management account',
      [
        'Your email verification code is:',
        '',
        otp,
        '',
        'This code expires in 10 minutes.',
        'Do not share this code with anyone.',
        '',
        'If you did not request this signup, ignore this email.',
      ].join('\n'),
    );
  }

  async sendWelcome(email: string): Promise<void> {
    await this.send(
      email,
      'Your Leave Management account is ready',
      [
        'Your email has been verified and your account was created.',
        '',
        'You can now sign in using your email and signup password.',
        'Your administrator must assign your team and manager',
        'before you can request leave.',
        '',
        'Your password is never included in emails.',
      ].join('\n'),
    );
  }

  async sendPasswordResetOtp(
    email: string,
    otp: string,
  ): Promise<void> {
    await this.send(
      email,
      'Reset your Leave Management password',
      [
        'Your password reset code is:',
        '',
        otp,
        '',
        'This code expires in 10 minutes.',
        'Do not share it with anyone.',
        '',
        'If you did not request this, ignore this email.',
        'Your password has not been changed.',
      ].join('\n'),
    );
  }

  async sendPasswordChanged(
    email: string,
  ): Promise<void> {
    await this.send(
      email,
      'Your Leave Management password was changed',
      [
        'Your account password was changed successfully.',
        '',
        'Previous login sessions have been invalidated.',
        'Sign in using your new password.',
        '',
        'If you did not make this change, use Forgot Password',
        'to secure your account and contact your administrator.',
      ].join('\n'),
    );
  }

  async sendLeaveRequestNotification(data: {
  managerEmail: string;
  employeeName: string;
  leaveType: string;
  startDate: string;
  endDate: string;
  days: number;
}): Promise<void> {
  await this.send(
    data.managerEmail,
    'New leave request awaiting your decision',
    [
      `${data.employeeName} submitted a leave request.`,
      '',
      `Leave type: ${data.leaveType}`,
      `Start date: ${data.startDate}`,
      `End date: ${data.endDate}`,
      `Working days: ${data.days}`,
      '',
      'Sign in to Leave Management and open Approvals',
      'to review the request.',
    ].join('\n'),
  );
}

async sendLeaveDecisionNotification(data: {
  employeeEmail: string;
  leaveType: string;
  startDate: string;
  endDate: string;
  status: 'APPROVED' | 'REJECTED';
}): Promise<void> {
  await this.send(
    data.employeeEmail,
    `Your leave request was ${data.status.toLowerCase()}`,
    [
      `Your leave request has been ${data.status.toLowerCase()}.`,
      '',
      `Leave type: ${data.leaveType}`,
      `Start date: ${data.startDate}`,
      `End date: ${data.endDate}`,
      '',
      'Sign in to Leave Management to view your updated',
      'request status and balance.',
    ].join('\n'),
  );
}
}