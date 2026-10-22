import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import type { DeactivationOperation, SpecSchema, SpecValues } from '../../../contracts/src/catalog';
import { AppError, isRecord } from '../errors';
export function invalid(message = '目录参数无效'): never { throw new AppError('INVALID_ARGUMENT', message); }
export function id(value: unknown): value is string { return typeof value === 'string' && /^\d{1,20}$/.test(value) && BigInt(value) > 0n && BigInt(value) <= 18446744073709551615n; }
function text(value: unknown, max: number, empty = false): value is string { return typeof value === 'string' && value.length <= max && (empty || value.trim().length > 0); }
export function integer(value: unknown, min = 0, max = Number.MAX_SAFE_INTEGER): value is number { return typeof value === 'number' && Number.isSafeInteger(value) && value >= min && value <= max; }
export function fileId(value: unknown): value is string { return typeof value === 'string' && /^cloud:\/\/[^\s?#]+$/.test(value) && value.length > 8 && value.length <= 512; }
export function safeNumber(value: unknown): number {
  if (typeof value !== 'number' && typeof value !== 'string' && typeof value !== 'bigint') throw new AppError('INVALID_CATALOG_DATA', '目录数值无效');
  const n = Number(value);
  if (!Number.isSafeInteger(n) || n < 0) throw new AppError('INVALID_CATALOG_DATA', '目录数值超出安全范围');
  return n;
}
export function json(value: unknown): unknown { if (typeof value !== 'string') return value; try { return JSON.parse(value) as unknown; } catch { throw new AppError('INVALID_CATALOG_DATA', '目录JSON无效'); } }
export function iso(value: Date | string): string { return (value instanceof Date ? value : new Date(/[zZ]|[+-]\d\d:\d\d$/.test(value) ? value : `${value.replace(' ', 'T')}Z`)).toISOString(); }
export function schema(value: unknown): SpecSchema {
  const parsed = json(value);
  if (!isRecord(parsed) || Object.keys(parsed).length !== 1 || !Array.isArray(parsed.dimensions) || parsed.dimensions.length > 12) return invalid('规格结构无效');
  const keys = new Set<string>();
  const dimensions = parsed.dimensions.map((dimension: unknown) => {
    if (!isRecord(dimension) || Object.keys(dimension).length !== 3 || !text(dimension.key, 64) || !/^[A-Za-z][A-Za-z0-9_]*$/.test(dimension.key) || !text(dimension.label, 80) || !Array.isArray(dimension.options) || dimension.options.length === 0 || dimension.options.length > 100 || keys.has(dimension.key)) return invalid('规格维度无效');
    keys.add(dimension.key);
    const seen = new Set<string>();
    const options = dimension.options.map((option: unknown) => {
      if (!isRecord(option) || Object.keys(option).length !== 2 || !text(option.value, 80) || !text(option.label, 80) || seen.has(option.value)) return invalid('规格选项无效');
      seen.add(option.value);
      return { value: option.value, label: option.label };
    });
    return { key: dimension.key, label: dimension.label, options };
  });
  return { dimensions };
}
export function normalizeSpec(rawSchema: unknown, rawValues: unknown): { values: SpecValues; signature: string } {
  const definition = schema(rawSchema);
  const values = json(rawValues);
  if (!isRecord(values) || Object.keys(values).length !== definition.dimensions.length) throw new AppError('SPEC_SCHEMA_MISMATCH', 'SKU规格与商品不符');
  const normalized: SpecValues = {};
  for (const dimension of definition.dimensions) {
    const value = values[dimension.key];
    if (typeof value !== 'string' || !dimension.options.some(option => option.value === value)) throw new AppError('SPEC_SCHEMA_MISMATCH', 'SKU规格与商品不符');
    normalized[dimension.key] = value;
  }
  return { values: normalized, signature: createHash('sha256').update(JSON.stringify(normalized)).digest('hex') };
}
export interface RefundableCoupon { coupon_id: string; account_id: string; points_cost_snapshot: number }
export const compareId = (a: string, b: string): number => BigInt(a) < BigInt(b) ? -1 : BigInt(a) > BigInt(b) ? 1 : 0;
export function deactivationHash(skuId: string, operation: DeactivationOperation, reserved: number, coupons: readonly RefundableCoupon[]): string {
  const refundable_coupons = [...coupons].sort((a, b) => compareId(a.coupon_id, b.coupon_id)).map(c => ({ coupon_id: c.coupon_id, account_id: c.account_id, points_cost_snapshot: c.points_cost_snapshot }));
  return createHash('sha256').update(JSON.stringify({ sku_id: skuId, operation, stock_reserved: reserved, refundable_coupons })).digest('hex');
}
export function inventoryTotal(total: number, reserved: number, delta: number): number {
  const next = total + delta;
  if (!integer(delta, -2147483648, 2147483647) || delta === 0 || !integer(next, reserved, 4294967295)) throw new AppError('CONFLICT', '调整后库存不能小于预占数量或超出范围');
  return next;
}
export interface Cursor { id: string; sort?: number; time?: string }
export class PageTokens {
  constructor(private readonly secret: string | (() => string)) { if (typeof secret === 'string' && secret.length < 32) throw new Error('Catalog page token secret must contain at least 32 characters'); }
  private key(): string { const value = typeof this.secret === 'function' ? this.secret() : this.secret; if (value.length < 32) throw new Error('Catalog page token secret must contain at least 32 characters'); return value; }
  encode(scope: string, cursor: Cursor): string {
    const body = Buffer.from(JSON.stringify({ scope, cursor })).toString('base64url');
    return `${body}.${createHmac('sha256', this.key()).update(body).digest('base64url')}`;
  }
  decode(token: string | null, scope: string): Cursor | null {
    if (token === null) return null;
    try {
      const parts = token.split('.');
      if (parts.length !== 2 || !parts[0] || !parts[1]) return invalid('分页标识无效');
      const signature = createHmac('sha256', this.key()).update(parts[0]).digest();
      const supplied = Buffer.from(parts[1], 'base64url');
      if (supplied.toString('base64url') !== parts[1] || supplied.length !== signature.length || !timingSafeEqual(signature, supplied)) return invalid('分页标识无效');
      const value: unknown = JSON.parse(Buffer.from(parts[0], 'base64url').toString());
      if (!isRecord(value) || value.scope !== scope || !isRecord(value.cursor) || !id(value.cursor.id) || (value.cursor.sort !== undefined && !integer(value.cursor.sort, -2147483648, 2147483647)) || (value.cursor.time !== undefined && typeof value.cursor.time !== 'string')) return invalid('分页标识无效');
      return value.cursor as unknown as Cursor;
    } catch { return invalid('分页标识无效'); }
  }
}
const fields: Record<string, readonly string[]> = {
  listAdminCategories: ['catalog_type', 'page_token', 'page_size'], listAdminItems: ['category_id', 'name_keyword', 'is_on_sale', 'page_token', 'page_size'], getAdminCatalogItem: ['item_id'],
  saveCategory: ['category_id', 'catalog_type', 'name', 'sort_order', 'is_enabled'], saveCatalogItem: ['item_id', 'category_id', 'name', 'description', 'images', 'spec_schema', 'is_on_sale'],
  saveCatalogSku: ['sku_id', 'item_id', 'spec_values', 'diameter_mm', 'image_file_id', 'price_cent', 'is_on_sale', 'points_exchange_enabled', 'points_cost', 'deactivation_impact_hash'],
  previewSkuDeactivation: ['sku_id', 'operation'], deleteCategory: ['category_id'], deleteCatalogItem: ['item_id'], deleteCatalogSku: ['sku_id', 'impact_hash'],
  adjustInventory: ['operation_key', 'sku_id', 'stock_delta', 'remark'], listInventoryMovements: ['sku_id', 'page_token', 'page_size'], listStandardCategories: [], listStandardItems: ['category_id', 'page_token', 'page_size'], getStandardItemDetail: ['item_id'], listDiyMaterials: ['catalog_type', 'category_id'],
};
export function validateCatalogPayload(action: string, payload: unknown): Record<string, unknown> {
  const required = fields[action];
  const allowed = action === 'listStandardItems' ? [...(required ?? []), 'name_keyword'] : required;
  if (!allowed || !isRecord(payload)) return invalid();
  const value = action === 'listDiyMaterials' && payload.category_id === undefined ? { ...payload, category_id: null } : payload;
  if (!required || required.some(key => !(key in value)) || Object.keys(value).some(key => !allowed.includes(key))) return invalid('必须完整提交所有字段');
  for (const [key, field] of Object.entries(value)) {
    if (key.endsWith('_id') && key !== 'image_file_id') {
      const nullable = (action === 'saveCatalogSku' && key === 'sku_id') || (action === 'saveCatalogItem' && key === 'item_id') || (action === 'saveCategory' && key === 'category_id') || action === 'listAdminItems' || action === 'listDiyMaterials' || action === 'listStandardItems';
      if (!(id(field) || (nullable && field === null))) return invalid(`${key}无效`);
    } else if (key === 'catalog_type') { if (!((typeof field === 'string' && ['BEAD', 'ACCESSORY', 'STANDARD'].includes(field)) || (action === 'listAdminCategories' && field === null)) || (action === 'listDiyMaterials' && field !== 'BEAD' && field !== 'ACCESSORY')) return invalid(); }
    else if (key === 'page_size') { if (!integer(field, 1, 100)) return invalid(); }
    else if (key === 'page_token') { if (!(field === null || text(field, 2048))) return invalid(); }
    else if (key === 'name') { if (!text(field, action === 'saveCategory' ? 80 : 160)) return invalid(); }
    else if (key === 'name_keyword') { if (!(field === null || text(field, 160, true))) return invalid(); }
    else if (key === 'description') { if (!(field === null || text(field, 20000, true))) return invalid(); }
    else if (key === 'sort_order') { if (!integer(field, -2147483648, 2147483647)) return invalid(); }
    else if (['is_enabled', 'is_on_sale', 'points_exchange_enabled'].includes(key)) { if (!(typeof field === 'boolean' || (action === 'listAdminItems' && field === null))) return invalid(); }
    else if (key === 'images') { if (!Array.isArray(field) || field.length > 20 || !field.every(fileId)) return invalid(); }
    else if (key === 'image_file_id') { if (!(field === null || fileId(field))) return invalid(); }
    else if (key === 'spec_schema') { if (field !== null) schema(field); }
    else if (key === 'spec_values') { if (!(field === null || (isRecord(field) && Object.keys(field).length <= 12 && Object.entries(field).every(([k, v]) => text(k, 64) && text(v, 80))))) return invalid(); }
    else if (key === 'diameter_mm') { if (!(field === null || (typeof field === 'number' && Number.isFinite(field) && field > 0 && field <= 99999.99 && Math.abs(field * 100 - Math.round(field * 100)) < 1e-6))) return invalid(); }
    else if (key === 'price_cent') { if (!integer(field)) return invalid(); }
    else if (key === 'points_cost') { if (!(field === null || integer(field, 1, 4294967295))) return invalid(); }
    else if (key === 'deactivation_impact_hash' || key === 'impact_hash') { if (!(typeof field === 'string' && /^[a-f0-9]{64}$/.test(field)) && !(key === 'deactivation_impact_hash' && field === null)) return invalid(); }
    else if (key === 'operation') { if (field !== 'OFF_SALE' && field !== 'DELETE') return invalid(); }
    else if (key === 'operation_key') { if (typeof field !== 'string' || !/^[A-Za-z0-9_-]{1,61}$/.test(field)) return invalid(); }
    else if (key === 'stock_delta') { if (!integer(field, -2147483648, 2147483647) || field === 0) return invalid(); }
    else if (key === 'remark') { if (!text(field, 255)) return invalid(); }
  }
  if (action === 'saveCatalogSku' && ((value.points_exchange_enabled === true && value.points_cost === null) || (value.points_exchange_enabled === false && value.points_cost !== null))) return invalid('积分配置无效');
  return value;
}
