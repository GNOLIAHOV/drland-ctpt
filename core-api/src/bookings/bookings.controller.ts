import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import {
  BookingsService,
  type BookingResponse,
  type PaginatedBookings,
} from './bookings.service.js';
import { CreateBookingDto } from './dto/create-booking.dto.js';
import { QueryBookingDto } from './dto/query-booking.dto.js';
import { UpdateBookingStatusDto } from './dto/update-booking-status.dto.js';

@Controller('bookings')
export class BookingsController {
  constructor(private readonly bookings: BookingsService) {}

  /**
   * Public endpoint for AI Agent / guests to submit a booking request.
   * Rate-limited to max 5 requests per 60 seconds per IP to prevent spam.
   */
  @Post()
  @UseGuards(ThrottlerGuard)
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  create(@Body() dto: CreateBookingDto): Promise<BookingResponse> {
    return this.bookings.create(dto);
  }

  /** Admin-only endpoint to view booking requests. */
  @Get()
  @UseGuards(JwtAuthGuard)
  findAll(@Query() query: QueryBookingDto): Promise<PaginatedBookings> {
    return this.bookings.findAll(query);
  }

  /** Admin-only endpoint to update a booking request status (PENDING -> CONTACTED, CONFIRMED, etc.). */
  @Patch(':id/status')
  @UseGuards(JwtAuthGuard)
  updateStatus(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateBookingStatusDto,
  ): Promise<BookingResponse> {
    return this.bookings.updateStatus(id, dto.status);
  }

  /** Admin-only endpoint to remove a booking request. */
  @Delete(':id')
  @UseGuards(JwtAuthGuard)
  remove(
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<{ success: boolean; message: string }> {
    return this.bookings.remove(id);
  }
}
