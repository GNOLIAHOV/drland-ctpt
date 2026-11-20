import { Transform } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsEnum,
  IsISO8601,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  IsUrl,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateIf,
} from 'class-validator';
import { PropertyStatus, PropertyType } from '../../generated/prisma/enums.js';

/** Upper bounds mirror the DB column precision (see schema.prisma). */
export const MAX_MONEY = 999_999_999_999; // Decimal(14,2)
export const MAX_RATE = 99_999_999; // Decimal(10,2)
export const MAX_AREA = 999_999; // Decimal(8,2)

const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

const money = { maxDecimalPlaces: 2, allowNaN: false, allowInfinity: false };

export class CreatePropertyDto {
  /** ID ngôi nhà / cơ sở quản lý phòng hoặc mặt bằng này */
  @IsOptional()
  @IsUUID('4', { message: 'houseId phải là UUID hợp lệ' })
  houseId?: string;

  /** Mã phòng, vd: P101, MB-01. Tự động chuyển sang chữ in hoa. */
  @Transform(({ value }) =>
    typeof value === 'string' ? value.trim().toUpperCase() : value,
  )
  @IsString()
  @Matches(/^[A-Z0-9_-]{2,20}$/, {
    message: 'code chỉ gồm A-Z, 0-9, "-" hoặc "_" (2-20 ký tự)',
  })
  code: string;

  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(150)
  name: string;

  @IsOptional()
  @IsEnum(PropertyType, {
    message: `type phải là một trong: ${Object.values(PropertyType).join(', ')}`,
  })
  type?: PropertyType;

  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  address: string;

  /** Diện tích (m²) */
  @IsNumber(money)
  @Min(0.01)
  @Max(MAX_AREA)
  area: number;

  /** Giá thuê / tháng (VNĐ) */
  @IsNumber(money)
  @Min(0)
  @Max(MAX_MONEY)
  monthlyRent: number;

  /** Tiền cọc (VNĐ) */
  @IsOptional()
  @IsNumber(money)
  @Min(0)
  @Max(MAX_MONEY)
  deposit?: number;

  /** Đơn giá điện (VNĐ/kWh) */
  @IsNumber(money)
  @Min(0)
  @Max(MAX_RATE)
  electricityRate: number;

  /** Đơn giá nước (VNĐ/m³) */
  @IsNumber(money)
  @Min(0)
  @Max(MAX_RATE)
  waterRate: number;

  /** Phí dịch vụ / tháng (VNĐ) */
  @IsOptional()
  @IsNumber(money)
  @Min(0)
  @Max(MAX_MONEY)
  serviceFee?: number;

  @IsOptional()
  @IsEnum(PropertyStatus, {
    message: `status phải là một trong: ${Object.values(PropertyStatus).join(', ')}`,
  })
  status?: PropertyStatus;

  /**
   * Ngày dự kiến trống (YYYY-MM-DD).
   * Bắt buộc khi status = SOON_TO_BE_AVAILABLE.
   */
  @ValidateIf(
    (o: CreatePropertyDto) =>
      o.status === PropertyStatus.SOON_TO_BE_AVAILABLE ||
      o.availableFrom != null,
  )
  @IsISO8601(
    { strict: true, strictSeparator: true },
    {
      message:
        'availableFrom phải là ngày hợp lệ (YYYY-MM-DD) và bắt buộc khi status = SOON_TO_BE_AVAILABLE',
    },
  )
  availableFrom?: string;

  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(5000)
  description?: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @IsUrl({ require_protocol: true }, { each: true })
  images?: string[];

  /** Họ tên khách thuê / khách cọc */
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(150)
  tenantName?: string;

  /** Số điện thoại khách thuê / khách cọc */
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(20)
  tenantPhone?: string;

  /** Số CCCD / CMND của khách */
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(30)
  tenantCitizenId?: string;

  /** Ngày bắt đầu hợp đồng / dọn vào (YYYY-MM-DD) */
  @IsOptional()
  @IsISO8601(
    { strict: true, strictSeparator: true },
    { message: 'leaseStartDate phải là ngày hợp lệ (YYYY-MM-DD)' },
  )
  leaseStartDate?: string;

  /** Ngày kết thúc hợp đồng (YYYY-MM-DD) */
  @IsOptional()
  @IsISO8601(
    { strict: true, strictSeparator: true },
    { message: 'leaseEndDate phải là ngày hợp lệ (YYYY-MM-DD)' },
  )
  leaseEndDate?: string;

  /** Tiền cọc thực tế đã nhận (VNĐ) */
  @IsOptional()
  @IsNumber(money)
  @Min(0)
  @Max(MAX_MONEY)
  depositPaid?: number;

  /** Số người ở */
  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(50)
  tenantCount?: number;

  /** Số lượng xe gửi */
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(50)
  vehicleCount?: number;

  /** Ghi chú hợp đồng & bàn giao tài sản */
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(5000)
  rentalNotes?: string;
}
