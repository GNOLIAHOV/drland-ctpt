import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, type Property } from '../generated/prisma/client.js';
import { PropertyStatus } from '../generated/prisma/enums.js';
import { PrismaService } from '../prisma/prisma.service.js';
import type { CreatePropertyDto } from './dto/create-property.dto.js';
import type { QueryPropertyDto } from './dto/query-property.dto.js';
import type { UpdatePropertyDto } from './dto/update-property.dto.js';

export interface HouseSummary {
  id: string;
  code: string;
  name: string;
  address: string;
}

const houseSummarySelect = {
  select: {
    id: true,
    code: true,
    name: true,
    address: true,
  },
} as const;

type PropertyWithHouse = Property & {
  house?: HouseSummary | null;
};

/** API shape: Decimals → numbers, dates → 'YYYY-MM-DD'. */
export interface PropertyResponse
  extends Omit<
    Property,
    | 'area'
    | 'monthlyRent'
    | 'deposit'
    | 'electricityRate'
    | 'waterRate'
    | 'serviceFee'
    | 'availableFrom'
    | 'depositPaid'
    | 'leaseStartDate'
    | 'leaseEndDate'
  > {
  area: number;
  monthlyRent: number;
  deposit: number | null;
  electricityRate: number;
  waterRate: number;
  serviceFee: number;
  availableFrom: string | null;
  depositPaid: number | null;
  leaseStartDate: string | null;
  leaseEndDate: string | null;
  house: HouseSummary | null;
}

export interface PaginatedProperties {
  data: PropertyResponse[];
  meta: { page: number; limit: number; total: number; totalPages: number };
}

export const toPropertyResponse = (p: PropertyWithHouse): PropertyResponse => ({
  ...p,
  area: Number(p.area),
  monthlyRent: Number(p.monthlyRent),
  deposit: p.deposit === null ? null : Number(p.deposit),
  electricityRate: Number(p.electricityRate),
  waterRate: Number(p.waterRate),
  serviceFee: Number(p.serviceFee),
  availableFrom: p.availableFrom
    ? p.availableFrom.toISOString().slice(0, 10)
    : null,
  depositPaid: p.depositPaid === null ? null : Number(p.depositPaid),
  leaseStartDate: p.leaseStartDate
    ? p.leaseStartDate.toISOString().slice(0, 10)
    : null,
  leaseEndDate: p.leaseEndDate
    ? p.leaseEndDate.toISOString().slice(0, 10)
    : null,
  house: p.house ?? null,
});

/** 'YYYY-MM-DD' (or full ISO) → Date at UTC midnight for a DATE column. */
const toDate = (value: string): Date =>
  new Date(`${value.slice(0, 10)}T00:00:00.000Z`);

const isPrismaError = (
  err: unknown,
  code: string,
): err is Prisma.PrismaClientKnownRequestError =>
  err instanceof Prisma.PrismaClientKnownRequestError && err.code === code;

@Injectable()
export class PropertiesService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(query: QueryPropertyDto): Promise<PaginatedProperties> {
    const { houseId, status, type, minRent, maxRent, page, limit } = query;

    if (minRent !== undefined && maxRent !== undefined && minRent > maxRent) {
      throw new BadRequestException('minRent không được lớn hơn maxRent');
    }

    const where: Prisma.PropertyWhereInput = {
      houseId,
      status,
      type,
      ...(minRent !== undefined || maxRent !== undefined
        ? { monthlyRent: { gte: minRent, lte: maxRent } }
        : {}),
    };

