import type { ErrorCode } from '../../contracts/src';

export class AppError extends Error {
  constructor(readonly code: ErrorCode, message: string) {
    super(message);
    this.name = 'AppError';
  }
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
