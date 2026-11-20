import { Body, Controller, Get, Patch, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { UpdateSettingsDto } from './dto/update-settings.dto.js';
import {
  type AdminSystemSettings,
  type PublicSystemSettings,
  SettingsService,
} from './settings.service.js';

@Controller('settings')
export class SettingsController {
  constructor(private readonly settings: SettingsService) {}

  /** Public contact settings for customer storefront & AI agent (never exposes bank details). */
  @Get('public')
  getPublicSettings(): Promise<PublicSystemSettings> {
    return this.settings.getPublicSettings();
  }

  /** Full system & payment settings (Admin-only). */
  @Get()
  @UseGuards(JwtAuthGuard)
  getSettings(): Promise<AdminSystemSettings> {
    return this.settings.getSettings();
  }

  /** Update contact and/or bank settings (Admin-only). */
  @Patch()
  @UseGuards(JwtAuthGuard)
  updateSettings(
    @Body() dto: UpdateSettingsDto,
  ): Promise<AdminSystemSettings> {
    return this.settings.updateSettings(dto);
  }
}
