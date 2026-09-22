export class AppError extends Error {
  public readonly statusCode: number;
  public readonly errorCode: string;
  public readonly errors?: Array<{ field?: string; message: string }>;

  constructor(
    statusCode: number,
    message: string,
    errorCode: string = "INTERNAL_SERVER_ERROR",
    errors?: Array<{ field?: string; message: string }>
  ) {
    super(message);
    this.name = "AppError";
    this.statusCode = statusCode;
    this.errorCode = errorCode;
    this.errors = errors;
    Object.setPrototypeOf(this, new.target.prototype);
  }

  static badRequest(message: string, errorCode = "BAD_REQUEST", errors?: Array<{ field?: string; message: string }>) {
    return new AppError(400, message, errorCode, errors);
  }

  static unauthorized(message = "Unauthorized: Active session required", errorCode = "UNAUTHORIZED") {
    return new AppError(401, message, errorCode);
  }

  static forbidden(message = "Forbidden: Insufficient permissions", errorCode = "FORBIDDEN") {
    return new AppError(403, message, errorCode);
  }

  static notFound(message = "Resource not found", errorCode = "NOT_FOUND") {
    return new AppError(404, message, errorCode);
  }

  static conflict(message: string, errorCode = "CONFLICT") {
    return new AppError(409, message, errorCode);
  }

  static gone(message = "Resource expired", errorCode = "GONE") {
    return new AppError(410, message, errorCode);
  }

  static unprocessableEntity(
    message = "Validation failed",
    errors?: Array<{ field?: string; message: string }>,
    errorCode = "VALIDATION_ERROR"
  ) {
    return new AppError(422, message, errorCode, errors);
  }

  static internal(message = "Internal server error", errorCode = "INTERNAL_SERVER_ERROR") {
    return new AppError(500, message, errorCode);
  }
}
