import type * as C from '../../../contracts/src/index';
import type { DaoSet, CartRow, CartTarget } from '../dao/index';
import type { UnitOfWork } from '../db/unit-of-work';
import { safeNumber } from '../catalog/rules';
import { noImageUrls, selectedImages, type ImageUrlResolver } from '../catalog/images';
import { AppError, isRecord } from '../errors';
import { canonicalId, componentDetails, decodeComponents, designPrice, loadMaterials, material, requireWechat, snapshot, specText, stockReason, unavailable, validateBuyerPayload } from './buyer-rules';
export interface CartServiceOptions { images?: ImageUrlResolver }
export class CartService {
  private readonly images: ImageUrlResolver;
  constructor(private readonly daos: DaoSet, private readonly uow: UnitOfWork<DaoSet>, options: CartServiceOptions = {}) { this.images = options.images ?? noImageUrls; }
  private async validateTarget(d: DaoSet, openid: string, target: CartTarget): Promise<void> {
    if (target.item_type === 'DESIGN' && target.design_version_id) {
      const version = await d.designVersions.findById(target.design_version_id); if (!version) throw new AppError('NOT_FOUND', '设计版本不存在');
      const design = await d.designs.findByOwnerId(openid, version.design_id); if (!design) throw new AppError('FORBIDDEN', '无权访问该设计'); return;
    }
    if (target.item_type === 'STANDARD' && target.sku_id) {
      const m = await loadMaterials(d, [target.sku_id]); const { sku, item, category } = material(m, target.sku_id);
      if (!sku || sku.is_deleted || !item || item.is_deleted || !category || category.is_deleted || item.catalog_type !== 'STANDARD' || category.catalog_type !== 'STANDARD') throw new AppError('ITEM_UNAVAILABLE', '商品不存在或不可加入购物车'); return;
    }
    throw new AppError('INVALID_ARGUMENT', '购物车目标无效');
  }
  async addCartItem(payload: C.AddCartItemPayload, identity: C.TrustedIdentity): Promise<C.CartItemResult> {
    const openid = requireWechat(identity); validateBuyerPayload('addCartItem', payload);
    const target: CartTarget = { item_type: payload.item_type, sku_id: payload.item_type === 'STANDARD' ? canonicalId(payload.sku_id!) : null, design_version_id: payload.item_type === 'DESIGN' ? canonicalId(payload.design_version_id!) : null };
    for (let attempt = 0; attempt < 3; attempt++) {
      try { return await this.uow.run(async d => {
        await this.validateTarget(d, openid, target);
        const existing = await d.cart.findTarget(openid, target, true, true);
        if (!existing) return { cart_item_id: await d.cart.insert({ ...target, _openid: openid, quantity: payload.quantity }), quantity: payload.quantity };
        const quantity = existing.is_deleted ? payload.quantity : existing.quantity + payload.quantity;
        if (!Number.isSafeInteger(quantity) || quantity > 4294967295) throw new AppError('INVALID_ARGUMENT', '购物车数量超出范围');
        const affected = existing.is_deleted ? await d.cart.restore(openid, existing.id, quantity) : await d.cart.updateQuantity(openid, existing.id, quantity);
        if (!affected) throw new AppError('CONFLICT', '购物车已变化，请重试'); return { cart_item_id: existing.id, quantity };
      }); } catch (error) {
        const duplicate = isRecord(error) && error.code === 'ER_DUP_ENTRY' && /uk_cart_(sku|design)/.test(String(error.sqlMessage ?? error.message ?? ''));
        const deadlock = isRecord(error) && error.code === 'ER_LOCK_DEADLOCK';
        if (!duplicate && !deadlock) throw error; if (attempt === 2) throw new AppError('CONFLICT', '购物车更新冲突，请重试');
      }
    }
    throw new AppError('CONFLICT', '购物车更新冲突，请重试');
  }
  async updateCartItem(payload: C.UpdateCartItemPayload, identity: C.TrustedIdentity): Promise<C.CartItemResult> {
    const openid = requireWechat(identity); validateBuyerPayload('updateCartItem', payload); const id = canonicalId(payload.cart_item_id);
    if (!(await this.daos.cart.updateQuantity(openid, id, payload.quantity))) throw new AppError('NOT_FOUND', '购物车条目不存在');
    return { cart_item_id: id, quantity: payload.quantity };
  }
  async deleteCartItem(payload: C.CartItemPayload, identity: C.TrustedIdentity): Promise<{ cart_item_id: string }> {
    const openid = requireWechat(identity); validateBuyerPayload('deleteCartItem', payload); const id = canonicalId(payload.cart_item_id);
    if (!(await this.daos.cart.softDelete(openid, id))) throw new AppError('NOT_FOUND', '购物车条目不存在'); return { cart_item_id: id };
  }
  async getCart(payload: Record<string, never>, identity: C.TrustedIdentity): Promise<C.Cart> {
    const openid = requireWechat(identity); validateBuyerPayload('getCart', payload);
    const rows: CartRow[] = []; for (let offset = 0; ; offset += 500) { const page = await this.daos.cart.listByOwner(openid, 500, offset); rows.push(...page); if (page.length < 500) break; }
    const versions = await this.daos.designVersions.findByIds([...new Set(rows.flatMap(r => r.design_version_id ? [r.design_version_id] : []))]);
    const designs = await this.daos.designs.findByIds([...new Set(versions.map(v => v.design_id))], openid);
    const owned = new Map(designs.map(d => [d.id, d])); const versionMap = new Map(versions.filter(v => owned.has(v.design_id)).map(v => [v.id, v]));
    const components = new Map([...versionMap.values()].map(v => [v.id, decodeComponents(v.components)]));
    const ids = [...rows.flatMap(r => r.sku_id ? [r.sku_id] : []), ...[...components.values()].flatMap(list => list.map(c => c.sku_id))];
    const m = await loadMaterials(this.daos, ids);
    const items: C.CartItem[] = rows.map(row => {
      const base = { cart_item_id: row.id, item_type: row.item_type, sku_id: row.sku_id, design_version_id: row.design_version_id, quantity: row.quantity };
      if (row.item_type === 'STANDARD' && row.sku_id) {
        const { sku, item, category } = material(m, row.sku_id); const reason = unavailable(sku, item, category, 'STANDARD') ?? (sku ? stockReason(sku, row.quantity) : 'ITEM_UNAVAILABLE');
        return { ...base, display: { name: item?.name ?? '商品已失效', spec_text: sku && item ? specText(sku, item) : '', image_file_id: sku && item ? snapshot(sku, item).image_file_id : null, current_unit_price_cent: sku ? safeNumber(sku.price_cent) : null }, purchasable: reason === null, unavailable_reason: reason };
      }
      const version = row.design_version_id ? versionMap.get(row.design_version_id) : undefined; const saved = version ? components.get(version.id) : undefined;
      if (!version || !saved) return { ...base, display: { name: '设计版本已失效', spec_text: '', image_file_id: null, current_unit_price_cent: null }, purchasable: false, unavailable_reason: 'ITEM_UNAVAILABLE' };
      const details = componentDetails(saved, m); let reason = details.find(c => !c.purchasable)?.unavailable_reason ?? null;
      const required = new Map<string, number>(); for (const c of saved) required.set(c.sku_id, (required.get(c.sku_id) ?? 0) + row.quantity);
      if (!reason) for (const [id, quantity] of required) { const sku = m.skus.get(id); if (!sku || stockReason(sku, quantity)) { reason = 'INSUFFICIENT_STOCK'; break; } }
      return { ...base, display: { name: owned.get(version.design_id)!.name, spec_text: `设计版本 ${version.version_no}`, version_no: version.version_no, image_file_id: version.thumbnail_file_id ?? details[0]?.current?.image_file_id ?? details[0]?.snapshot.image_file_id ?? null, current_unit_price_cent: designPrice(saved, m), components: details }, purchasable: reason === null, unavailable_reason: reason };
    });
    const imageIds = items.flatMap(item => [item.display.image_file_id, ...(item.display.components?.flatMap(c => [c.current?.image_file_id ?? null, c.snapshot.image_file_id]) ?? [])]);
    return { items, image_urls: await this.images.resolve(selectedImages(imageIds)) };
  }
}
