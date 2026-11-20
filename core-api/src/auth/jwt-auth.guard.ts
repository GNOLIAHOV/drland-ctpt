import { Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

/**
 * Protects Admin-only routes. Usage: `@UseGuards(JwtAuthGuard)` on a controller
 * or handler. Requires header `Authorization: Bearer <accessToken>`.
 */
@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {}
