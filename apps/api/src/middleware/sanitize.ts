/**
 * Input sanitization middleware — Phase 4 hardening
 *
 * Defends against:
 *  - MongoDB operator injection  ($where, $expr, $function in request body keys)
 *  - Deeply nested objects that cause ReDoS / stack overflows
 *  - Oversized string values in JSON body
 *  - Null-byte injection in strings
 */
import { Request, Response, NextFunction } from 'express';
import { ValidationError } from '@hospital-cms/errors';

const MAX_DEPTH = 10;
const MAX_STRING_LENGTH = 65_536; // 64 KB per string field
const MONGO_OPERATOR_RE = /^\$|^\0/; // $ prefix or null byte

function scanValue(value: unknown, depth: number, path: string): string | null {
  if (depth > MAX_DEPTH) {
    return `Object too deeply nested at '${path}' (max depth: ${MAX_DEPTH})`;
  }

  if (typeof value === 'string') {
    if (value.length > MAX_STRING_LENGTH) {
      return `String field '${path}' exceeds maximum length of ${MAX_STRING_LENGTH} chars`;
    }
    if (value.includes('\0')) {
      return `Null byte detected in field '${path}'`;
    }
    return null;
  }

  if (Array.isArray(value)) {
    for (let i = 0; i < value.length; i++) {
      const err = scanValue(value[i], depth + 1, `${path}[${i}]`);
      if (err) return err;
    }
    return null;
  }

  if (value !== null && typeof value === 'object') {
    for (const key of Object.keys(value as object)) {
      if (MONGO_OPERATOR_RE.test(key)) {
        return `Disallowed key '${key}' at '${path}' — MongoDB operators are not permitted in request bodies`;
      }
      const err = scanValue((value as Record<string, unknown>)[key], depth + 1, `${path}.${key}`);
      if (err) return err;
    }
    return null;
  }

  return null;
}

/**
 * Recursively scans req.body for MongoDB injection vectors, null bytes,
 * excessive nesting, and oversized string fields.
 *
 * Attach after express.json() so the body is already parsed.
 */
export function sanitizeBody(req: Request, _res: Response, next: NextFunction): void {
  if (req.body && typeof req.body === 'object') {
    const error = scanValue(req.body, 0, 'body');
    if (error) {
      return next(new ValidationError(error));
    }
  }
  next();
}

/**
 * Validates that query parameters don't contain MongoDB operator characters.
 * req.query values are always strings so we only need to check keys.
 */
export function sanitizeQuery(req: Request, _res: Response, next: NextFunction): void {
  for (const key of Object.keys(req.query)) {
    if (MONGO_OPERATOR_RE.test(key)) {
      return next(new ValidationError(`Disallowed query parameter: '${key}'`));
    }
    const val = req.query[key];
    if (typeof val === 'string' && val.includes('\0')) {
      return next(new ValidationError(`Null byte detected in query parameter '${key}'`));
    }
  }
  next();
}
