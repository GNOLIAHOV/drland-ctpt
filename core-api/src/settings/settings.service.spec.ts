import { PrismaService } from '../prisma/prisma.service.js';
import { SettingsService } from './settings.service.js';

describe('SettingsService', () => {
  const defaultRow = {
    id: 'default',
    brandName: 'DRLAND',
    hotline: '0943.257.089',
    zaloPhone: '0943257089',
    viewingHours: '08:00 - 20:30 (Mỗi ngày)',
    bankCode: '971101',
    bankSlug: 'zalopay',
    bankName: 'Ví điện tử ZaloPay',
    accountNumber: '0943257089',
    accountName: 'VO HAI LONG',
    updatedAt: new Date(),
  };

  it('getPublicSettings exposes only non-sensitive contact fields', async () => {
    const prisma = {
      systemSetting: {
        upsert: vi.fn().mockResolvedValue(defaultRow),
      },
    } as unknown as PrismaService;

    const service = new SettingsService(prisma);
    const pub = await service.getPublicSettings();

    expect(pub).toEqual({
      brandName: 'DRLAND',
      hotline: '0943.257.089',
      hotlineDigits: '0943257089',
      zaloPhone: '0943257089',
      viewingHours: '08:00 - 20:30 (Mỗi ngày)',
    });
    expect(pub).not.toHaveProperty('accountNumber');
    expect(pub).not.toHaveProperty('bankCode');
  });

  it('updateSettings normalizes bankSlug, accountName, and zaloPhone', async () => {
    const prisma = {
      systemSetting: {
        upsert: vi.fn().mockImplementation(({ create }) =>
          Promise.resolve({ ...defaultRow, ...create }),
        ),
      },
    } as unknown as PrismaService;

    const service = new SettingsService(prisma);
    const updated = await service.updateSettings({
      hotline: '0909.111.222',
      zaloPhone: '0909 111 222',
      bankSlug: 'MBBANK',
      accountName: 'nguyen van a',
    });

    expect(updated.hotlineDigits).toBe('0909111222');
    expect(updated.zaloPhone).toBe('0909111222');
    expect(updated.bankSlug).toBe('mbbank');
    expect(updated.accountName).toBe('NGUYEN VAN A');
  });
});
