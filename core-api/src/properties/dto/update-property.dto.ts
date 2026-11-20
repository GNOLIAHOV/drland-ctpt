import { OmitType, PartialType } from '@nestjs/mapped-types';
import {
  IsISO8601,
  IsNumber,
  IsString,
  IsUUID,
  Max,
  Min,
  ValidateIf,
} from 'class-validator';
import { CreatePropertyDto, MAX_MONEY } from './create-property.dto.js';

/**
 * All fields optional. `availableFrom`, `deposit` and tenant fields are redefined so they can be cleared with
 * `null`; the "SOON_TO_BE_AVAILABLE requires availableFrom" rule is enforced in
 * the service against the merged (existing + incoming) state.
 */
export class UpdatePropertyDto extends PartialType(
  OmitType(CreatePropertyDto, [
    'houseId',
    'deposit',
    'availableFrom',
    'leaseStartDate',
    'leaseEndDate',
    'tenantName',
    'tenantPhone',
    'tenantCitizenId',
    'depositPaid',
    'rentalNotes',
  ] as const),
) {
  @ValidateIf((o: UpdatePropertyDto) => o.houseId != null)
  @IsUUID('4', { message: 'houseId phải là UUID hợp lệ hoặc null' })
  houseId?: string | null;

  @ValidateIf((o: UpdatePropertyDto) => o.deposit != null)
  @IsNumber({ maxDecimalPlaces: 2, allowNaN: false, allowInfinity: false })
  @Min(0)
  @Max(MAX_MONEY)
  deposit?: number | null;
  @ValidateIf((o: UpdatePropertyDto) => o.availableFrom != null)
  @IsISO8601(
    { strict: true, strictSeparator: true },
    { message: 'availableFrom phải là ngày hợp lệ (YYYY-MM-DD) hoặc null' },
  )
  availableFrom?: string | null;

  @ValidateIf((o: UpdatePropertyDto) => o.leaseStartDate != null)
  @IsISO8601(
    { strict: true, strictSeparator: true },
    { message: 'leaseStartDate phải là ngày hợp lệ (YYYY-MM-DD) hoặc null' },
  )
  leaseStartDate?: string | null;

  @ValidateIf((o: UpdatePropertyDto) => o.leaseEndDate != null)
  @IsISO8601(
    { strict: true, strictSeparator: true },
    { message: 'leaseEndDate phải là ngày hợp lệ (YYYY-MM-DD) hoặc null' },
  )
  leaseEndDate?: string | null;

  @ValidateIf((o: UpdatePropertyDto) => o.tenantName != null)
  @IsString()
  tenantName?: string | null;

  @ValidateIf((o: UpdatePropertyDto) => o.tenantPhone != null)
  @IsString()
  tenantPhone?: string | null;

  @ValidateIf((o: UpdatePropertyDto) => o.tenantCitizenId != null)
  @IsString()
  tenantCitizenId?: string | null;

  @ValidateIf((o: UpdatePropertyDto) => o.depositPaid != null)
  @IsNumber()
  depositPaid?: number | null;

  @ValidateIf((o: UpdatePropertyDto) => o.rentalNotes != null)
  @IsString()
  rentalNotes?: string | null;
}
