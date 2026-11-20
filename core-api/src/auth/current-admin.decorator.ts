import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import type { Request } from 'express';
import type { AuthenticatedAdmin } from './auth.types.js';

/** Injects the authenticated admin (set by JwtStrategy) into a handler param. */
export const CurrentAdmin = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): AuthenticatedAdmin =>
    ctx.switchToHttp().getRequest<Request>().user as AuthenticatedAdmin,
);
