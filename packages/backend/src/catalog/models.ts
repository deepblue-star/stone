import type { AdminCatalogItem, AdminCatalogSku, AdminCategory, InventoryStock, SpecSchema, SpecValues } from '../../../contracts/src/catalog';
import type { CategoryRow, ItemRow, SkuRow } from './dao';
import { iso, json, safeNumber } from './rules';
import { AppError } from '../errors';
export function decodeImages(value: unknown): string[] {
  let parsed: unknown;
  try { parsed = json(value); } catch { throw new AppError('INVALID_CATALOG_DATA', '商品图片配置必须为文件标识数组'); }
  if (parsed === null) return [];
  if (!Array.isArray(parsed) || !parsed.every((entry): entry is string => typeof entry === 'string')) throw new AppError('INVALID_CATALOG_DATA', '商品图片配置必须为文件标识数组');
  return parsed;
}
export const stockModel = (sku: SkuRow): InventoryStock => ({ sku_id: sku.id, stock_total: safeNumber(sku.stock_total), stock_reserved: safeNumber(sku.stock_reserved), available_stock: safeNumber(sku.stock_total) - safeNumber(sku.stock_reserved) });
export const categoryModel = (row: CategoryRow): AdminCategory => ({ category_id: row.id, catalog_type: row.catalog_type, name: row.name, sort_order: row.sort_order, is_enabled: Boolean(row.is_enabled), item_count: safeNumber(row.item_count ?? 0), updated_at: iso(row.updated_at) });
export const skuModel = (row: SkuRow): AdminCatalogSku => ({ ...stockModel(row), item_id: row.item_id, spec_values: json(row.spec_values) as SpecValues | null, spec_signature: row.spec_signature, diameter_mm: row.diameter_mm === null ? null : Number(row.diameter_mm), image_file_id: row.image_file_id, price_cent: safeNumber(row.price_cent), is_on_sale: Boolean(row.is_on_sale), points_exchange_enabled: Boolean(row.points_exchange_enabled), points_cost: row.points_cost === null ? null : safeNumber(row.points_cost), updated_at: iso(row.updated_at) });
export const itemModel = (row: ItemRow, skus: readonly SkuRow[]): AdminCatalogItem => ({ item_id: row.id, category_id: row.category_id, catalog_type: row.catalog_type, name: row.name, description: row.description, images: decodeImages(row.images), spec_schema: json(row.spec_schema) as SpecSchema | null, is_on_sale: Boolean(row.is_on_sale), skus: skus.map(skuModel), updated_at: iso(row.updated_at) });
