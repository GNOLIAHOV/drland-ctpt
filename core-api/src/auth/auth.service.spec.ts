import { BadRequestException, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import bcrypt from 'bcryptjs';
import { AuthService } from './auth.service.js';
import type { PrismaService } from '../prisma/prisma.service.js';

describe('AuthService', () => {
  const jwt = new JwtService({ secret: 'test-secret' });
  const passwordHash = bcrypt.hashSync('correct-password', 4);
  const admin = {
    id: '00000000-0000-0000-0000-000000000001',
    email: 'admin@test.local',
    passwordHash,
    fullName: 'Test Admin',
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const makeService = (found: typeof admin | null) => {
    const prisma = {
      admin: {
        findUnique: vi.fn().mockResolvedValue(found),
        update: vi.fn().mockImplementation(({ data }) =>
          Promise.resolve({
            id: found?.id ?? admin.id,
            email: found?.email ?? admin.email,
            fullName: (data.fullName as string | undefined) ?? found?.fullName ?? admin.fullName,
          }),
        ),
      },
    } as unknown as PrismaService;
    return { service: new AuthService(prisma, jwt), prisma };
  };

  it('returns a signed token for valid credentials', async () => {
    const { service, prisma } = makeService(admin);
    const result = await service.login(
      { email: '  ADMIN@test.local ', password: 'correct-password' },
      '1d',
    );

    expect(prisma.admin.findUnique).toHaveBeenCalledWith({
      where: { email: 'admin@test.local' },
    });
    expect(result.tokenType).toBe('Bearer');
    expect(result.admin).toEqual({
      id: admin.id,
      email: admin.email,
      fullName: admin.fullName,
    });
    const payload = await jwt.verifyAsync(result.accessToken);
    expect(payload).toMatchObject({ sub: admin.id, email: admin.email });
  });

  it('rejects a wrong password', async () => {
    const { service } = makeService(admin);
    await expect(
      service.login({ email: admin.email, password: 'wrong-password' }, '1d'),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('rejects an unknown email', async () => {
    const { service } = makeService(null);
    await expect(
      service.login({ email: 'x@y.z', password: 'whatever-pass' }, '1d'),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  describe('changePassword', () => {
    it('hashes new password and updates fullName when current password is valid', async () => {
      const { service, prisma } = makeService(admin);
      const res = await service.changePassword(admin.id, {
        currentPassword: 'correct-password',
        newPassword: 'new-strong-password',
        fullName: 'Quản lý Mới',
      });

      expect(res.message).toBe('Đã đổi mật khẩu thành công');
      expect(res.admin).toEqual({
        id: admin.id,
        email: admin.email,
        fullName: 'Quản lý Mới',
      });
      const updateCall = (prisma.admin.update as ReturnType<typeof vi.fn>).mock.calls[0][0];
      expect(updateCall.where).toEqual({ id: admin.id });
      expect(await bcrypt.compare('new-strong-password', updateCall.data.passwordHash)).toBe(true);
    });

    it('rejects wrong current password', async () => {
      const { service, prisma } = makeService(admin);
      await expect(
        service.changePassword(admin.id, {
          currentPassword: 'wrong-password',
          newPassword: 'new-strong-password',
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.admin.update).not.toHaveBeenCalled();
    });

    it('rejects when newPassword equals currentPassword', async () => {
      const { service, prisma } = makeService(admin);
      await expect(
        service.changePassword(admin.id, {
          currentPassword: 'correct-password',
          newPassword: 'correct-password',
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.admin.update).not.toHaveBeenCalled();
    });

    it('rejects when admin account is missing', async () => {
      const { service } = makeService(null);
      await expect(
        service.changePassword(admin.id, {
          currentPassword: 'correct-password',
          newPassword: 'new-strong-password',
        }),
      ).rejects.toBeInstanceOf(UnauthorizedException);
    });
  });
});
