/** IDs and BIGINT values cross the JSON boundary as strings. Times use ISO 8601. */
export type EntityId = string;
export type IsoDateTime = string;
export const PUBLIC_CODES = ['OK', 'INVALID_ARGUMENT', 'UNAUTHORIZED', 'FORBIDDEN', 'NOT_FOUND', 'CONFLICT', 'INTERNAL_ERROR'] as const;
export type PublicCode = typeof PUBLIC_CODES[number];
export type ErrorCode = Exclude<PublicCode, 'OK'> | 'CONFIG_INVALID';
export type Response<T> =
  | { ok: true; code: 'OK'; message: string; data: T; request_id: string }
  | { ok: false; code: ErrorCode; message: string; data: null; request_id: string };

export const SITE_CONFIG_KEYS = ['home_banners', 'customer_service', 'feature_entries', 'shipping_rules', 'payment_rules', 'points_rules'] as const;
export type SiteConfigKey = typeof SITE_CONFIG_KEYS[number];
export const PUBLIC_SITE_CONFIG_KEYS = ['home_banners', 'customer_service', 'feature_entries'] as const;
export interface Banner { image_file_id: string; link_type: 'PAGE' | 'NONE'; link_value: string; sort_order: number }
export interface CustomerService { wechat_id: string; qr_file_id: string }
export interface FeatureEntry { key: string; enabled: boolean }
export interface PublicSiteConfig { banners: Banner[]; customer_service: CustomerService | null; feature_entries: FeatureEntry[] }
export interface SiteConfig { config_key: SiteConfigKey; config_value: JsonValue; updated_at: IsoDateTime | null }
export interface Admin { id: EntityId; auth_uid: string; display_name: string }
export type TrustedIdentity = { kind: 'anonymous' } | { kind: 'wechat'; openid: string } | { kind: 'web'; uid: string };
export type JsonValue = null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue };
export type JsonSafe<T> = T extends bigint | Date ? string : T extends readonly (infer U)[] ? JsonSafe<U>[] : T extends object ? { [K in keyof T]: JsonSafe<T[K]> } : T;

/** A real serialization round-trip also rejects cycles and non-JSON values. */
export function jsonSafe<T>(value: T): JsonSafe<T> {
  return JSON.parse(JSON.stringify(value, (_key, item: unknown) => typeof item === 'bigint' ? item.toString() : item)) as JsonSafe<T>;
}
