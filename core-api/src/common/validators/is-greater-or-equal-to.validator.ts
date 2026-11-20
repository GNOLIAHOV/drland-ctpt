import {
  registerDecorator,
  type ValidationArguments,
  type ValidationOptions,
} from 'class-validator';

/**
 * Property must be >= another numeric property on the same object.
 * Skips the check if either side is not a number (other validators report that).
 *
 * @example
 *   @IsGreaterOrEqualTo('electricityOldIndex')
 *   electricityNewIndex: number;
 */
export function IsGreaterOrEqualTo(
  relatedProperty: string,
  options?: ValidationOptions,
): PropertyDecorator {
  return (target: object, propertyName: string | symbol) => {
    registerDecorator({
      name: 'isGreaterOrEqualTo',
      target: target.constructor,
      propertyName: propertyName as string,
      constraints: [relatedProperty],
      options: {
        message: (args: ValidationArguments) =>
          `${args.property} (${String(args.value)}) phải lớn hơn hoặc bằng ${args.constraints[0]} (${String(
            (args.object as Record<string, unknown>)[args.constraints[0]],
          )})`,
        ...options,
      },
      validator: {
        validate(value: unknown, args: ValidationArguments): boolean {
          const related = (args.object as Record<string, unknown>)[
            args.constraints[0]
          ];
          if (typeof value !== 'number' || typeof related !== 'number') {
            return true;
          }
          return value >= related;
        },
      },
    });
  };
}
