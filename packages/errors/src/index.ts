// ERROR CLASS HIERARCHY
// All errors carry an HTTP status, machine-readable code,
// and optional operational details.

export interface ErrorDetails {
  [key: string]: unknown;
}

export abstract class AppError extends Error {
  abstract readonly statusCode: number;
  abstract readonly code: string;
  readonly isOperational: boolean = true;
  readonly details?: ErrorDetails;
  readonly timestamp: Date;

  constructor(message: string, details?: ErrorDetails) {
    super(message);
    this.name = this.constructor.name;
    if (details !== undefined) {
      this.details = details;
    }
    this.timestamp = new Date();
    Error.captureStackTrace(this, this.constructor);
  }

  toJSON() {
    return {
      name: this.name,
      code: this.code,
      message: this.message,
      details: this.details,
      statusCode: this.statusCode,
    };
  }
}

//  400 Bad Request
export class ValidationError extends AppError {
  readonly statusCode = 400;
  readonly code = "VALIDATION_ERROR";

  constructor(message: string, details?: ErrorDetails) {
    super(message, details);
  }
}

export class BadRequestError extends AppError {
  readonly statusCode = 400;
  readonly code = "BAD_REQUEST";

  constructor(message: string, details?: ErrorDetails) {
    super(message, details);
  }
}

//  401 Unauthorized
export class UnauthorizedError extends AppError {
  readonly statusCode = 401;
  readonly code = "UNAUTHORIZED";

  constructor(message = "Authentication required", details?: ErrorDetails) {
    super(message, details);
  }
}

export class InvalidCredentialsError extends AppError {
  readonly statusCode = 401;
  readonly code = "INVALID_CREDENTIALS";

  constructor(message = "Invalid username or password") {
    super(message);
  }
}

export class TokenExpiredError extends AppError {
  readonly statusCode = 401;
  readonly code = "TOKEN_EXPIRED";

  constructor(message = "Token has expired") {
    super(message);
  }
}

export class InvalidTokenError extends AppError {
  readonly statusCode = 401;
  readonly code = "INVALID_TOKEN";

  constructor(message = "Token is invalid") {
    super(message);
  }
}

//  403 Forbidden
export class ForbiddenError extends AppError {
  readonly statusCode = 403;
  readonly code = "FORBIDDEN";

  constructor(message = "Insufficient permissions", details?: ErrorDetails) {
    super(message, details);
  }
}

export class AccountLockedError extends AppError {
  readonly statusCode = 403;
  readonly code = "ACCOUNT_LOCKED";

  constructor(message = "Account is locked") {
    super(message);
  }
}

export class LicenseExpiredError extends AppError {
  readonly statusCode = 403;
  readonly code = "LICENSE_EXPIRED";

  constructor(message = "License has expired. Please renew to continue.") {
    super(message);
  }
}

export class LicenseFeatureDisabledError extends AppError {
  readonly statusCode = 403;
  readonly code = "LICENSE_FEATURE_DISABLED";

  constructor(feature: string) {
    super(`Feature '${feature}' is not enabled on your license.`);
  }
}

//  404 Not Found
export class NotFoundError extends AppError {
  readonly statusCode = 404;
  readonly code = "NOT_FOUND";

  constructor(resource: string, id?: string) {
    super(
      id ? `${resource} with id '${id}' not found` : `${resource} not found`,
    );
  }
}

//  409 Conflict
export class ConflictError extends AppError {
  readonly statusCode = 409;
  readonly code = "CONFLICT";

  constructor(message: string, details?: ErrorDetails) {
    super(message, details);
  }
}

//  410 Gone
export class GoneError extends AppError {
  readonly statusCode = 410;
  readonly code = "GONE";

  constructor(message: string) {
    super(message);
  }
}

//  422 Unprocessable
export class UnprocessableError extends AppError {
  readonly statusCode = 422;
  readonly code = "UNPROCESSABLE";

  constructor(message: string, details?: ErrorDetails) {
    super(message, details);
  }
}

//  429 Rate Limit
export class RateLimitError extends AppError {
  readonly statusCode = 429;
  readonly code = "RATE_LIMIT_EXCEEDED";

  constructor(message = "Too many requests. Please try again later.") {
    super(message);
  }
}

//  500 Internal
export class InternalError extends AppError {
  readonly statusCode = 500;
  readonly code = "INTERNAL_ERROR";
  override readonly isOperational = false;

  constructor(
    message = "An unexpected error occurred",
    details?: ErrorDetails,
  ) {
    super(message, details);
  }
}

//  503 Service Unavailable
export class ServiceUnavailableError extends AppError {
  readonly statusCode = 503;
  readonly code = "SERVICE_UNAVAILABLE";

  constructor(service: string) {
    super(
      `Service '${service}' is currently unavailable. Please try again later.`,
    );
  }
}

//  Domain Errors
export class WorkflowTransitionError extends AppError {
  readonly statusCode = 422;
  readonly code = "WORKFLOW_TRANSITION_ERROR";

  constructor(message: string, details?: ErrorDetails) {
    super(message, details);
  }
}

export class PluginSignatureError extends AppError {
  readonly statusCode = 422;
  readonly code = "PLUGIN_SIGNATURE_INVALID";

  constructor(pluginId: string) {
    super(`Plugin '${pluginId}' has an invalid or untrusted signature.`);
  }
}

export class CommandSignatureError extends AppError {
  readonly statusCode = 422;
  readonly code = "COMMAND_SIGNATURE_INVALID";

  constructor() {
    super("Command signature verification failed.");
  }
}

export class CommandReplayError extends AppError {
  readonly statusCode = 422;
  readonly code = "COMMAND_REPLAY_DETECTED";

  constructor() {
    super("Command replay detected. This command has already been executed.");
  }
}

export class CommandExpiredError extends AppError {
  readonly statusCode = 422;
  readonly code = "COMMAND_EXPIRED";

  constructor() {
    super("Command has expired and cannot be executed.");
  }
}

export class InstallerAlreadyCompleteError extends AppError {
  readonly statusCode = 409;
  readonly code = "INSTALLER_ALREADY_COMPLETE";

  constructor() {
    super("Installation has already been completed.");
  }
}

export class DatabaseError extends AppError {
  readonly statusCode = 503;
  readonly code = "DATABASE_ERROR";
  override readonly isOperational = false;

  constructor(message: string, details?: ErrorDetails) {
    super(message, details);
  }
}

//  Type Guard
export function isAppError(err: unknown): err is AppError {
  return err instanceof AppError;
}

export function isOperationalError(err: unknown): boolean {
  return isAppError(err) && err.isOperational;
}
