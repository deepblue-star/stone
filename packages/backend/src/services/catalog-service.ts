import type { DiyMaterials, GetItemPayload, ListDiyMaterialsPayload, ListStandardItemsPayload, Page, StandardCategory, StandardItemDetail, StandardItemSummary, TrustedIdentity } from '../../../contracts/src';
import type { CatalogDaos, CategoryRow } from '../catalog/dao';
import { decodeImages, stockModel } from '../catalog/models';
import { noImageUrls, selectedImages, type ImageUrlResolver } from '../catalog/images';
import { normalizeSpec, PageTokens, safeNumber, schema, validateCatalogPayload } from '../catalog/rules';
import { AppError } from '../errors';
export class CatalogService {
  constructor(private readonly daos: CatalogDaos, private readonly tokens: PageTokens, private readonly logInvalid: (entry: { code: 'INVALID_CATALOG_DATA'; item_id: string; sku_id?: string }) => void, private readonly images: ImageUrlResolver = noImageUrls) {}
  private itemImages(item: { id: string; images: unknown }): string[] {
    try { return decodeImages(item.images); }
    catch { this.logInvalid({ code: 'INVALID_CATALOG_DATA', item_id: item.id }); throw new AppError('INVALID_CATALOG_DATA', '商品图片配置异常'); }
  }
  private async standardCategory(id: string): Promise<CategoryRow> {
    const category = await this.daos.categories.findById(id);
    if (!category || category.is_deleted) throw new AppError('NOT_FOUND', '分类不存在');
    if (category.catalog_type !== 'STANDARD' || !category.is_enabled) throw new AppError('ITEM_UNAVAILABLE', '分类暂不可用');
    return category;
  }
  async listStandardCategories(): Promise<{ categories: StandardCategory[] }> {
    return { categories: (await this.daos.categories.list('STANDARD', true)).map(row => ({ id: row.id, name: row.name, sort_order: row.sort_order })) };
  }
  async listStandardItems(payload: ListStandardItemsPayload): Promise<Page<StandardItemSummary>> {
    validateCatalogPayload('listStandardItems', payload); await this.standardCategory(payload.category_id);
    const scope = JSON.stringify(['standardItems', payload.category_id]);
    const rows = await this.daos.items.list({ categoryId: payload.category_id, onSale: true, publicStandard: true }, this.tokens.decode(payload.page_token, scope), payload.page_size + 1);
    const visible = rows.slice(0, payload.page_size); const last = visible.at(-1);
    const items = visible.map(row => ({ item_id: row.id, name: row.name, cover_file_id: this.itemImages(row)[0] ?? null, min_price_cent: row.min_price_cent === null || row.min_price_cent === undefined ? null : safeNumber(row.min_price_cent), has_available_sku: Boolean(row.has_available_sku) }));
    return { items, next_page_token: rows.length > payload.page_size && last ? this.tokens.encode(scope, { id: last.id }) : null, image_urls: await this.images.resolve(selectedImages(items.map(item => item.cover_file_id))) };
  }
  async getStandardItemDetail(payload: GetItemPayload): Promise<StandardItemDetail> {
    validateCatalogPayload('getStandardItemDetail', payload);
    const item = await this.daos.items.findById(payload.item_id);
    if (!item || item.is_deleted) throw new AppError('NOT_FOUND', '商品不存在');
    await this.standardCategory(item.category_id);
    if (!item.is_on_sale) throw new AppError('ITEM_UNAVAILABLE', '商品暂不可用');
    let definition;
    try { definition = schema(item.spec_schema); } catch { this.logInvalid({ code: 'INVALID_CATALOG_DATA', item_id: item.id }); throw new AppError('INVALID_CATALOG_DATA', '商品规格配置异常'); }
    const skus: StandardItemDetail['skus'] = [];
    for (const sku of await this.daos.skus.listByItemIds([item.id])) {
      if (!sku.is_on_sale) continue;
      try {
        const normalized = normalizeSpec(definition, sku.spec_values);
        skus.push({ sku_id: sku.id, spec_values: normalized.values, price_cent: safeNumber(sku.price_cent), available_stock: stockModel(sku).available_stock, image_file_id: sku.image_file_id });
      } catch { this.logInvalid({ code: 'INVALID_CATALOG_DATA', item_id: item.id, sku_id: sku.id }); }
    }
    if (!skus.length) throw new AppError('ITEM_UNAVAILABLE', '商品没有可选择规格');
    const images = this.itemImages(item);
    return { item_id: item.id, name: item.name, description: item.description, images, spec_schema: definition, skus, image_urls: await this.images.resolve(selectedImages([...images, ...skus.map(sku => sku.image_file_id)])) };
  }
  async listDiyMaterials(payload: ListDiyMaterialsPayload, identity: TrustedIdentity): Promise<DiyMaterials> {
    if (identity.kind !== 'wechat' || !identity.openid) throw new AppError('UNAUTHORIZED', '需要可信小程序身份');
    validateCatalogPayload('listDiyMaterials', payload);
    let categories = await this.daos.categories.list(payload.catalog_type, true);
    if (payload.category_id) {
      const target = await this.daos.categories.findById(payload.category_id);
      if (!target || target.is_deleted || !target.is_enabled) throw new AppError('NOT_FOUND', '分类不存在或已停用');
      if (target.catalog_type !== payload.catalog_type) throw new AppError('INVALID_ARGUMENT', '分类与材料类型不匹配');
      categories = categories.filter(row => row.id === target.id);
    }
    const items = await this.daos.items.list({ categoryIds: categories.map(row => row.id) });
    const skus = await this.daos.skus.listByItemIds(items.map(row => row.id));
    const byItem = new Map<string, typeof skus[number][]>();
    for (const sku of skus) { const list = byItem.get(sku.item_id) ?? []; list.push(sku); byItem.set(sku.item_id, list); }
    return { categories: categories.map(row => ({ id: row.id, name: row.name, sort_order: row.sort_order })), items: items.map(item => ({ id: item.id, category_id: item.category_id, name: item.name, is_on_sale: Boolean(item.is_on_sale), skus: (byItem.get(item.id) ?? []).map(sku => ({ id: sku.id, diameter_mm: sku.diameter_mm === null ? null : Number(sku.diameter_mm), price_cent: safeNumber(sku.price_cent), available_stock: stockModel(sku).available_stock, is_on_sale: Boolean(sku.is_on_sale), image_file_id: sku.image_file_id })) })), image_urls: await this.images.resolve(selectedImages(skus.map(sku => sku.image_file_id))) };
  }
}
