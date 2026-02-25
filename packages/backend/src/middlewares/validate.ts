import { Request, Response, NextFunction, RequestHandler } from 'express';
import { ZodSchema } from 'zod';

type ValidateTarget = 'body' | 'query' | 'params';

export const validate = <T>(
  schema: ZodSchema<T>,
  target: ValidateTarget = 'body'
): RequestHandler => {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const data = req[target];
    const result = schema.safeParse(data);

    if (!result.success) {
      next(result.error);
      return;
    }

    // Replace with parsed/transformed data
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (req as any)[target] = result.data;
    next();
  };
};
