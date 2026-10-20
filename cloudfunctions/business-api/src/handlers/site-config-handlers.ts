import { SITE_CONFIG_KEYS, type SiteConfigKey, type TrustedIdentity } from '../../../../packages/contracts/src';
import { AppError, isRecord } from '../../../../packages/backend/src/errors';
import type { SiteConfigService } from '../../../../packages/backend/src/services/site-config-service';

export function validatePublicPayload(payload: unknown): Record<string, never> {
  if (!isRecord(payload) || Object.keys(payload).length !== 0) throw new AppError('INVALID_ARGUMENT', 'payload必须为空对象');
  return {};
}
export function validateSiteConfigPayload(payload: unknown): { config_key: SiteConfigKey } {
  if (!isRecord(payload) || Object.keys(payload).length !== 1 || typeof payload.config_key !== 'string' || !SITE_CONFIG_KEYS.some(key => key === payload.config_key)) throw new AppError('INVALID_ARGUMENT', 'config_key不在允许的配置列表中');
  return { config_key: payload.config_key as SiteConfigKey };
}
export class GetPublicSiteConfigHandler {
  constructor(private readonly service: SiteConfigService) {}
  async handle(): Promise<unknown> { return this.service.getPublicSiteConfig(); }
}
export class GetSiteConfigHandler {
  constructor(private readonly service: SiteConfigService) {}
  async handle(payload: { config_key: SiteConfigKey }, identity: TrustedIdentity): Promise<unknown> { return this.service.getSiteConfig(payload.config_key, identity); }
}
