import type { DesignComponent, MaterialSnapshot, ShippingRegion } from '../../../contracts/src/index';
import type { DaoSet, CategoryRow, ItemRow, SkuRow } from '../dao/index';
import { AppError, isRecord } from '../errors';
import { id, integer, json, safeNumber, schema } from '../catalog/rules';
import { decodeImages } from '../catalog/models';
export { requireWechat } from './points-rules';
export const canonicalId = (value: string): string => BigInt(value).toString();
function invalid(): never { throw new AppError('INVALID_ARGUMENT', '请求字段无效'); }
function text(value: unknown, max: number): value is string { return typeof value === 'string' && value.trim().length > 0 && [...value].length <= max; }
const shape: Record<string, readonly string[]> = {
  saveDesign: ['design_id','name','components'], listDesigns: ['page_token','page_size'], listDesignVersions: ['design_id','page_token','page_size'], getDesignVersion: ['design_version_id'], copyDesign: ['design_version_id','name'], getCart: [], addCartItem: ['item_type','sku_id','design_version_id','quantity'], updateCartItem: ['cart_item_id','quantity'], deleteCartItem: ['cart_item_id'], listAddresses: [], saveAddress: ['address_id','receiver_name','phone','province_code','city_code','city','district_code','district','address_line','set_as_default'], setDefaultAddress: ['address_id'], deleteAddress: ['address_id'],
};
const optional = new Set(['saveDesign.design_id','saveAddress.address_id','saveAddress.set_as_default','addCartItem.sku_id','addCartItem.design_version_id']);
export function validateBuyerPayload(action: string, payload: unknown): Record<string, unknown> {
  const fields = shape[action];
  if (!fields || !isRecord(payload) || fields.some(key => !(key in payload) && !optional.has(`${action}.${key}`)) || Object.keys(payload).some(key => !fields.includes(key))) return invalid();
  for (const [key, value] of Object.entries(payload)) {
    if (['design_id','address_id','sku_id','design_version_id','cart_item_id'].includes(key)) {
      if (value === null && optional.has(`${action}.${key}`)) continue;
      if (!id(value)) return invalid();
    } else if (key === 'name' && !text(value, 120)) return invalid();
    else if (key === 'components' && (!Array.isArray(value) || value.length < 1 || value.length > 1000 || !value.every(entry => isRecord(entry) && Object.keys(entry).length === 1 && id(entry.sku_id)))) return invalid();
    else if (key === 'quantity' && !integer(value, 1, 4294967295)) return invalid();
    else if (key === 'page_size' && !integer(value, 1, 100)) return invalid();
    else if (key === 'page_token' && !(value === null || (typeof value === 'string' && value.length > 0 && value.length <= 2048))) return invalid();
    else if (key === 'item_type' && value !== 'DESIGN' && value !== 'STANDARD') return invalid();
    else if (key === 'set_as_default' && typeof value !== 'boolean') return invalid();
    else if (key === 'receiver_name' && !text(value, 80)) return invalid();
    else if (key === 'phone' && !(typeof value === 'string' && value.length <= 32 && /^\+?[0-9][0-9 -]{4,30}[0-9]$/.test(value) && value.replace(/\D/g, '').length >= 7)) return invalid();
    else if (['province_code','city_code','district_code'].includes(key) && !(typeof value === 'string' && /^[1-9]\d{5}$/.test(value))) return invalid();
    else if (['city','district'].includes(key) && !text(value, 80)) return invalid();
    else if (key === 'address_line' && !text(value, 255)) return invalid();
  }
  if (action === 'addCartItem') {
    if (payload.item_type === 'STANDARD' ? !id(payload.sku_id) || (payload.design_version_id !== null && payload.design_version_id !== undefined) : !id(payload.design_version_id) || (payload.sku_id !== null && payload.sku_id !== undefined)) return invalid();
  }
  return payload;
}
export function decodeComponents(value: unknown): DesignComponent[] {
  const parsed = json(value);
  if (!Array.isArray(parsed) || !parsed.length || parsed.length > 1000) throw new AppError('INTERNAL_ERROR', '设计版本数据无效');
  return parsed.map((component: unknown) => {
    if (!isRecord(component) || !id(component.sku_id) || !isRecord(component.snapshot)) throw new AppError('INTERNAL_ERROR', '设计版本数据无效');
    const s = component.snapshot;
    if (typeof s.name !== 'string' || !(s.diameter_mm === null || (typeof s.diameter_mm === 'number' && Number.isFinite(s.diameter_mm) && s.diameter_mm >= 0)) || !(s.image_file_id === null || typeof s.image_file_id === 'string')) throw new AppError('INTERNAL_ERROR', '设计快照无效');
    return { sku_id: canonicalId(component.sku_id), snapshot: { name: s.name, diameter_mm: s.diameter_mm, image_file_id: s.image_file_id } };
  });
}
export async function loadMaterials(d: DaoSet, ids: readonly string[]) {
  const unique = [...new Set(ids.map(canonicalId))];
  const skus = await d.skus.findHistoricalByIds(unique);
  const items = await d.items.findHistoricalByIds([...new Set(skus.map(s => s.item_id))]);
  const categories = await d.categories.findHistoricalByIds([...new Set(items.map(i => i.category_id))]);
  return { skus: new Map(skus.map(s => [s.id, s])), items: new Map(items.map(i => [i.id, i])), categories: new Map(categories.map(c => [c.id, c])) };
}
export type Materials = Awaited<ReturnType<typeof loadMaterials>>;
export function material(m: Materials, skuId: string): { sku: SkuRow | null; item: ItemRow | null; category: CategoryRow | null } {
  const sku = m.skus.get(canonicalId(skuId)) ?? null; const item = sku ? m.items.get(sku.item_id) ?? null : null; const category = item ? m.categories.get(item.category_id) ?? null : null; return { sku, item, category };
}
export function snapshot(sku: SkuRow, item: ItemRow): MaterialSnapshot {
  const diameter = sku.diameter_mm === null ? null : Number(sku.diameter_mm);
  if (diameter !== null && (!Number.isFinite(diameter) || diameter < 0)) throw new AppError('INVALID_CATALOG_DATA', '材料尺寸无效');
  return { name: item.name, diameter_mm: diameter, image_file_id: sku.image_file_id ?? decodeImages(item.images)[0] ?? null };
}
export function unavailable(sku: SkuRow | null, item: ItemRow | null, category: CategoryRow | null, type: 'STANDARD' | 'MATERIAL'): string | null {
  if (!sku || !item || !category) return 'ITEM_UNAVAILABLE';
  if (sku.is_deleted || item.is_deleted || category.is_deleted || !sku.is_on_sale || !item.is_on_sale || !category.is_enabled) return 'ITEM_UNAVAILABLE';
  if (item.catalog_type !== category.catalog_type || (type === 'STANDARD' ? item.catalog_type !== 'STANDARD' : !['BEAD','ACCESSORY'].includes(item.catalog_type))) return 'ITEM_UNAVAILABLE';
  return null;
}
export function componentDetails(components: readonly DesignComponent[], m: Materials) {
  return components.map(c => { const { sku, item, category } = material(m, c.sku_id); const current = sku && item ? snapshot(sku, item) : null; const reason = unavailable(sku, item, category, 'MATERIAL'); return { ...c, current, changed: current !== null && JSON.stringify(current) !== JSON.stringify(c.snapshot), purchasable: reason === null, unavailable_reason: reason }; });
}
export function designPrice(components: readonly DesignComponent[], m: Materials): number | null {
  let total = 0; for (const c of components) { const { sku } = material(m, c.sku_id); if (!sku) return null; total += safeNumber(sku.price_cent); if (!Number.isSafeInteger(total)) throw new AppError('INVALID_CATALOG_DATA', '设计金额超出范围'); } return total;
}
export function stockReason(sku: SkuRow, quantity: number): string | null { return safeNumber(sku.stock_total) - safeNumber(sku.stock_reserved) < quantity ? 'INSUFFICIENT_STOCK' : null; }
export function specText(sku: SkuRow, item: ItemRow): string {
  const values = json(sku.spec_values); if (values === null) return '';
  const definition = schema(item.spec_schema); if (!isRecord(values)) throw new AppError('INVALID_CATALOG_DATA', '商品规格无效');
  return definition.dimensions.map(dim => `${dim.label}：${dim.options.find(option => option.value === values[dim.key])?.label ?? String(values[dim.key] ?? '')}`).join('，');
}
export function shippingRegions(raw: unknown): ShippingRegion[] {
  let value: unknown; try { value = typeof raw === 'string' ? JSON.parse(raw) as unknown : raw; } catch { throw new AppError('CONFIG_INVALID', '配送规则无效'); }
  if (!isRecord(value) || !Array.isArray(value.regions)) throw new AppError('CONFIG_INVALID', '配送规则无效');
  const seen = new Set<string>(); const rows = value.regions.map((r: unknown) => {
    if (!isRecord(r) || typeof r.province_code !== 'string' || !/^[1-9]\d{5}$/.test(r.province_code) || !text(r.province_name, 80) || typeof r.enabled !== 'boolean' || !integer(r.sort_order, -2147483648, 2147483647) || seen.has(r.province_code)) throw new AppError('CONFIG_INVALID', '配送规则无效');
    seen.add(r.province_code); return { province_code: r.province_code, province_name: r.province_name, enabled: r.enabled, sort_order: r.sort_order };
  });
  return rows.filter(r => r.enabled).sort((a,b) => a.sort_order - b.sort_order || a.province_code.localeCompare(b.province_code)).map(({ province_code, province_name }) => ({ province_code, province_name }));
}
