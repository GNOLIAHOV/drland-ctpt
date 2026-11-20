import { Transform } from 'class-transformer';
import {
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { MAX_MONEY, MAX_RATE } from '../../properties/dto/create-property.dto.js';

const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

const money = { maxDecimalPlaces: 2, allowNaN: false, allowInfinity: false };

export class CreateHouseDto {
  @Transform(({ value }) =>
    typeof value === 'string' ? value.trim().toUpperCase() : value,
  )
  @IsString()
  @Matches(/^[A-Z0-9_-]{2,50}$/, {
    message: 'code chỉ gồm A-Z, 0-9, "-" hoặc "_" (2-50 ký tự)',
  })
  code: string;

  @Transform(trim)
  @IsString()
  @IsNotEmpty({ message: 'Tên tòa nhà không được để trống' })
  @MaxLength(150)
  name: string;

  @Transform(trim)
  @IsString()
  @IsNotEmpty({ message: 'Địa chỉ tòa nhà không được để trống' })
  @MaxLength(255)
  address: string;

  @IsOptional()
  @IsNumber(money)
  @Min(0)
  @Max(MAX_RATE)
  defaultElectricityRate?: number;

  @IsOptional()
  @IsNumber(money)
  @Min(0)
  @Max(MAX_RATE)
  defaultWaterRate?: number;

  @IsOptional()
  @IsNumber(money)
  @Min(0)
  @Max(MAX_MONEY)
  defaultServiceFee?: number;

  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(5000)
  description?: string;
}
