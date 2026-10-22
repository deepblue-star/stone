import { randomBytes } from 'node:crypto';
import type * as C from '../../../contracts/src/index';
import type { DaoSet } from '../dao/index';
import type { UnitOfWork } from '../db/unit-of-work';
import type { SkuCouponRow } from '../catalog/sku-coupon-dao';
import type { CategoryRow, ItemRow, SkuRow } from '../catalog/dao';
import { PageTokens, safeNumber } from '../catalog/rules';
import { noImageUrls, selectedImages, type ImageUrlResolver } from '../catalog/images';
import { AppError } from '../errors';
import { iso, requireWechat, validatePointsPayload } from './points-rules';
import type { PointsService } from './points-service';
export interface SkuCouponServiceOptions { tokenSecret?: string | (() => string); images?: ImageUrlResolver }
export class SkuCouponService {
  private readonly tokens: PageTokens;
  private readonly images: ImageUrlResolver;
  constructor(private readonly daos: DaoSet, private readonly uow: UnitOfWork<DaoSet>, private readonly points: PointsService, options: SkuCouponServiceOptions = {}) { this.tokens = new PageTokens(options.tokenSecret ?? randomBytes(32).toString('hex')); this.images = options.images ?? noImageUrls; }
  private offset(token: string | null, scope: string): number { const cursor = this.tokens.decode(token, scope); const offset = cursor ? Number(cursor.id) - 1 : 0; if (!Number.isSafeInteger(offset) || offset < 0) throw new AppError('INVALID_ARGUMENT', '分页标识无效'); return offset; }
  private unavailable(sku: SkuRow | null, item: ItemRow | null, category: CategoryRow | null): string | null { if (!sku || sku.is_deleted || !sku.is_on_sale || !item || item.is_deleted || !item.is_on_sale || item.catalog_type !== 'BEAD' || !category || category.is_deleted || !category.is_enabled) return 'ITEM_UNAVAILABLE'; if (sku.stock_total - sku.stock_reserved <= 0) return 'OUT_OF_STOCK'; return null; }
  async listMySkuCoupons(payload: C.ListSkuCouponsPayload, identity: C.TrustedIdentity): Promise<C.MySkuCouponPage> {
    const openid = requireWechat(identity); validatePointsPayload('listMySkuCoupons', payload);
    const result = await this.points.withAccount(openid, async (d, a) => { const scope = JSON.stringify(['coupons', a.id, payload.status]); const offset = this.offset(payload.page_token, scope); const rows = await d.skuCoupons.listByOwner(a.id, payload.status ? { status: payload.status } : {}, payload.page_size + 1, offset); const coupons = await this.couponModels(d, rows.slice(0, payload.page_size), openid); return { coupons, next_page_token: rows.length > payload.page_size ? this.tokens.encode(scope, { id: String(offset + payload.page_size + 1) }) : null }; });
    return { ...result, image_urls: await this.images.resolve(selectedImages(result.coupons.map(row => row.image_file_id))) };
  }
  private async couponModels(d: DaoSet, rows: readonly SkuCouponRow[], openid: string): Promise<C.MySkuCoupon[]> {
    const skus = new Map((await d.skus.findByIds([...new Set(rows.map(row => row.sku_id))])).map(row => [row.id, row])); const items = new Map((await d.items.findByIds([...new Set([...skus.values()].map(row => row.item_id))])).map(row => [row.id, row])); const categories = new Map<string, CategoryRow | null>(); for (const item of items.values()) if (!categories.has(item.category_id)) categories.set(item.category_id, await d.categories.findById(item.category_id));
    const orders = new Map((await d.orders.findByIds([...new Set(rows.flatMap(row => [row.locked_order_id,row.used_order_id].filter((id): id is string => id !== null)))])).filter(order => order._openid === openid).map(order => [order.id, order.order_no]));
    return rows.map(row => { const sku = skus.get(row.sku_id) ?? null; const item = sku ? items.get(sku.item_id) ?? null : null; return { coupon_id: row.id, sku_id: row.sku_id, item_name: item?.name ?? '商品已删除', diameter_mm: sku?.diameter_mm === null || !sku ? null : Number(sku.diameter_mm), image_file_id: sku?.image_file_id ?? null, status: row.status, locked_order_no: row.status === 'LOCKED' && row.locked_order_id ? orders.get(row.locked_order_id) ?? null : null, used_order_no: row.status === 'USED' && row.used_order_id ? orders.get(row.used_order_id) ?? null : null, refunded_points: row.status === 'REFUNDED' ? row.points_cost_snapshot : null, refunded_at: row.status === 'REFUNDED' && row.refunded_at ? iso(row.refunded_at) : null, refund_reason: row.status === 'REFUNDED' ? row.refund_reason : null, unavailable_reason: row.status === 'AVAILABLE' || row.status === 'LOCKED' ? this.unavailable(sku, item, item ? categories.get(item.category_id) ?? null : null) : null, created_at: iso(row.created_at) }; });
  }
  async getMyAvailableSkuCoupons(payload: Record<string, never>, identity: C.TrustedIdentity): Promise<{ items: C.AvailableSkuCoupon[] }> { const openid = requireWechat(identity); validatePointsPayload('getMyAvailableSkuCoupons', payload); return this.points.withAccount(openid, async (d, a) => { const counts = await d.skuCoupons.availableCounts(a.id); return { items: counts.map(row => ({ sku_id: row.sku_id, available_count: safeNumber(row.count) })) }; }); }
}
