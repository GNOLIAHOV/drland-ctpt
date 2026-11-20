import { randomUUID } from 'node:crypto';
import { extname, join } from 'node:path';
import {
  BadRequestException,
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
  Query,
  Req,
  UploadedFiles,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import type { Request } from 'express';
import { diskStorage } from 'multer';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { CreatePropertyDto } from './dto/create-property.dto.js';
import { QueryPropertyDto } from './dto/query-property.dto.js';
import { UpdatePropertyDto } from './dto/update-property.dto.js';
import {
  PropertiesService,
  type PaginatedProperties,
  type PropertyResponse,
} from './properties.service.js';

export const propertyImagesStorage = diskStorage({
  destination: (req, file, cb) => {
    const dest = join(process.cwd(), 'uploads', 'properties');
    cb(null, dest);
  },
  filename: (req, file, cb) => {
    const ext = extname(file.originalname).toLowerCase() || '.jpg';
    const uniqueName = `${randomUUID()}${ext}`;
    cb(null, uniqueName);
  },
});

export const imageFileFilter = (
  req: unknown,
  file: Express.Multer.File,
  cb: (error: Error | null, acceptFile: boolean) => void,
) => {
  const allowedMimes = ['image/jpeg', 'image/png', 'image/webp'];
  if (!allowedMimes.includes(file.mimetype)) {
    return cb(
      new BadRequestException(
        'Định dạng file không hợp lệ. Chỉ chấp nhận ảnh JPG, PNG hoặc WEBP',
      ),
      false,
    );
  }
  cb(null, true);
};

/**
 * Boundaries (SPEC):
 *  - GET routes are public (tenants & AI Agent can read).
 *  - POST / PATCH / DELETE are Admin-only via JwtAuthGuard.
 *    The AI Agent must never be able to mutate rooms.
 */
@Controller('properties')
export class PropertiesController {
  constructor(private readonly properties: PropertiesService) {}

  // ───── Public ─────

  @Get()
  findAll(@Query() query: QueryPropertyDto): Promise<PaginatedProperties> {
    return this.properties.findAll(query);
  }

  @Get(':id')
  findOne(
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
  ): Promise<PropertyResponse> {
    return this.properties.findOne(id);
  }

  // ───── Admin only ─────

  @Post('upload-images')
  @UseGuards(JwtAuthGuard)
  @UseInterceptors(
    FilesInterceptor('files', 10, {
      storage: propertyImagesStorage,
      fileFilter: imageFileFilter,
      limits: {
        fileSize: 5 * 1024 * 1024, // 5MB
      },
    }),
  )
  uploadImages(
    @UploadedFiles() files: Express.Multer.File[],
    @Req() req: Request,
  ): { urls: string[] } {
    if (!files || files.length === 0) {
      throw new BadRequestException('Vui lòng chọn ít nhất một file ảnh');
    }

    const host = req.get('host') || 'localhost:3001';
    const protocol = req.protocol || 'http';
    const urls = files.map(
      (file) => `${protocol}://${host}/uploads/properties/${file.filename}`,
    );

    return { urls };
  }

  @Post()
  @UseGuards(JwtAuthGuard)
  create(@Body() dto: CreatePropertyDto): Promise<PropertyResponse> {
    return this.properties.create(dto);
  }

  @Patch(':id')
  @Put(':id')
  @UseGuards(JwtAuthGuard)
  update(
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Body() dto: UpdatePropertyDto,
  ): Promise<PropertyResponse> {
    return this.properties.update(id, dto);
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
  ): Promise<void> {
    return this.properties.remove(id);
  }
}
