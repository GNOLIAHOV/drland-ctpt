import { Transform } from 'class-transformer';
import {
  IsEmail,
  IsISO8601,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
} from 'class-validator';

const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

export class CreateBookingDto {
  @IsUUID('4')
  propertyId: string;

  @Transform(trim)
  @IsString()
  @IsNotEmpty({ message: 'guestName không được để trống' })
  @MaxLength(150)
  guestName: string;

  @Transform(trim)
  @IsString()
  @Matches(/^\+?[0-9\s.-]{8,20}$/, {
    message: 'phoneNumber phải là số điện thoại hợp lệ (8-20 ký tự số)',
  })
  phoneNumber: string;

  /** Thời gian hẹn xem phòng hoặc dự kiến dọn vào (ISO 8601: YYYY-MM-DD hoặc datetime) */
  @IsISO8601(
    { strict: true, strictSeparator: true },
    { message: 'appointmentTime phải là định dạng thời gian ISO 8601 hợp lệ' },
  )
  appointmentTime: string;

  @IsOptional()
  @Transform(trim)
  @IsEmail()
  @MaxLength(255)
  guestEmail?: string;

  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(2000)
  message?: string;

  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(50)
  source?: string;
}
