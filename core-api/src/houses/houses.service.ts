import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, type House } from '../generated/prisma/client.js';
import { PropertyStatus, PropertyType } from '../generated/prisma/enums.js';
import { PrismaService } from '../prisma/prisma.service.js';
import type { CreateHouseDto } from './dto/create-house.dto.js';
import type { UpdateHouseDto } from './dto/update-house.dto.js';

export interface HouseStats {
  totalProperties: number;
  roomCount: number;
  commercialCount: number;
  rentedCount: number;
  availableCount: number;
}

export interface HouseResponse
  extends Omit<
    House,
    'defaultElectricityRate' | 'defaultWaterRate' | 'defaultServiceFee'
  > {
  defaultElectricityRate: number;
  defaultWaterRate: number;
  defaultServiceFee: number;
  stats: HouseStats;
}

type HouseWithProperties = House & {
  properties: Array<{
    id: string;
    type: PropertyType;
    status: PropertyStatus;
  }>;
};

const toHouseResponse = (h: HouseWithProperties): HouseResponse => {
  const { properties, ...rest } = h;
  let roomCount = 0;
  let commercialCount = 0;
  let rentedCount = 0;
  let availableCount = 0;

  for (const p of properties) {
    if (p.type === PropertyType.COMMERCIAL_SPACE) {
      commercialCount += 1;
    } else {
      roomCount += 1;
    }
    if (p.status === PropertyStatus.RENTED) {
      rentedCount += 1;
    } else if (p.status === PropertyStatus.AVAILABLE) {
      availableCount += 1;
    }
  }

  return {
    ...rest,
    defaultElectricityRate: Number(h.defaultElectricityRate),
    defaultWaterRate: Number(h.defaultWaterRate),
    defaultServiceFee: Number(h.defaultServiceFee),
    stats: {
      totalProperties: properties.length,
      roomCount,
      commercialCount,
      rentedCount,
      availableCount,
    },
  };
};

const isPrismaError = (
  err: unknown,
  code: string,
): err is Prisma.PrismaClientKnownRequestError =>
  err instanceof Prisma.PrismaClientKnownRequestError && err.code === code;

@Injectable()
export class HousesService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(): Promise<HouseResponse[]> {
    const houses = await this.prisma.house.findMany({
      include: {
        properties: {
          select: {
            id: true,
            type: true,
            status: true,
          },
        },
      },
      orderBy: [{ code: 'asc' }, { createdAt: 'asc' }],
    });
    return houses.map(toHouseResponse);
  }

  async findOne(id: string): Promise<HouseResponse> {
    const house = await this.prisma.house.findUnique({
      where: { id },
      include: {
        properties: {
          select: {
            id: true,
            type: true,
            status: true,
          },
        },
      },
    });
    if (!house) {
      throw new NotFoundException(`Không tìm thấy tòa nhà với id ${id}`);
    }
    return toHouseResponse(house);
  }

  async create(dto: CreateHouseDto): Promise<HouseResponse> {
    try {
      const created = await this.prisma.house.create({
        data: {
          code: dto.code,
          name: dto.name,
          address: dto.address,
          ...(dto.defaultElectricityRate !== undefined && {
            defaultElectricityRate: dto.defaultElectricityRate,
          }),
          ...(dto.defaultWaterRate !== undefined && {
            defaultWaterRate: dto.defaultWaterRate,
          }),
          ...(dto.defaultServiceFee !== undefined && {
            defaultServiceFee: dto.defaultServiceFee,
          }),
          description: dto.description,
        },
        include: {
          properties: {
            select: { id: true, type: true, status: true },
          },
        },
      });
      return toHouseResponse(created);
    } catch (err) {
      if (isPrismaError(err, 'P2002')) {
        throw new ConflictException(`Mã tòa nhà "${dto.code}" đã tồn tại`);
      }
      throw err;
    }
  }

  async update(id: string, dto: UpdateHouseDto): Promise<HouseResponse> {
    const existing = await this.prisma.house.findUnique({ where: { id } });
    if (!existing) {
      throw new NotFoundException(`Không tìm thấy tòa nhà với id ${id}`);
    }

    try {
      const updated = await this.prisma.$transaction(async (tx) => {
        const house = await tx.house.update({
          where: { id },
          data: {
            ...(dto.code !== undefined && { code: dto.code }),
            ...(dto.name !== undefined && { name: dto.name }),
            ...(dto.address !== undefined && { address: dto.address }),
            ...(dto.defaultElectricityRate !== undefined && {
              defaultElectricityRate: dto.defaultElectricityRate,
            }),
            ...(dto.defaultWaterRate !== undefined && {
              defaultWaterRate: dto.defaultWaterRate,
            }),
            ...(dto.defaultServiceFee !== undefined && {
              defaultServiceFee: dto.defaultServiceFee,
            }),
            ...(dto.description !== undefined && {
              description: dto.description,
            }),
          },
          include: {
            properties: {
              select: { id: true, type: true, status: true },
            },
          },
        });

        // Đồng bộ địa chỉ sang các phòng / mặt bằng thuộc nhà nếu địa chỉ nhà thay đổi
        if (dto.address !== undefined && dto.address !== existing.address) {
          await tx.property.updateMany({
            where: { houseId: id },
            data: { address: dto.address },
          });
        }

        return house;
      });

      return toHouseResponse(updated);
    } catch (err) {
      if (isPrismaError(err, 'P2002')) {
        throw new ConflictException(`Mã tòa nhà "${dto.code}" đã tồn tại`);
      }
      throw err;
    }
  }

  async remove(id: string): Promise<void> {
    const house = await this.prisma.house.findUnique({
      where: { id },
      include: {
        _count: { select: { properties: true } },
      },
    });
    if (!house) {
      throw new NotFoundException(`Không tìm thấy tòa nhà với id ${id}`);
    }
    if (house._count.properties > 0) {
      throw new BadRequestException(
        'Không thể xóa tòa nhà đang có phòng trọ hoặc mặt bằng. Vui lòng chuyển hoặc xóa các phòng trước.',
      );
    }
    await this.prisma.house.delete({ where: { id } });
  }
}
