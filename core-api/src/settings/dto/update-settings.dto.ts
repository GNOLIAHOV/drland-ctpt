import { Transform } from 'class-transformer';
import {
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';

const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

export class UpdateSettingsDto {
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MinLength(1, { message: 'Tên thương hiệu không được để trống' })
  @MaxLength(120)
  brandName?: string;

  @IsOptional()
  @Transform(trim)
  @IsString()
  @MinLength(6, { message: 'Số hotline phải có ít nhất 6 ký tự' })
  @MaxLength(30)
  hotline?: string;

  @IsOptional()
  @Transform(trim)
  @IsString()
  @MinLength(6, { message: 'Số Zalo phải có ít nhất 6 ký tự' })
  @MaxLength(30)
  zaloPhone?: string;

  @IsOptional()
  @Transform(trim)
  @IsString()
  @MinLength(1, { message: 'Giờ xem phòng không được để trống' })
  @MaxLength(120)
  viewingHours?: string;

  @IsOptional()
  @Transform(trim)
  @IsString()
  @MinLength(2)
  @MaxLength(30)
  bankCode?: string;

  @IsOptional()
  @Transform(trim)
  @IsString()
  @MinLength(2)
  @MaxLength(50)
  bankSlug?: string;

  @IsOptional()
  @Transform(trim)
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  bankName?: string;

  @IsOptional()
  @Transform(trim)
  @IsString()
  @MinLength(3)
  @MaxLength(50)
  accountNumber?: string;

  @IsOptional()
  @Transform(trim)
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  accountName?: string;
}
