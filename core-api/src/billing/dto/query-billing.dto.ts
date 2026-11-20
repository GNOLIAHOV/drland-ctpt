import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, IsUUID, Max, Min } from 'class-validator';
import { BillingStatus } from '../../generated/prisma/enums.js';
import { MAX_PERIOD_YEAR, MIN_PERIOD_YEAR } from './create-billing.dto.js';

export class QueryBillingDto {
  @IsOptional()
  @IsUUID('4')
  houseId?: string;

  @IsOptional()
  @IsUUID('4')
  propertyId?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(12)
  periodMonth?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(MIN_PERIOD_YEAR)
  @Max(MAX_PERIOD_YEAR)
  periodYear?: number;

  @IsOptional()
  @IsEnum(BillingStatus)
  status?: BillingStatus;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit: number = 20;
}
