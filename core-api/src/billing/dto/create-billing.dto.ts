import { Transform } from 'class-transformer';
import {
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { IsGreaterOrEqualTo } from '../../common/validators/is-greater-or-equal-to.validator.js';
import { MAX_METER_INDEX } from '../billing.calculator.js';

export const MIN_PERIOD_YEAR = 2000;
export const MAX_PERIOD_YEAR = 2100;

export class CreateBillingDto {
  @IsUUID('4')
  propertyId: string;

  /** Kỳ hóa đơn: tháng (1-12) */
  @IsInt()
  @Min(1)
  @Max(12)
  periodMonth: number;

  /** Kỳ hóa đơn: năm */
  @IsInt()
  @Min(MIN_PERIOD_YEAR)
  @Max(MAX_PERIOD_YEAR)
  periodYear: number;

  /** Chỉ số điện cũ (đầu kỳ) */
  @IsInt()
  @Min(0)
  @Max(MAX_METER_INDEX)
  electricityOldIndex: number;

  /** Chỉ số điện mới (cuối kỳ) — phải >= chỉ số cũ */
  @IsInt()
  @Min(0)
  @Max(MAX_METER_INDEX)
  @IsGreaterOrEqualTo('electricityOldIndex')
  electricityNewIndex: number;

  /** Chỉ số nước cũ (đầu kỳ) */
  @IsInt()
  @Min(0)
  @Max(MAX_METER_INDEX)
  waterOldIndex: number;

  /** Chỉ số nước mới (cuối kỳ) — phải >= chỉ số cũ */
  @IsInt()
  @Min(0)
  @Max(MAX_METER_INDEX)
  @IsGreaterOrEqualTo('waterOldIndex')
  waterNewIndex: number;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2, allowNaN: false, allowInfinity: false })
  @Min(-999_999_999)
  @Max(999_999_999)
  adjustmentAmount?: number;

  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MaxLength(500)
  adjustmentNote?: string;

  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MaxLength(1000)
  note?: string;
}
