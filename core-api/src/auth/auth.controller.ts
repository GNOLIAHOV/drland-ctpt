import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AuthService, type LoginResult } from './auth.service.js';
import type { AuthenticatedAdmin } from './auth.types.js';
import { CurrentAdmin } from './current-admin.decorator.js';
import { ChangePasswordDto } from './dto/change-password.dto.js';
import { LoginDto } from './dto/login.dto.js';
import { JwtAuthGuard } from './jwt-auth.guard.js';

@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly config: ConfigService,
  ) {}

  @Post('login')
  @HttpCode(HttpStatus.OK)
  login(@Body() dto: LoginDto): Promise<LoginResult> {
    return this.auth.login(dto, this.config.get('JWT_EXPIRES_IN', '1d'));
  }

  /** Returns the current admin profile — handy to verify a token. */
  @Get('me')
  @UseGuards(JwtAuthGuard)
  me(@CurrentAdmin() admin: AuthenticatedAdmin): AuthenticatedAdmin {
    return admin;
  }

  /** Allows the authenticated admin to change their password and display name. */
  @Patch('change-password')
  @UseGuards(JwtAuthGuard)
  changePassword(
    @CurrentAdmin() admin: AuthenticatedAdmin,
    @Body() dto: ChangePasswordDto,
  ): Promise<{ message: string; admin: AuthenticatedAdmin }> {
    return this.auth.changePassword(admin.id, dto);
  }
}
