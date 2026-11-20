import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  createMailTransporter,
  MAIL_TRANSPORTER,
  NotificationsService,
} from './notifications.service.js';

@Module({
  providers: [
    {
      provide: MAIL_TRANSPORTER,
      inject: [ConfigService],
      useFactory: createMailTransporter,
    },
    NotificationsService,
  ],
  exports: [NotificationsService, MAIL_TRANSPORTER],
})
export class NotificationsModule {}
