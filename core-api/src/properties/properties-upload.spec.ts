import { BadRequestException } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import { imageFileFilter } from './properties.controller.js';

describe('Properties Upload Filter', () => {
  it('accepts valid image MIME types (jpeg, png, webp)', () => {
    const validMimes = ['image/jpeg', 'image/png', 'image/webp'];

    for (const mime of validMimes) {
      let accepted = false;
      let caughtError: Error | null = null;

      imageFileFilter(
        {},
        { mimetype: mime } as Express.Multer.File,
        (err, accept) => {
          caughtError = err;
          accepted = accept;
        },
      );

      expect(caughtError).toBeNull();
      expect(accepted).toBe(true);
    }
  });

  it('rejects invalid MIME types (text, pdf, exe) with BadRequestException', () => {
    const invalidMimes = ['text/plain', 'application/pdf', 'application/octet-stream'];

    for (const mime of invalidMimes) {
      let accepted = true;
      let caughtError: Error | null = null;

      imageFileFilter(
        {},
        { mimetype: mime } as Express.Multer.File,
        (err, accept) => {
          caughtError = err;
          accepted = accept;
        },
      );

      expect(caughtError).toBeInstanceOf(BadRequestException);
      expect(accepted).toBe(false);
    }
  });
});
