import { Injectable } from '@nestjs/common';
import type { SystemSetting } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import type { UpdateSettingsDto } from './dto/update-settings.dto.js';

export interface PublicSystemSettings {
  brandName: string;
  hotline: string;
  hotlineDigits: string;
  zaloPhone: string;
  viewingHours: string;
}

export interface AdminSystemSettings extends PublicSystemSettings {
  id: string;
  bankCode: string;
  bankSlug: string;
  bankName: string;
  accountNumber: string;
  accountName: string;
  updatedAt: Date;
}

const DEFAULT_SETTING_ID = 'default';

const toAdminSettings = (row: SystemSetting): AdminSystemSettings => ({
  id: row.id,
  brandName: row.brandName,
  hotline: row.hotline,
  hotlineDigits:
    row.hotline.replace(/\D/g, '') ||
    row.zaloPhone.replace(/\D/g, '') ||
    '0943257089',
  zaloPhone: row.zaloPhone,
  viewingHours: row.viewingHours,
  bankCode: row.bankCode,
  bankSlug: row.bankSlug,
  bankName: row.bankName,
  accountNumber: row.accountNumber,
  accountName: row.accountName,
  updatedAt: row.updatedAt,
});

@Injectable()
export class SettingsService {
  constructor(private readonly prisma: PrismaService) {}

  async getSettings(): Promise<AdminSystemSettings> {
    const row = await this.prisma.systemSetting.upsert({
      where: { id: DEFAULT_SETTING_ID },
      update: {},
      create: { id: DEFAULT_SETTING_ID },
    });
    return toAdminSettings(row);
  }

  async getPublicSettings(): Promise<PublicSystemSettings> {
    const full = await this.getSettings();
    return {
      brandName: full.brandName,
      hotline: full.hotline,
      hotlineDigits: full.hotlineDigits,
      zaloPhone: full.zaloPhone,
      viewingHours: full.viewingHours,
    };
  }

  async updateSettings(dto: UpdateSettingsDto): Promise<AdminSystemSettings> {
    const patch: Partial<SystemSetting> = {
      ...(dto.brandName !== undefined && { brandName: dto.brandName }),
      ...(dto.hotline !== undefined && { hotline: dto.hotline }),
      ...(dto.zaloPhone !== undefined && {
        zaloPhone: dto.zaloPhone.replace(/\s+/g, ''),
      }),
      ...(dto.viewingHours !== undefined && { viewingHours: dto.viewingHours }),
      ...(dto.bankCode !== undefined && { bankCode: dto.bankCode }),
      ...(dto.bankSlug !== undefined && {
        bankSlug: dto.bankSlug.toLowerCase(),
      }),
      ...(dto.bankName !== undefined && { bankName: dto.bankName }),
      ...(dto.accountNumber !== undefined && {
        accountNumber: dto.accountNumber,
      }),
      ...(dto.accountName !== undefined && {
        accountName: dto.accountName.toUpperCase(),
      }),
    };

    const row = await this.prisma.systemSetting.upsert({
      where: { id: DEFAULT_SETTING_ID },
      update: patch,
      create: {
        id: DEFAULT_SETTING_ID,
        ...patch,
      },
    });

    return toAdminSettings(row);
  }
}
