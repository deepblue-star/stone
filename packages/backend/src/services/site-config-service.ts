import { PUBLIC_SITE_CONFIG_KEYS, SITE_CONFIG_KEYS, type Banner, type CustomerService, type FeatureEntry, type JsonValue, type PublicSiteConfig, type SiteConfig, type SiteConfigKey, type TrustedIdentity } from '../../../contracts/src';
import type { SiteConfigDAO } from '../dao';
import { AppError, isRecord } from '../errors';
import type { AdminAccessService } from './admin-access-service';

function invalidConfig(): never { throw new AppError('CONFIG_INVALID', '站点配置格式错误'); }
function parseConfig(value: unknown): unknown {
  if (typeof value !== 'string') return value;
  try { return JSON.parse(value) as unknown; } catch { return invalidConfig(); }
}
function text(value: unknown, max = 512): value is string { return typeof value === 'string' && value.length <= max; }
function fileId(value: unknown): value is string { return text(value) && value.startsWith('cloud://') && value.length > 8; }
function banners(value: unknown): Banner[] {
  if (!Array.isArray(value)) return invalidConfig();
  return value.map((item: unknown): Banner => {
    if (!isRecord(item) || !fileId(item.image_file_id) || (item.link_type !== 'PAGE' && item.link_type !== 'NONE') || !text(item.link_value) || !Number.isSafeInteger(item.sort_order)) return invalidConfig();
    if (item.link_type === 'PAGE' && !item.link_value.startsWith('/pages/')) return invalidConfig();
    if (item.link_type === 'NONE' && item.link_value !== '') return invalidConfig();
    return { image_file_id: item.image_file_id, link_type: item.link_type, link_value: item.link_value, sort_order: item.sort_order as number };
  }).sort((a, b) => a.sort_order - b.sort_order);
}
function customerService(value: unknown): CustomerService | null {
  if (value === null) return null;
  if (!isRecord(value) || !text(value.wechat_id, 128) || !(value.qr_file_id === '' || fileId(value.qr_file_id))) return invalidConfig();
  return { wechat_id: value.wechat_id, qr_file_id: value.qr_file_id };
}
function featureEntries(value: unknown): FeatureEntry[] {
  if (!Array.isArray(value)) return invalidConfig();
  const seen = new Set<string>();
  return value.map((item: unknown): FeatureEntry => {
    if (!isRecord(item) || !text(item.key, 64) || !/^[A-Z][A-Z0-9_]*$/.test(item.key) || typeof item.enabled !== 'boolean' || seen.has(item.key)) return invalidConfig();
    seen.add(item.key);
    return { key: item.key, enabled: item.enabled };
  });
}
function isJson(value: unknown): value is JsonValue {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return true;
  if (typeof value === 'number') return Number.isFinite(value);
  if (Array.isArray(value)) return value.every(isJson);
  return isRecord(value) && Object.values(value).every(isJson);
}

export class SiteConfigService {
  constructor(private readonly configs: SiteConfigDAO, private readonly adminAccess: AdminAccessService) {}

  async getPublicSiteConfig(): Promise<PublicSiteConfig> {
    const rows = await this.configs.findByKeys(PUBLIC_SITE_CONFIG_KEYS);
    const values = new Map(rows.map(row => [row.config_key, row.config_value]));
    return {
      banners: values.has('home_banners') ? banners(parseConfig(values.get('home_banners'))) : [],
      customer_service: values.has('customer_service') ? customerService(parseConfig(values.get('customer_service'))) : null,
      feature_entries: values.has('feature_entries') ? featureEntries(parseConfig(values.get('feature_entries'))) : [],
    };
  }

  async getSiteConfig(key: SiteConfigKey, identity: TrustedIdentity): Promise<SiteConfig> {
    if (!SITE_CONFIG_KEYS.includes(key)) throw new AppError('INVALID_ARGUMENT', 'config_key不在允许的配置列表中');
    await this.adminAccess.requireEnabledAdmin(identity);
    const row = await this.configs.findByKey(key);
    if (!row) throw new AppError('NOT_FOUND', '站点配置不存在');
    const value = parseConfig(row.config_value);
    if (!isJson(value)) return invalidConfig();
    return { config_key: key, config_value: value, updated_at: row.updated_at ? new Date(row.updated_at).toISOString() : null };
  }
}
