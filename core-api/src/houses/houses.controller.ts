import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { CreateHouseDto } from './dto/create-house.dto.js';
import { UpdateHouseDto } from './dto/update-house.dto.js';
import { HousesService, type HouseResponse } from './houses.service.js';

@Controller('houses')
export class HousesController {
  constructor(private readonly houses: HousesService) {}

  @Get()
  findAll(): Promise<HouseResponse[]> {
    return this.houses.findAll();
  }

  @Get(':id')
  findOne(
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
  ): Promise<HouseResponse> {
    return this.houses.findOne(id);
  }

  @Post()
  @UseGuards(JwtAuthGuard)
  create(@Body() dto: CreateHouseDto): Promise<HouseResponse> {
    return this.houses.create(dto);
  }

  @Patch(':id')
  @Put(':id')
  @UseGuards(JwtAuthGuard)
  update(
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Body() dto: UpdateHouseDto,
  ): Promise<HouseResponse> {
    return this.houses.update(id, dto);
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
  ): Promise<void> {
    return this.houses.remove(id);
  }
}
