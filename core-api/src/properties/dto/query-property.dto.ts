import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsNumber, IsOptional, IsUUID, Max, Min } from 'class-validator';
import { PropertyStatus, PropertyType } from '../../generated/prisma/enums.js';
import { MAX_MONEY } from './create-property.dto.js';

export class QueryPropertyDto {
  @IsOptional()
  @IsUUID('4')
  houseId?: string;

  @IsOptional()
  @IsEnum(PropertyStatus)
  status?: PropertyStatus;

  @IsOptional()
  @IsEnum(PropertyType)
  type?: PropertyType;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(MAX_MONEY)
  minRent?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(MAX_MONEY)
  maxRent?: number;

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
