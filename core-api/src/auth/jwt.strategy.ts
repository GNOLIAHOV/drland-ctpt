import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { PrismaService } from '../prisma/prisma.service.js';
import type { AuthenticatedAdmin, JwtPayload } from './auth.types.js';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'jwt') {
  constructor(
    config: ConfigService,
    private readonly prisma: PrismaService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: config.getOrThrow<string>('JWT_SECRET'),
      algorithms: ['HS256'],
    });
  }

  /** Runs after signature/expiry are verified; ensures the admin still exists. */
  async validate(payload: JwtPayload): Promise<AuthenticatedAdmin> {
    const admin = await this.prisma.admin.findUnique({
      where: { id: payload.sub },
      select: { id: true, email: true, fullName: true },
    });
    if (!admin) {
      throw new UnauthorizedException();
    }
    return admin;
  }
}
