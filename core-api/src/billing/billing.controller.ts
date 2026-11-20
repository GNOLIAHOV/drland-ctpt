import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import {
  BillingService,
  type BillingResponse,
  type PaginatedBillings,
} from './billing.service.js';
import { CreateBillingDto } from './dto/create-billing.dto.js';
import { QueryBillingDto } from './dto/query-billing.dto.js';

/** Billing data is financial — every route is Admin-only. */
@Controller('billings')
@UseGuards(JwtAuthGuard)
export class BillingController {
  constructor(private readonly billing: BillingService) {}

  @Post()
  create(@Body() dto: CreateBillingDto): Promise<BillingResponse> {
    return this.billing.create(dto);
  }

  @Get()
  findAll(@Query() query: QueryBillingDto): Promise<PaginatedBillings> {
    return this.billing.findAll(query);
  }

  @Get('qr-proxy')
  async proxyQr(@Query('url') qrUrl: string, @Res() res: Response): Promise<void> {
    if (!qrUrl || !qrUrl.startsWith('https://img.vietqr.io/')) {
      throw new BadRequestException('Chỉ hỗ trợ tải ảnh từ img.vietqr.io');
    }
    try {
      const response = await fetch(qrUrl);
      if (!response.ok) {
        throw new BadRequestException('Không thể lấy ảnh từ VietQR');
      }
      const contentType = response.headers.get('content-type') || 'image/png';
      const arrayBuffer = await response.arrayBuffer();
      res.setHeader('Content-Type', contentType);
      res.setHeader('Cache-Control', 'public, max-age=86400');
      res.send(Buffer.from(arrayBuffer));
    } catch {
      throw new BadRequestException('Lỗi kết nối đến dịch vụ VietQR');
    }
  }

  @Get(':id')
  findOne(
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
  ): Promise<BillingResponse> {
    return this.billing.findOne(id);
  }

  @Patch(':id/pay')
  markAsPaid(
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
  ): Promise<BillingResponse> {
    return this.billing.markAsPaid(id);
  }

  @Delete(':id')
  remove(
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
  ): Promise<{ success: boolean; message: string }> {
    return this.billing.remove(id);
  }
}
