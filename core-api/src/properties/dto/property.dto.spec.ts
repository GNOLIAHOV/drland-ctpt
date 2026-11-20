import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CreatePropertyDto } from './create-property.dto.js';
import { QueryPropertyDto } from './query-property.dto.js';
import { UpdatePropertyDto } from './update-property.dto.js';

const valid = {
  code: 'p101',
  name: '  Phòng 101  ',
  address: '1 Lê Lợi, Q1',
  area: 20.5,
  monthlyRent: 3_000_000,
  electricityRate: 3500,
  waterRate: 15000,
};

async function errorsFor<T extends object>(
  cls: new () => T,
  body: Record<string, unknown>,
): Promise<string[]> {
  const errors = await validate(plainToInstance(cls, body), {
    whitelist: true,
    forbidNonWhitelisted: true,
  });
  return errors.map((e) => e.property);
}

describe('CreatePropertyDto', () => {
  it('accepts a valid payload and normalises code/name', async () => {
    const dto = plainToInstance(CreatePropertyDto, valid);
    expect(await validate(dto)).toHaveLength(0);
    expect(dto.code).toBe('P101');
    expect(dto.name).toBe('Phòng 101');
  });

  it('requires all mandatory fields', async () => {
    const props = await errorsFor(CreatePropertyDto, {});
    expect(props).toEqual(
      expect.arrayContaining([
        'code',
        'name',
        'address',
        'area',
        'monthlyRent',
        'electricityRate',
        'waterRate',
      ]),
    );
  });

  it.each([
    ['status', 'EMPTY'],
    ['type', 'HOUSE'],
  ])('rejects invalid enum %s=%s', async (field, value) => {
    expect(
      await errorsFor(CreatePropertyDto, { ...valid, [field]: value }),
    ).toContain(field);
  });

  it.each([
    ['monthlyRent', -1],
    ['monthlyRent', '3000000'], // strings are not numbers
    ['monthlyRent', 1.234], // > 2 decimals
    ['monthlyRent', 1e13], // exceeds Decimal(14,2)
    ['area', 0],
    ['electricityRate', 1e9], // exceeds Decimal(10,2)
    ['deposit', -5],
  ])('rejects invalid number %s=%s', async (field, value) => {
    expect(
      await errorsFor(CreatePropertyDto, { ...valid, [field]: value }),
    ).toContain(field);
  });

  it('rejects malformed code', async () => {
    expect(
      await errorsFor(CreatePropertyDto, { ...valid, code: 'P 101!' }),
    ).toContain('code');
  });

  it('requires availableFrom when status = SOON_TO_BE_AVAILABLE', async () => {
    expect(
      await errorsFor(CreatePropertyDto, {
        ...valid,
        status: 'SOON_TO_BE_AVAILABLE',
      }),
    ).toContain('availableFrom');

    expect(
      await errorsFor(CreatePropertyDto, {
        ...valid,
        status: 'SOON_TO_BE_AVAILABLE',
        availableFrom: '2026-11-15',
      }),
    ).toHaveLength(0);
  });

  it('rejects invalid dates', async () => {
    expect(
      await errorsFor(CreatePropertyDto, { ...valid, availableFrom: '2026-02-30' }),
    ).toContain('availableFrom');
  });

  it('allows null availableFrom when status is AVAILABLE', async () => {
    expect(
      await errorsFor(CreatePropertyDto, {
        ...valid,
        status: 'AVAILABLE',
        availableFrom: null,
      }),
    ).toHaveLength(0);
  });

  it('rejects non-URL images and unknown fields', async () => {
    const props = await errorsFor(CreatePropertyDto, {
      ...valid,
      images: ['not-a-url'],
      hacker: true,
    });
    expect(props).toEqual(expect.arrayContaining(['images', 'hacker']));
  });
});

describe('UpdatePropertyDto', () => {
  it('accepts an empty/partial payload', async () => {
    expect(await errorsFor(UpdatePropertyDto, {})).toHaveLength(0);
    expect(
      await errorsFor(UpdatePropertyDto, { status: 'RENTED' }),
    ).toHaveLength(0);
  });

  it('allows null to clear availableFrom and deposit', async () => {
    expect(
      await errorsFor(UpdatePropertyDto, { availableFrom: null, deposit: null }),
    ).toHaveLength(0);
  });

  it('still validates enums and numbers', async () => {
    const props = await errorsFor(UpdatePropertyDto, {
      status: 'BOGUS',
      monthlyRent: -1,
      deposit: -10,
    });
    expect(props).toEqual(
      expect.arrayContaining(['status', 'monthlyRent', 'deposit']),
    );
  });
});

describe('QueryPropertyDto', () => {
  it('coerces query strings and applies defaults', async () => {
    const dto = plainToInstance(QueryPropertyDto, { minRent: '1000' });
    expect(await validate(dto)).toHaveLength(0);
    expect(dto.minRent).toBe(1000);
    expect(dto.page).toBe(1);
    expect(dto.limit).toBe(20);
  });

  it('caps limit at 100', async () => {
    expect(await errorsFor(QueryPropertyDto, { limit: '500' })).toContain(
      'limit',
    );
  });
});
