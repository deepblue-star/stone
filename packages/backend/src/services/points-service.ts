import { randomBytes, randomInt } from 'node:crypto';
import type * as C from '../../../contracts/src/index';
import type { DaoSet, PointsAccount, PointsLedger } from '../dao/index';
import type { UnitOfWork } from '../db/unit-of-work';
import type { CategoryRow, ItemRow, SkuRow } from '../catalog/dao';
import { PageTokens, safeNumber } from '../catalog/rules';
import { noImageUrls, selectedImages, type ImageUrlResolver } from '../catalog/images';
import { AppError, isRecord } from '../errors';
import { checkedPoints, iso, requireWechat, shanghaiDate, validatePointsPayload } from './points-rules';
export interface PointsServiceOptions { now?: () => Date; inviteCode?: () => string; tokenSecret?: string | (() => string); images?: ImageUrlResolver }
export class PointsService {
  readonly now: () => Date;
  private readonly inviteCode: () => string;
  private readonly tokens: PageTokens;
  private readonly images: ImageUrlResolver;
  constructor(private readonly daos: DaoSet, private readonly uow: UnitOfWork<DaoSet>, options: PointsServiceOptions = {}) { this.now = options.now ?? (() => new Date()); this.inviteCode = options.inviteCode ?? (() => Array.from({ length: 4 }, () => 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'[randomInt(36)]).join('')); this.tokens = new PageTokens(options.tokenSecret ?? randomBytes(32).toString('hex')); this.images = options.images ?? noImageUrls; }
  /** Read through ordinary DAOs; only a missing account opens a creation transaction. */
  async withAccount<T>(openid: string, callback: (daos: DaoSet, account: PointsAccount) => Promise<T>): Promise<T> {
    const existing = await this.daos.pointsAccounts.findByOpenId(openid);
    if (existing) return callback(this.daos, existing);
    return this.uow.run(async daos => callback(daos, await this.ensureAccount(daos, openid)));
  }
  /** Caller owns the transaction; never starts a nested UnitOfWork. */
  async ensureAccount(daos: DaoSet, openid: string): Promise<PointsAccount> {
    const existing = await daos.pointsAccounts.findByOpenId(openid); if (existing) return existing;
    for (let attempt = 0; attempt < 10; attempt++) {
      const code = this.inviteCode(); if (!/^[A-Z0-9]{4}$/.test(code)) throw new AppError('INTERNAL_ERROR', '邀请码生成失败');
      if (await daos.pointsAccounts.findByInviteCode(code)) continue;
      try { const id = await daos.pointsAccounts.insert({ openid, inviteCode: code }); return { id, _openid: openid, invite_code: code, balance: '0', total_earned: '0', total_spent: '0' }; }
      catch (error) {
        if (!isRecord(error) || error.code !== 'ER_DUP_ENTRY') throw error;
        // Locking read sees a concurrent winner under MySQL REPEATABLE READ.
        const winner = await daos.pointsAccounts.findByOpenId(openid, true); if (winner) return winner;
        if (!(String(error.sqlMessage ?? error.message ?? '').includes('uk_points_invite_code'))) throw error;
      }
    }
    throw new AppError('INTERNAL_ERROR', '邀请码暂时无法生成');
  }
  async rules(daos: DaoSet): Promise<{ daily_check_in_points: number; referral_first_completed_order_points: number }> {
    const config = await daos.siteConfig.findByKey('points_rules'); let value: unknown = config?.config_value;
    if (typeof value === 'string') { try { value = JSON.parse(value) as unknown; } catch { throw new AppError('CONFIG_INVALID', '积分规则无效'); } }
    if (!isRecord(value) || !Number.isSafeInteger(value.daily_check_in_points) || !Number.isSafeInteger(value.referral_first_completed_order_points) || Number(value.daily_check_in_points) < 0 || Number(value.referral_first_completed_order_points) < 0 || Number(value.daily_check_in_points) > 4294967295 || Number(value.referral_first_completed_order_points) > 4294967295) throw new AppError('CONFIG_INVALID', '积分规则无效');
    return { daily_check_in_points: Number(value.daily_check_in_points), referral_first_completed_order_points: Number(value.referral_first_completed_order_points) };
  }
  ledgerModel(row: PointsLedger): C.PointsLedgerEntry { if (!row.created_at) throw new AppError('INTERNAL_ERROR', '积分流水缺少时间'); return { points_delta: row.points_delta, balance_after: row.balance_after, source_type: row.source_type, description: row.description, created_at: iso(row.created_at) }; }
  async centerInTransaction(daos: DaoSet, account: PointsAccount): Promise<C.PointsCenter> {
    const event = `DAILY_CHECK_IN:${account.id}:${shanghaiDate(this.now())}`;
    const rows = await daos.pointsLedger.listByAccount(account.id, {}, 5);
    return { balance: account.balance, total_earned: account.total_earned, total_spent: account.total_spent, checked_in_today: Boolean(await daos.pointsLedger.findByEventKey(event)), recent_ledger: rows.map(row => { const { balance_after: _balance, ...summary } = this.ledgerModel(row); return summary; }) };
  }
  async getPointsCenter(payload: Record<string, never>, identity: C.TrustedIdentity): Promise<C.PointsCenter> { const openid = requireWechat(identity); validatePointsPayload('getPointsCenter', payload); return this.withAccount(openid, (d, account) => this.centerInTransaction(d, account)); }
  async dailyCheckIn(payload: Record<string, never>, identity: C.TrustedIdentity): Promise<C.CheckInResult> {
    const openid = requireWechat(identity); validatePointsPayload('dailyCheckIn', payload); const date = shanghaiDate(this.now());
    return this.uow.run(async d => {
      const ensured = await this.ensureAccount(d, openid); const a = await d.pointsAccounts.findForUpdate(ensured.id); if (!a) throw new AppError('INTERNAL_ERROR', '积分账户不存在');
      const key = `DAILY_CHECK_IN:${a.id}:${date}`; const prior = await d.pointsLedger.findByEventKey(key, true);
      if (prior) return { awarded_points: safeNumber(prior.points_delta), balance: prior.balance_after, checked_in_date: date, idempotent_replay: true };
      const points = (await this.rules(d)).daily_check_in_points;
      if (!points) return { awarded_points: 0, balance: a.balance, checked_in_date: date, idempotent_replay: false };
      const balance = checkedPoints(BigInt(a.balance) + BigInt(points)); const earned = checkedPoints(BigInt(a.total_earned) + BigInt(points));
      await d.pointsAccounts.updateBalance({ id: a.id, balance, totalEarned: earned, totalSpent: a.total_spent });
      await d.pointsLedger.insert({ account_id: a.id, points_delta: String(points), balance_after: balance, source_type: 'DAILY_CHECK_IN', event_key: key, source_ref: date, description: '每日签到' });
      return { awarded_points: points, balance, checked_in_date: date, idempotent_replay: false };
    });
  }
  async listMyPointsLedger(payload: C.PointsLedgerPayload, identity: C.TrustedIdentity): Promise<C.PointsLedgerPage> {
    const openid = requireWechat(identity); validatePointsPayload('listMyPointsLedger', payload);
    return this.withAccount(openid, async (d, a) => { const scope = JSON.stringify(['ledger', a.id, payload.source_type ?? null, payload.direction ?? null]); const offset = this.offset(payload.page_token, scope); const rows = await d.pointsLedger.listByAccount(a.id, { ...(payload.source_type ? { sourceType: payload.source_type } : {}), ...(payload.direction ? { direction: payload.direction } : {}) }, payload.page_size + 1, offset); return { items: rows.slice(0, payload.page_size).map(row => this.ledgerModel(row)), next_page_token: rows.length > payload.page_size ? this.tokens.encode(scope, { id: String(offset + payload.page_size + 1) }) : null }; });
  }
  private offset(token: string | null, scope: string): number { const cursor = this.tokens.decode(token, scope); const offset = cursor ? Number(cursor.id) - 1 : 0; if (!Number.isSafeInteger(offset) || offset < 0) throw new AppError('INVALID_ARGUMENT', '分页标识无效'); return offset; }
  async listPointsExchangeSkus(payload: C.ExchangeSkusPayload, identity: C.TrustedIdentity): Promise<C.PointsExchangePage> {
    requireWechat(identity); validatePointsPayload('listPointsExchangeSkus', payload); const scope = JSON.stringify(['exchange-skus', payload.category_id]); const cursor = this.tokens.decode(payload.page_token, scope); const rows = await this.daos.skus.listExchangeSkus(payload.category_id, cursor?.id ?? null, payload.page_size + 1); const items = rows.slice(0, payload.page_size).map(row => ({ ...row, diameter_mm: row.diameter_mm === null ? null : Number(row.diameter_mm), points_cost: safeNumber(row.points_cost), available_stock: safeNumber(row.available_stock) })); const image_urls = await this.images.resolve(selectedImages(items.map(row => row.image_file_id))); return { items, image_urls, next_page_token: rows.length > payload.page_size && items.at(-1) ? this.tokens.encode(scope, { id: items.at(-1)!.sku_id }) : null };
  }
  private unavailable(sku: SkuRow | null, item: ItemRow | null, category: CategoryRow | null): string | null { if (!sku || sku.is_deleted || !sku.is_on_sale || !item || item.is_deleted || !item.is_on_sale || item.catalog_type !== 'BEAD' || !category || category.is_deleted || !category.is_enabled) return 'ITEM_UNAVAILABLE'; return null; }
  async exchangePointsForSkuCoupon(payload: C.ExchangePointsPayload, identity: C.TrustedIdentity): Promise<C.ExchangePointsResult> {
    const openid = requireWechat(identity); validatePointsPayload('exchangePointsForSkuCoupon', payload); const key = `POINTS_EXCHANGE:${payload.exchange_key}`; const skuId = BigInt(payload.sku_id).toString();
    return this.uow.run(async d => {
      const ensured = await this.ensureAccount(d, openid);
      const replay = async (lock = false): Promise<C.ExchangePointsResult | null> => { const coupon = await d.skuCoupons.findByEventKey(key, lock); if (!coupon) return null; if (coupon.account_id !== ensured.id || BigInt(coupon.sku_id).toString() !== skuId || coupon.source_type !== 'POINTS_EXCHANGE') throw new AppError('CONFLICT', '兑换请求键已被使用'); const a = await d.pointsAccounts.findByOpenId(openid, true); if (!a) throw new AppError('INTERNAL_ERROR', '积分账户不存在'); return { coupon_id: coupon.id, sku_id: BigInt(coupon.sku_id).toString(), status: coupon.status, points_cost: coupon.points_cost_snapshot, points_balance: a.balance, idempotent_replay: true }; };
      const prior = await replay(); if (prior) return prior;
      const before = await d.skus.findById(skuId); const itemBefore = before ? await d.items.findById(before.item_id) : null;
      if (!before || !itemBefore) throw new AppError('ITEM_UNAVAILABLE', '商品已不可兑换');
      // Match AdminCatalogService: category -> item -> SKU -> account -> coupon.
      const category = await d.categories.findById(itemBefore.category_id, true); const item = await d.items.findById(itemBefore.id, true); const sku = await d.skus.findById(skuId, true);
      if (item?.category_id !== itemBefore.category_id || sku?.item_id !== before.item_id) throw new AppError('CONFLICT', '商品已变化，请重试');
      const a = await d.pointsAccounts.findForUpdate(ensured.id); if (!a) throw new AppError('INTERNAL_ERROR', '积分账户不存在');
      const repeated = await replay(true); if (repeated) return repeated;
      if (this.unavailable(sku, item, category) || !sku || !sku.points_exchange_enabled || !Number.isSafeInteger(sku.points_cost) || !sku.points_cost || sku.points_cost < 0) throw new AppError('ITEM_UNAVAILABLE', '商品已不可兑换');
      const cost = sku.points_cost; if (BigInt(a.balance) < BigInt(cost)) throw new AppError('INSUFFICIENT_POINTS', '积分不足');
      const balance = checkedPoints(BigInt(a.balance) - BigInt(cost)); const spent = checkedPoints(BigInt(a.total_spent) + BigInt(cost));
      if (await d.pointsLedger.findByEventKey(key)) throw new AppError('CONFLICT', '兑换记录状态不一致');
      await d.pointsAccounts.updateBalance({ id: a.id, balance, totalEarned: a.total_earned, totalSpent: spent });
      await d.pointsLedger.insert({ account_id: a.id, points_delta: String(-cost), balance_after: balance, source_type: 'POINTS_EXCHANGE', event_key: key, source_ref: payload.exchange_key, description: '积分兑换SKU免费券' });
      const couponId = await d.skuCoupons.insert({ account_id: a.id, sku_id: sku.id, source_type: 'POINTS_EXCHANGE', source_ref: payload.exchange_key, points_cost_snapshot: cost, event_key: key, status: 'AVAILABLE', locked_order_id: null, locked_at: null, used_order_id: null, used_at: null, refunded_at: null, refund_reason: null });
      return { coupon_id: couponId, sku_id: sku.id, status: 'AVAILABLE', points_cost: cost, points_balance: balance, idempotent_replay: false };
    });
  }
}
