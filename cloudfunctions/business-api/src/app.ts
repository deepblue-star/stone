import { randomUUID } from 'node:crypto';
import { jsonSafe, type ErrorCode, type Response, type TrustedIdentity } from '../../../packages/contracts/src';
import { AppError, isRecord } from '../../../packages/backend/src/errors';
import type { SiteConfigService } from '../../../packages/backend/src/services/site-config-service';
import { createActionRegistry, type RegisteredAction } from './action-registry';
import type { CatalogServices } from './catalog-registry';

export interface RequestLog { action: string; requestId: string; code: 'OK' | ErrorCode; durationMs: number }
export interface BusinessApiDependencies {
  siteConfigService: SiteConfigService;
  catalogServices?: CatalogServices;
  actionRegistry?: ReadonlyMap<string, RegisteredAction>;
  resolveIdentity(context?: unknown): Promise<TrustedIdentity>;
  log(entry: RequestLog): void;
}
function requestId(context: unknown): string {
  if (!isRecord(context)) return randomUUID();
  const value = context.request_id ?? context.requestId;
  return typeof value === 'string' && /^[A-Za-z0-9_-]{1,128}$/.test(value) ? value : randomUUID();
}
export function createBusinessApi(dependencies: BusinessApiDependencies) {
  const registry = dependencies.actionRegistry ?? createActionRegistry(dependencies.siteConfigService, dependencies.catalogServices);
  return async (event: unknown, context: unknown): Promise<Response<unknown>> => {
    const start = Date.now();
    const id = requestId(context);
    let action = '<unknown>';
    let response: Response<unknown>;
    try {
      if (!isRecord(event) || typeof event.action !== 'string') throw new AppError('INVALID_ARGUMENT', 'action无效');
      const handler = registry.get(event.action);
      if (!handler) throw new AppError('INVALID_ARGUMENT', 'action无效');
      action = event.action;
      const payload = handler.validate(event.payload);
      const result = await handler.run(payload, () => dependencies.resolveIdentity(context));
      response = { ok: true, code: 'OK', message: '', data: jsonSafe(result), request_id: id };
    } catch (error) {
      response = { ok: false, code: error instanceof AppError ? error.code : 'INTERNAL_ERROR', message: error instanceof AppError ? error.message : '系统暂时不可用', data: null, request_id: id };
    }
    dependencies.log({ action, requestId: id, code: response.code, durationMs: Math.max(0, Date.now() - start) });
    return response;
  };
}
