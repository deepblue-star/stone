import { PUBLIC_SITE_CONFIG_KEYS, SITE_CONFIG_KEYS, type Banner, type CustomerService, type FeatureEntry, type JsonValue, type PublicSiteConfig, type SiteConfig, type SiteConfigKey, type TrustedIdentity, type UpdateSiteConfigPayload } from '../../../contracts/src/index';
import type { SiteConfigDAO } from '../dao/index';
import { AppError, isRecord } from '../errors';
import type { AdminAccessService } from './admin-access-service';
import { selectedImages, type ImageUrlResolver } from '../catalog/images';
import { shippingRegions } from './buyer-rules';
import { integer } from '../catalog/rules';

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

export function validateUpdateSiteConfigPayload(payload: unknown): UpdateSiteConfigPayload {
  if (!isRecord(payload) || Object.keys(payload).length !== 2 || typeof payload.config_key !== 'string' || !SITE_CONFIG_KEYS.some(key => key === payload.config_key) || !('config_value' in payload) || !isJson(payload.config_value)) throw new AppError('INVALID_ARGUMENT', '配置请求字段无效');
  return { config_key: payload.config_key as SiteConfigKey, config_value: payload.config_value };
}
function exactFields(value: unknown, keys: readonly string[]): value is Record<string, unknown> {
  return isRecord(value) && Object.keys(value).length === keys.length && keys.every(key => Object.prototype.hasOwnProperty.call(value, key));
}
function invalidInput(): never { throw new AppError('INVALID_ARGUMENT', '配置结构或字段值无效'); }
function validateEditableValue(key: SiteConfigKey, value: JsonValue): void {
  try {
    if (key === 'home_banners') {
      if (!Array.isArray(value) || !value.every(row => exactFields(row, ['image_file_id', 'link_type', 'link_value', 'sort_order']))) return invalidInput();
      banners(value);
    } else if (key === 'customer_service') {
      if (value !== null && !exactFields(value, ['wechat_id', 'qr_file_id'])) return invalidInput();
      customerService(value);
    } else if (key === 'feature_entries') {
      if (!Array.isArray(value) || !value.every(row => exactFields(row, ['key', 'enabled']))) return invalidInput();
      featureEntries(value);
    } else if (key === 'shipping_rules') {
      if (!exactFields(value, ['regions']) || !Array.isArray(value.regions)) return invalidInput();
      const seen = new Set<string>();
      for (const row of value.regions) {
        if (!exactFields(row, ['province_code', 'province_name', 'shipping_fee_cent', 'sort_order', 'enabled']) || typeof row.province_code !== 'string' || !/^[1-9]\d{5}$/.test(row.province_code) || !text(row.province_name, 80) || !row.province_name.trim() || !integer(row.shipping_fee_cent) || !integer(row.sort_order, -2147483648, 2147483647) || typeof row.enabled !== 'boolean' || seen.has(row.province_code)) return invalidInput();
        seen.add(row.province_code);
      }
    } else if (key === 'payment_rules') {
      if (!exactFields(value, ['payment_timeout_minutes']) || value.payment_timeout_minutes !== 5) return invalidInput();
    } else if (key === 'points_rules') {
      if (!exactFields(value, ['daily_check_in_points', 'referral_first_completed_order_points']) || !integer(value.daily_check_in_points, 0, 4294967295) || !integer(value.referral_first_completed_order_points, 0, 4294967295)) return invalidInput();
    }
  } catch (error) {
    if (error instanceof AppError && error.code === 'CONFIG_INVALID') return invalidInput();
    throw error;
  }
}
export class SiteConfigService {
  constructor(private readonly configs: SiteConfigDAO, private readonly adminAccess: AdminAccessService, private readonly images?: ImageUrlResolver) {}

  async getShippingRegions() {
    const config = await this.configs.findByKey('shipping_rules');
    return { regions: shippingRegions(config?.config_value) };
  }

  async getPublicSiteConfig(): Promise<PublicSiteConfig> {
    const rows = await this.configs.findByKeys(PUBLIC_SITE_CONFIG_KEYS);
    const values = new Map(rows.map(row => [row.config_key, row.config_value]));
    const result: PublicSiteConfig = {
      banners: values.has('home_banners') ? banners(parseConfig(values.get('home_banners'))) : [],
      customer_service: values.has('customer_service') ? customerService(parseConfig(values.get('customer_service'))) : null,
      feature_entries: values.has('feature_entries') ? featureEntries(parseConfig(values.get('feature_entries'))) : [],
    };
    if (this.images) result.image_urls = await this.images.resolve(selectedImages([...result.banners.map(row => row.image_file_id), result.customer_service?.qr_file_id ?? null]));
    return result;
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

  async updateSiteConfig(payload: unknown, identity: TrustedIdentity): Promise<SiteConfig> {
    const admin = await this.adminAccess.requireEnabledAdmin(identity);
    const input = validateUpdateSiteConfigPayload(payload);
    validateEditableValue(input.config_key, input.config_value);
    await this.configs.upsert(input.config_key, input.config_value, admin.auth_uid);
    const row = await this.configs.findByKey(input.config_key);
    if (!row) throw new AppError('INTERNAL_ERROR', '配置保存后无法读取');
    const value = parseConfig(row.config_value);
    if (!isJson(value)) return invalidConfig();
    try { validateEditableValue(input.config_key, value); }
    catch (error) { if (error instanceof AppError && error.code === 'INVALID_ARGUMENT') return invalidConfig(); throw error; }
    return { config_key: input.config_key, config_value: value, updated_at: row.updated_at ? new Date(row.updated_at).toISOString() : null };
  }
}