    const [items, total] = await this.prisma.$transaction([
      this.prisma.property.findMany({
        where,
        include: { house: houseSummarySelect },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.property.count({ where }),
    ]);

    return {
      data: items.map(toPropertyResponse),
      meta: { page, limit, total, totalPages: Math.ceil(total / limit) },
    };
  }

  async findOne(id: string): Promise<PropertyResponse> {
    const property = await this.prisma.property.findUnique({
      where: { id },
      include: { house: houseSummarySelect },
    });
    if (!property) {
      throw new NotFoundException(`Không tìm thấy phòng với id ${id}`);
    }
    return toPropertyResponse(property);
  }

  async create(dto: CreatePropertyDto): Promise<PropertyResponse> {
    const { availableFrom, leaseStartDate, leaseEndDate, houseId, ...rest } = dto;
    if (houseId) {
      const houseExists = await this.prisma.house.findUnique({
        where: { id: houseId },
        select: { id: true },
      });
      if (!houseExists) {
        throw new NotFoundException(`Không tìm thấy tòa nhà với id ${houseId}`);
      }
    }
    try {
      const created = await this.prisma.property.create({
        data: {
          ...rest,
          ...(houseId !== undefined && { houseId }),
          availableFrom: availableFrom ? toDate(availableFrom) : undefined,
          leaseStartDate: leaseStartDate ? toDate(leaseStartDate) : undefined,
          leaseEndDate: leaseEndDate ? toDate(leaseEndDate) : undefined,
        },
        include: { house: houseSummarySelect },
      });
      return toPropertyResponse(created);
    } catch (err) {
      throw this.mapWriteError(err, dto.code);
    }
  }

  async update(id: string, dto: UpdatePropertyDto): Promise<PropertyResponse> {
    const existing = await this.prisma.property.findUnique({
      where: { id },
      select: { status: true, availableFrom: true },
    });
    if (!existing) {
      throw new NotFoundException(`Không tìm thấy phòng với id ${id}`);
    }

    if (dto.houseId) {
      const houseExists = await this.prisma.house.findUnique({
        where: { id: dto.houseId },
        select: { id: true },
      });
      if (!houseExists) {
        throw new NotFoundException(`Không tìm thấy tòa nhà với id ${dto.houseId}`);
      }
    }

    // Rule: "Sắp trống" must always carry an expected availability date.
    const nextStatus = dto.status ?? existing.status;
    const nextAvailableFrom =
      dto.availableFrom !== undefined
        ? dto.availableFrom
        : existing.availableFrom;
    if (
      nextStatus === PropertyStatus.SOON_TO_BE_AVAILABLE &&
      !nextAvailableFrom
    ) {
      throw new BadRequestException(
        'availableFrom là bắt buộc khi status = SOON_TO_BE_AVAILABLE',
      );
    }

    const { availableFrom, leaseStartDate, leaseEndDate, houseId, ...rest } = dto;
    try {
      const updated = await this.prisma.property.update({
        where: { id },
        data: {
          ...rest,
          ...(houseId !== undefined && { houseId }),
          ...(availableFrom !== undefined && {
            availableFrom: availableFrom === null ? null : toDate(availableFrom),
          }),
          ...(leaseStartDate !== undefined && {
            leaseStartDate:
              leaseStartDate === null ? null : toDate(leaseStartDate),
          }),
          ...(leaseEndDate !== undefined && {
            leaseEndDate: leaseEndDate === null ? null : toDate(leaseEndDate),
          }),
        },
        include: { house: houseSummarySelect },
      });
      return toPropertyResponse(updated);
    } catch (err) {
      throw this.mapWriteError(err, dto.code, id);
    }
  }

  async remove(id: string): Promise<void> {
    const property = await this.prisma.property.findUnique({
      where: { id },
      include: {
        _count: {
          select: { billings: true, bookingRequests: true },
        },
      },
    });

    if (!property) {
      throw new NotFoundException(`Không tìm thấy phòng với id ${id}`);
    }

    // Ràng buộc nghiệp vụ: Chỉ cho phép xóa phòng đang trống (AVAILABLE)
    if (property.status !== PropertyStatus.AVAILABLE) {
      throw new BadRequestException(
        `Không thể xóa phòng "${property.code}". Chỉ những phòng đang trống (AVAILABLE) mới được phép xóa. Các phòng đang ở trạng thái khác (Đang thuê, Đã cọc, Sắp trống) không được phép xóa.`,
      );
    }

    // Bảo vệ tính toàn vẹn dữ liệu: Không xóa phòng nếu đã có hóa đơn hoặc yêu cầu đặt lịch
    if (property._count.billings > 0 || property._count.bookingRequests > 0) {
      throw new ConflictException(
        'Không thể xóa phòng này vì đã có dữ liệu hóa đơn hoặc yêu cầu đặt phòng liên kết. ' +
          'Hãy chuyển trạng thái phòng sang "Bảo trì (MAINTENANCE)" hoặc "Đang cho thuê (RENTED)" để ẩn phòng thay vì xóa.',
      );
    }

    try {
      await this.prisma.property.delete({ where: { id } });
    } catch (err) {
      throw this.mapWriteError(err, undefined, id);
    }
  }

  private mapWriteError(err: unknown, code?: string, id?: string): unknown {
    if (isPrismaError(err, 'P2002')) {
      return new ConflictException(`Mã phòng "${code}" đã tồn tại`);
    }
    if (isPrismaError(err, 'P2025')) {
      return new NotFoundException(`Không tìm thấy phòng với id ${id}`);
    }
    return err;
  }
}
