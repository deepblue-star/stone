import type { AdminCatalogItem, AdminCategory, AdminItemSummary, DeleteCatalogItemPayload, DeleteCatalogSkuPayload, DeleteCategoryPayload, GetItemPayload, ListAdminCategoriesPayload, ListAdminItemsPayload, Page, PreviewSkuDeactivationPayload, SaveCatalogItemPayload, SaveCatalogSkuPayload, SaveCategoryPayload, SkuDeactivationPreview, SkuDeactivationResult, TrustedIdentity } from '../../../contracts/src';
import type { CatalogDaos, CategoryRow, SkuRow } from '../catalog/dao';
import { categoryModel, itemModel, skuModel } from '../catalog/models';
import { noImageUrls, selectedImages, type ImageUrlResolver } from '../catalog/images';
import { compareId, deactivationHash, integer, iso, normalizeSpec, PageTokens, safeNumber, schema, validateCatalogPayload } from '../catalog/rules';
import type { UnitOfWork } from '../db/unit-of-work';
import { AppError } from '../errors';
import type { AdminAccessService } from './admin-access-service';
export interface FileReferenceValidator { assertCanReference(fileIds: readonly string[], identity: TrustedIdentity): Promise<void> }
function live<T extends { is_deleted: number }>(row: T | null, name: string): T { if (!row || row.is_deleted) throw new AppError('NOT_FOUND', `${name}不存在`); return row; }
function reserved(skus: readonly SkuRow[]): void { if (skus.some(row => row.stock_reserved > 0)) throw new AppError('SKU_HAS_PENDING_ORDERS', '存在待付款库存预占'); }
export class AdminCatalogService {
  constructor(private readonly daos: CatalogDaos, private readonly uow: UnitOfWork<CatalogDaos>, private readonly access: AdminAccessService, private readonly tokens: PageTokens, private readonly files: FileReferenceValidator, private readonly images: ImageUrlResolver = noImageUrls) {}
  async listCategories(payload: ListAdminCategoriesPayload, identity: TrustedIdentity): Promise<Page<AdminCategory>> {
    const admin = await this.access.requireEnabledAdmin(identity); validateCatalogPayload('listAdminCategories', payload);
    const scope = JSON.stringify(['categories', admin.auth_uid, payload.catalog_type]);
    const rows = await this.daos.categories.list(payload.catalog_type, false, this.tokens.decode(payload.page_token, scope), payload.page_size + 1);
    const visible = rows.slice(0, payload.page_size); const last = visible.at(-1);
    return { items: visible.map(categoryModel), next_page_token: rows.length > payload.page_size && last ? this.tokens.encode(scope, { id: last.id, sort: last.sort_order }) : null };
  }
  async listItems(payload: ListAdminItemsPayload, identity: TrustedIdentity): Promise<Page<AdminItemSummary>> {
    const admin = await this.access.requireEnabledAdmin(identity); validateCatalogPayload('listAdminItems', payload);
    const scope = JSON.stringify(['items', admin.auth_uid, payload.category_id, payload.name_keyword, payload.is_on_sale]);
    const rows = await this.daos.items.list({ categoryId: payload.category_id, keyword: payload.name_keyword, onSale: payload.is_on_sale }, this.tokens.decode(payload.page_token, scope), payload.page_size + 1);
    const visible = rows.slice(0, payload.page_size); const last = visible.at(-1);
    return { items: visible.map(row => ({ item_id: row.id, category_id: row.category_id, catalog_type: row.catalog_type, name: row.name, is_on_sale: Boolean(row.is_on_sale), sku_count: safeNumber(row.sku_count ?? 0), stock_total: safeNumber(row.stock_total ?? 0), stock_reserved: safeNumber(row.stock_reserved ?? 0), updated_at: iso(row.updated_at) })), next_page_token: rows.length > payload.page_size && last ? this.tokens.encode(scope, { id: last.id }) : null };
  }
  async getItem(payload: GetItemPayload, identity: TrustedIdentity): Promise<AdminCatalogItem> {
    await this.access.requireEnabledAdmin(identity); validateCatalogPayload('getAdminCatalogItem', payload);
    const item = live(await this.daos.items.findById(payload.item_id), '商品');
    const result = itemModel(item, await this.daos.skus.listByItemIds([item.id]));
    result.image_urls = await this.images.resolve(selectedImages([...result.images, ...result.skus.map(sku => sku.image_file_id)]));
    return result;
  }
  async saveCategory(payload: SaveCategoryPayload, identity: TrustedIdentity): Promise<AdminCategory> {
    await this.access.requireEnabledAdmin(identity); validateCatalogPayload('saveCategory', payload);
    return this.uow.run(async daos => {
      if (payload.category_id) {
        const current = live(await daos.categories.findById(payload.category_id, true), '分类');
        const children = await daos.items.list({ categoryId: current.id }, null, undefined, true);
        if (current.catalog_type !== payload.catalog_type && await daos.items.hasAnyByCategory(current.id)) throw new AppError('CATALOG_TYPE_CONFLICT', '已有商品的分类不能修改类型');
        if (!payload.is_enabled) reserved(await daos.skus.listByItemIds(children.map(row => row.id), true));
      }
      const id = await daos.categories.save(payload);
      const row = live(await daos.categories.findById(id), '分类');
      return categoryModel({ ...row, item_count: (await daos.items.list({ categoryId: id })).length });
    });
  }
  async saveItem(payload: SaveCatalogItemPayload, identity: TrustedIdentity): Promise<AdminCatalogItem> {
    await this.access.requireEnabledAdmin(identity); validateCatalogPayload('saveCatalogItem', payload);
    await this.files.assertCanReference(payload.images, identity);
    // Category locks precede item/SKU locks, including moves between categories.
    const before = payload.item_id ? live(await this.daos.items.findById(payload.item_id), '商品') : null;
    return this.uow.run(async daos => {
      const categoryIds = [...new Set([payload.category_id, ...(before ? [before.category_id] : [])])].sort(compareId);
      const categories = new Map<string, CategoryRow>();
      for (const id of categoryIds) categories.set(id, live(await daos.categories.findById(id, true), '分类'));
      const target = categories.get(payload.category_id)!;
      let children: readonly SkuRow[] = [];
      if (payload.item_id) {
        const current = live(await daos.items.findById(payload.item_id, true), '商品');
        if (current.category_id !== before?.category_id) throw new AppError('CONFLICT', '商品分类已变化，请刷新');
        if (current.catalog_type !== target.catalog_type) throw new AppError('CATALOG_TYPE_CONFLICT', '商品不能移动到不同类型分类');
        children = await daos.skus.listByItemIds([current.id], true);
        if (!payload.is_on_sale) reserved(children);
      }
      if (target.catalog_type === 'STANDARD') {
        schema(payload.spec_schema);
        const signatures = new Set<string>();
        for (const sku of children) {
          const normalized = normalizeSpec(payload.spec_schema, sku.spec_values);
          if (signatures.has(normalized.signature)) throw new AppError('SKU_SPEC_ALREADY_EXISTS', '规格变更产生重复SKU');
          signatures.add(normalized.signature);
          await daos.skus.updateSpec(sku.id, normalized.values, normalized.signature);
        }
      }
      const id = await daos.items.save(payload);
      return itemModel(live(await daos.items.findById(id), '商品'), await daos.skus.listByItemIds([id]));
    });
  }
  async saveSku(payload: SaveCatalogSkuPayload, identity: TrustedIdentity) {
    await this.access.requireEnabledAdmin(identity); validateCatalogPayload('saveCatalogSku', payload);
    await this.files.assertCanReference(payload.image_file_id ? [payload.image_file_id] : [], identity);
    return this.uow.run(async daos => {
      const item = live(await daos.items.findById(payload.item_id, true), '商品');
      const current = payload.sku_id ? live(await daos.skus.findById(payload.sku_id, true), 'SKU') : null;
      if (current && current.item_id !== item.id) throw new AppError('INVALID_ARGUMENT', 'SKU所属商品不可修改');
      if (payload.points_exchange_enabled && item.catalog_type !== 'BEAD') throw new AppError('INVALID_ARGUMENT', '仅珠子允许积分兑换');
      const normalized = item.catalog_type === 'STANDARD' ? normalizeSpec(item.spec_schema, payload.spec_values) : { values: payload.spec_values, signature: null };
      if (normalized.signature) {
        const siblings = await daos.skus.listByItemIds([item.id]);
        if (siblings.some(row => row.id !== current?.id && row.spec_signature === normalized.signature)) throw new AppError('SKU_SPEC_ALREADY_EXISTS', '相同规格SKU已存在');
      }
      let refund: SkuDeactivationResult | undefined;
      if (current?.is_on_sale && !payload.is_on_sale) refund = await this.deactivate(daos, current, 'OFF_SALE', payload.deactivation_impact_hash);
      const id = await daos.skus.save(payload, normalized.values, normalized.signature);
      return { ...skuModel(live(await daos.skus.findById(id), 'SKU')), ...(refund ? { deactivation: refund } : {}) };
    });
  }
  async previewSkuDeactivation(payload: PreviewSkuDeactivationPayload, identity: TrustedIdentity): Promise<SkuDeactivationPreview> {
    await this.access.requireEnabledAdmin(identity); validateCatalogPayload('previewSkuDeactivation', payload);
    const sku = live(await this.daos.skus.findById(payload.sku_id), 'SKU');
    return this.preview(this.daos, sku, payload.operation);
  }
  private async preview(daos: CatalogDaos, sku: SkuRow, operation: 'OFF_SALE' | 'DELETE'): Promise<SkuDeactivationPreview> {
    const coupons = await daos.skuCoupons.listActiveBySku(sku.id);
    const available = coupons.filter(row => row.status === 'AVAILABLE');
    const accounts = new Map<string, { account_id: string; openid_masked: string; coupon_count: number; refund_points: number }>();
    let total = 0;
    for (const coupon of available) {
      const points = safeNumber(coupon.points_cost_snapshot); total += points;
      if (!integer(total)) throw new AppError('INVALID_CATALOG_DATA', '退款积分超出安全范围');
      const account = accounts.get(coupon.account_id) ?? { account_id: coupon.account_id, openid_masked: coupon._openid.length > 8 ? `${coupon._openid.slice(0, 4)}****${coupon._openid.slice(-4)}` : '****', coupon_count: 0, refund_points: 0 };
      account.coupon_count++; account.refund_points += points; accounts.set(coupon.account_id, account);
    }
    const pending = await daos.reservations.countPendingOrders(sku.id);
    const canExecute = sku.stock_reserved === 0 && pending === 0 && !coupons.some(row => row.status === 'LOCKED');
    return { sku_id: sku.id, operation, stock_reserved: sku.stock_reserved, pending_order_count: pending, can_execute: canExecute, available_coupon_count: available.length, refundable_points: total, affected_accounts: [...accounts.values()].sort((a, b) => compareId(a.account_id, b.account_id)), impact_hash: canExecute ? deactivationHash(sku.id, operation, sku.stock_reserved, available) : null };
  }
  private async deactivate(daos: CatalogDaos, sku: SkuRow, operation: 'OFF_SALE' | 'DELETE', hash: string | null): Promise<SkuDeactivationResult> {
    if (sku.stock_reserved > 0 || await daos.reservations.countPendingOrders(sku.id) > 0) throw new AppError('SKU_HAS_PENDING_ORDERS', '存在待付款库存预占');
    const snapshot = await daos.skuCoupons.listActiveBySku(sku.id);
    if (snapshot.some(row => row.status === 'LOCKED')) throw new AppError('SKU_COUPON_STATE_CONFLICT', '兑换券与库存状态不一致');
    const available = snapshot.filter(row => row.status === 'AVAILABLE');
    if (!hash || hash !== deactivationHash(sku.id, operation, sku.stock_reserved, available)) throw new AppError('SKU_DEACTIVATION_IMPACT_CHANGED', '下架影响已变化，请重新预览');
    const accountIds = [...new Set(available.map(row => row.account_id))].sort(compareId);
    const accounts = new Map<string, NonNullable<Awaited<ReturnType<CatalogDaos['pointsAccounts']['findForUpdate']>>>>();
    for (const id of accountIds) {
      const account = await daos.pointsAccounts.findForUpdate(id);
      if (!account) throw new AppError('SKU_COUPON_STATE_CONFLICT', '兑换券账户不存在');
      accounts.set(id, account);
    }
    // Lock coupons only after every account, then recheck the exact snapshot.
    const locked = await daos.skuCoupons.listActiveBySku(sku.id, true);
    if (locked.some(row => row.status === 'LOCKED')) throw new AppError('SKU_COUPON_STATE_CONFLICT', '兑换券与库存状态不一致');
    if (hash !== deactivationHash(sku.id, operation, sku.stock_reserved, locked)) throw new AppError('SKU_DEACTIVATION_IMPACT_CHANGED', '下架影响已变化，请重新预览');
    const refundedAt = new Date();
    let total = 0;
    for (const coupon of locked) {
      const account = accounts.get(coupon.account_id);
      if (!account) throw new AppError('SKU_DEACTIVATION_IMPACT_CHANGED', '下架影响已变化，请重新预览');
      const eventKey = `POINTS_EXCHANGE_REFUND:${coupon.coupon_id}`;
      if (await daos.pointsLedger.findByEventKey(eventKey)) throw new AppError('SKU_COUPON_STATE_CONFLICT', '兑换券退款记录状态不一致');
      const points = safeNumber(coupon.points_cost_snapshot);
      if (points <= 0) throw new AppError('SKU_COUPON_STATE_CONFLICT', '兑换券退款积分无效');
      const balance = BigInt(account.balance) + BigInt(points);
      if (balance > 18446744073709551615n) throw new AppError('SKU_COUPON_STATE_CONFLICT', '积分余额超出范围');
      await daos.pointsAccounts.updateBalance({ id: account.id, balance: balance.toString(), totalEarned: account.total_earned, totalSpent: account.total_spent });
      account.balance = balance.toString();
      await daos.pointsLedger.insert({ account_id: account.id, points_delta: String(points), balance_after: account.balance, source_type: 'POINTS_EXCHANGE_REFUND', event_key: eventKey, source_ref: coupon.coupon_id, description: operation === 'DELETE' ? 'SKU删除，兑换积分退回' : 'SKU下架，兑换积分退回' });
      await daos.skuCoupons.markRefunded(coupon.coupon_id, operation === 'DELETE' ? 'SKU删除' : 'SKU下架', refundedAt);
      total += points;
      if (!integer(total)) throw new AppError('SKU_COUPON_STATE_CONFLICT', '退款积分超出范围');
    }
    return { sku_id: sku.id, operation, is_on_sale: false, is_deleted: operation === 'DELETE', refunded_coupon_count: locked.length, refunded_points: total, affected_account_count: accountIds.length, idempotent_replay: false };
  }
  async deleteSku(payload: DeleteCatalogSkuPayload, identity: TrustedIdentity): Promise<SkuDeactivationResult> {
    await this.access.requireEnabledAdmin(identity); validateCatalogPayload('deleteCatalogSku', payload);
    const before = await this.daos.skus.findById(payload.sku_id);
    if (!before) throw new AppError('NOT_FOUND', 'SKU不存在');
    return this.uow.run(async daos => {
      await daos.items.findById(before.item_id, true);
      const sku = await daos.skus.findById(payload.sku_id, true);
      if (!sku) throw new AppError('NOT_FOUND', 'SKU不存在');
      if (sku.is_deleted) return { sku_id: sku.id, operation: 'DELETE', is_on_sale: false, is_deleted: true, refunded_coupon_count: 0, refunded_points: 0, affected_account_count: 0, idempotent_replay: true };
      const result = await this.deactivate(daos, sku, 'DELETE', payload.impact_hash);
      await daos.skus.softDelete(sku.id);
      return result;
    });
  }
  async deleteItem(payload: DeleteCatalogItemPayload, identity: TrustedIdentity) {
    await this.access.requireEnabledAdmin(identity); validateCatalogPayload('deleteCatalogItem', payload);
    const before = live(await this.daos.items.findById(payload.item_id), '商品');
    return this.uow.run(async daos => {
      await daos.categories.findById(before.category_id, true);
      const item = live(await daos.items.findById(payload.item_id, true), '商品');
      if (item.category_id !== before.category_id) throw new AppError('CONFLICT', '商品分类已变化，请刷新');
      const children = await daos.skus.listByItemIds([item.id], true); reserved(children);
      if (children.length) throw new AppError('CONFLICT', '请先处理并删除全部SKU');
      await daos.items.softDelete(item.id);
      return { item_id: item.id, is_deleted: true as const, updated_at: iso((await daos.items.findById(item.id))!.updated_at) };
    });
  }
  async deleteCategory(payload: DeleteCategoryPayload, identity: TrustedIdentity) {
    await this.access.requireEnabledAdmin(identity); validateCatalogPayload('deleteCategory', payload);
    return this.uow.run(async daos => {
      const category = live(await daos.categories.findById(payload.category_id, true), '分类');
      const children = await daos.items.list({ categoryId: category.id }, null, undefined, true);
      reserved(await daos.skus.listByItemIds(children.map(row => row.id), true));
      if (children.length) throw new AppError('CONFLICT', '请先删除全部商品');
      await daos.categories.softDelete(category.id);
      return { category_id: category.id, is_deleted: true as const, updated_at: iso((await daos.categories.findById(category.id))!.updated_at) };
    });
  }
}
