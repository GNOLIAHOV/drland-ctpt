import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, type Billing } from '../generated/prisma/client.js';
import { BillingStatus } from '../generated/prisma/enums.js';
import { PrismaService } from '../prisma/prisma.service.js';
import {
  BillingCalculationError,
  calculateBilling,
} from './billing.calculator.js';
import type { CreateBillingDto } from './dto/create-billing.dto.js';
import type { QueryBillingDto } from './dto/query-billing.dto.js';

const propertySummary = {
  select: {
    id: true,
    code: true,
    name: true,
    type: true,
    address: true,
    houseId: true,
    house: {
      select: {
        id: true,
        code: true,
        name: true,
        address: true,
      },
    },
    tenantName: true,
    tenantPhone: true,
  },
} as const;

type BillingWithProperty = Billing & {
  property: {
    id: string;
    code: string;
    name: string;
    type: string;
    address: string;
    houseId: string | null;
    house: {
      id: string;
      code: string;
      name: string;
      address: string;
    } | null;
    tenantName: string | null;
    tenantPhone: string | null;
  };
};

export interface BillingResponse {
  id: string;
  property: {
    id: string;
    code: string;
    name: string;
    type: string;
    address: string;
    houseId: string | null;
    house: {
      id: string;
      code: string;
      name: string;
      address: string;
    } | null;
    tenantName: string | null;
    tenantPhone: string | null;
  };
  periodMonth: number;
  periodYear: number;
  electricity: { oldIndex: number; newIndex: number; usage: number; rate: number; amount: number };
  water: { oldIndex: number; newIndex: number; usage: number; rate: number; amount: number };
  rentAmount: number;
  serviceFee: number;
  adjustmentAmount: number;
  adjustmentNote: string | null;
  totalAmount: number;
  status: Billing['status'];
  paidAt: Date | null;
  note: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface PaginatedBillings {
  data: BillingResponse[];
  meta: { page: number; limit: number; total: number; totalPages: number };
}

export const toBillingResponse = (b: BillingWithProperty): BillingResponse => ({
  id: b.id,
  property: b.property,
  periodMonth: b.periodMonth,
  periodYear: b.periodYear,
  electricity: {
    oldIndex: b.electricityStart,
    newIndex: b.electricityEnd,
    usage: b.electricityEnd - b.electricityStart,
    rate: Number(b.electricityRate),
    amount: Number(b.electricityAmount),
  },
  water: {
    oldIndex: b.waterStart,
    newIndex: b.waterEnd,
    usage: b.waterEnd - b.waterStart,
    rate: Number(b.waterRate),
    amount: Number(b.waterAmount),
  },
  rentAmount: Number(b.rentAmount),
  serviceFee: Number(b.serviceFee),
  adjustmentAmount: Number(b.adjustmentAmount ?? 0),
  adjustmentNote: b.adjustmentNote ?? null,
  totalAmount: Number(b.totalAmount),
  status: b.status,
  paidAt: b.paidAt,
  note: b.note,
  createdAt: b.createdAt,
  updatedAt: b.updatedAt,
});

const isPrismaError = (err: unknown, code: string): boolean =>
  err instanceof Prisma.PrismaClientKnownRequestError && err.code === code;

const period = (m: number, y: number) => `${String(m).padStart(2, '0')}/${y}`;

@Injectable()
export class BillingService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateBillingDto): Promise<BillingResponse> {
    const property = await this.prisma.property.findUnique({
      where: { id: dto.propertyId },
      select: {
        code: true,
        monthlyRent: true,
        electricityRate: true,
        waterRate: true,
        serviceFee: true,
      },
    });
    if (!property) {
      throw new NotFoundException(`Không tìm thấy phòng với id ${dto.propertyId}`);
    }

