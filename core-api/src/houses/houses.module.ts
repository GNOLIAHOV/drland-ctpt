import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { HousesController } from './houses.controller.js';
import { HousesService } from './houses.service.js';

@Module({
  imports: [AuthModule],
  controllers: [HousesController],
  providers: [HousesService],
  exports: [HousesService],
})
export class HousesModule {}
