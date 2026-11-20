import {
  BadRequestException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import bcrypt from 'bcryptjs';
import { PrismaService } from '../prisma/prisma.service.js';
import type { AuthenticatedAdmin, JwtPayload } from './auth.types.js';
import type { ChangePasswordDto } from './dto/change-password.dto.js';
import type { LoginDto } from './dto/login.dto.js';

// Hash compared against when the email does not exist, so response time does
// not reveal whether an account exists (mitigates user enumeration).
const DUMMY_HASH = bcrypt.hashSync('dummy-password-for-timing', 10);

export interface LoginResult {
  accessToken: string;
  tokenType: 'Bearer';
  expiresIn: string;
  admin: AuthenticatedAdmin;
}

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
  ) {}

  async login(dto: LoginDto, expiresIn: string): Promise<LoginResult> {
    const admin = await this.prisma.admin.findUnique({
      where: { email: dto.email.trim().toLowerCase() },
    });

    const passwordOk = await bcrypt.compare(
      dto.password,
      admin?.passwordHash ?? DUMMY_HASH,
    );

    if (!admin || !passwordOk) {
      throw new UnauthorizedException('Email hoặc mật khẩu không đúng');
    }

    const payload: JwtPayload = { sub: admin.id, email: admin.email };
    const accessToken = await this.jwt.signAsync(payload);

    return {
      accessToken,
      tokenType: 'Bearer',
      expiresIn,
      admin: { id: admin.id, email: admin.email, fullName: admin.fullName },
    };
  }

  async changePassword(
    adminId: string,
    dto: ChangePasswordDto,
  ): Promise<{ message: string; admin: AuthenticatedAdmin }> {
    const admin = await this.prisma.admin.findUnique({
      where: { id: adminId },
    });

    if (!admin) {
      throw new UnauthorizedException('Tài khoản quản trị không tồn tại');
    }

    const currentPasswordOk = await bcrypt.compare(
      dto.currentPassword,
      admin.passwordHash,
    );
    if (!currentPasswordOk) {
      throw new BadRequestException('Mật khẩu hiện tại không đúng');
    }

    if (dto.currentPassword === dto.newPassword) {
      throw new BadRequestException('Mật khẩu mới phải khác mật khẩu hiện tại');
    }

    const passwordHash = await bcrypt.hash(dto.newPassword, 10);
    const trimmedName = dto.fullName?.trim();

    const updated = await this.prisma.admin.update({
      where: { id: adminId },
      data: {
        passwordHash,
        ...(trimmedName ? { fullName: trimmedName } : {}),
      },
      select: { id: true, email: true, fullName: true },
    });

    return {
      message: 'Đã đổi mật khẩu thành công',
      admin: updated,
    };
  }
}