    // Snapshot current prices from the property, then compute.
    let calc;
    try {
      calc = calculateBilling({
        electricity: { oldIndex: dto.electricityOldIndex, newIndex: dto.electricityNewIndex },
        water: { oldIndex: dto.waterOldIndex, newIndex: dto.waterNewIndex },
        electricityRate: property.electricityRate,
        waterRate: property.waterRate,
        rentAmount: property.monthlyRent,
        serviceFee: property.serviceFee,
        adjustmentAmount: dto.adjustmentAmount ?? 0,
      });
    } catch (err) {
      if (err instanceof BillingCalculationError) {
        throw new BadRequestException(err.message);
      }
      throw err;
    }

    try {
      const created = await this.prisma.billing.create({
        data: {
          propertyId: dto.propertyId,
          periodMonth: dto.periodMonth,
          periodYear: dto.periodYear,
          electricityStart: dto.electricityOldIndex,
          electricityEnd: dto.electricityNewIndex,
          waterStart: dto.waterOldIndex,
          waterEnd: dto.waterNewIndex,
          electricityRate: calc.electricityRate,
          waterRate: calc.waterRate,
          rentAmount: calc.rentAmount,
          electricityAmount: calc.electricityAmount,
          waterAmount: calc.waterAmount,
          serviceFee: calc.serviceFee,
          adjustmentAmount: calc.adjustmentAmount,
          adjustmentNote: dto.adjustmentNote?.trim() || null,
          totalAmount: calc.totalAmount,
          note: dto.note,
        },
        include: { property: propertySummary },
      });
      return toBillingResponse(created);
    } catch (err) {
      if (isPrismaError(err, 'P2002')) {
        throw new ConflictException(
          `Phòng ${property.code} đã có hóa đơn kỳ ${period(dto.periodMonth, dto.periodYear)}`,
        );
      }
      if (isPrismaError(err, 'P2003')) {
        // Property was deleted between lookup and insert.
        throw new NotFoundException(`Không tìm thấy phòng với id ${dto.propertyId}`);
      }
      throw err;
    }
  }

  async findAll(query: QueryBillingDto): Promise<PaginatedBillings> {
    const { houseId, propertyId, periodMonth, periodYear, status, page, limit } = query;
    const where: Prisma.BillingWhereInput = {
      propertyId,
      periodMonth,
      periodYear,
      status,
      ...(houseId ? { property: { houseId } } : {}),
    };

    const [items, total] = await this.prisma.$transaction([
      this.prisma.billing.findMany({
        where,
        include: { property: propertySummary },
        orderBy: [{ periodYear: 'desc' }, { periodMonth: 'desc' }, { createdAt: 'desc' }],
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.billing.count({ where }),
    ]);

    return {
      data: items.map(toBillingResponse),
      meta: { page, limit, total, totalPages: Math.ceil(total / limit) },
    };
  }

  async findOne(id: string): Promise<BillingResponse> {
    const billing = await this.prisma.billing.findUnique({
      where: { id },
      include: { property: propertySummary },
    });
    if (!billing) {
      throw new NotFoundException(`Không tìm thấy hóa đơn với id ${id}`);
    }
    return toBillingResponse(billing);
  }

  async markAsPaid(id: string): Promise<BillingResponse> {
    const existing = await this.prisma.billing.findUnique({
      where: { id },
      select: { id: true, status: true },
    });
    if (!existing) {
      throw new NotFoundException(`Không tìm thấy hóa đơn với id ${id}`);
    }
    if (existing.status === BillingStatus.PAID) {
      throw new ConflictException('Hóa đơn này đã được thanh toán trước đó');
    }

    const updated = await this.prisma.billing.update({
      where: { id },
      data: {
        status: BillingStatus.PAID,
        paidAt: new Date(),
      },
      include: { property: propertySummary },
    });
    return toBillingResponse(updated);
  }

  async remove(id: string): Promise<{ success: boolean; message: string }> {
    const existing = await this.prisma.billing.findUnique({
      where: { id },
      include: { property: { select: { code: true } } },
    });
    if (!existing) {
      throw new NotFoundException(`Không tìm thấy hóa đơn với id ${id}`);
    }

    await this.prisma.billing.delete({ where: { id } });
    return {
      success: true,
      message: `Đã xóa hóa đơn kỳ ${period(existing.periodMonth, existing.periodYear)} của phòng ${existing.property.code}`,
    };
  }
}
