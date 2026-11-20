import { IsEnum } from 'class-validator';
import { BookingStatus } from '../../generated/prisma/enums.js';

export class UpdateBookingStatusDto {
  @IsEnum(BookingStatus, {
    message: 'Trạng thái phải là PENDING, CONTACTED, CONFIRMED, REJECTED, hoặc CANCELLED',
  })
  status: BookingStatus;
}
