export class AppError extends Error {
  public readonly statusCode: number;
  public readonly code: string;
  public readonly isOperational: boolean;
  public readonly details?: unknown;

  constructor(
    message: string,
    statusCode: number = 500,
    code: string = 'INTERNAL_ERROR',
    details?: unknown
  ) {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
    this.isOperational = true;
    this.details = details;

    Error.captureStackTrace(this, this.constructor);
  }

  static badRequest(message: string, details?: unknown) {
    return new AppError(message, 400, 'BAD_REQUEST', details);
  }

  static unauthorized(message: string = 'Unauthorized') {
    return new AppError(message, 401, 'UNAUTHORIZED');
  }

  static forbidden(message: string = 'Forbidden') {
    return new AppError(message, 403, 'FORBIDDEN');
  }

  static notFound(resource: string = 'Resource') {
    return new AppError(`${resource} not found`, 404, 'NOT_FOUND');
  }

  static conflict(message: string) {
    return new AppError(message, 409, 'CONFLICT');
  }

  static unprocessable(message: string, details?: unknown) {
    return new AppError(message, 422, 'UNPROCESSABLE_ENTITY', details);
  }

  static tooManyRequests(message: string = 'Too many requests') {
    return new AppError(message, 429, 'TOO_MANY_REQUESTS');
  }

  static internal(message: string = 'Internal server error') {
    return new AppError(message, 500, 'INTERNAL_ERROR');
  }
}
