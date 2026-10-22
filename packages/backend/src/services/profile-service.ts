import type * as C from '../../../contracts/src/index';
import type { DaoSet } from '../dao/index';
import type { UnitOfWork } from '../db/unit-of-work';
import { safeNumber } from '../catalog/rules';
import { isRecord } from '../errors';
import { iso, requireWechat, validatePointsPayload } from './points-rules';
import type { PointsService } from './points-service';
export class ProfileService {
  constructor(private readonly daos: DaoSet, private readonly uow: UnitOfWork<DaoSet>, private readonly points: PointsService) {}
  async getProfileSummary(payload: Record<string, never>, identity: C.TrustedIdentity): Promise<C.ProfileSummary> {
    const openid = requireWechat(identity); validatePointsPayload('getProfileSummary', payload);
    return this.points.withAccount(openid, async (d, account) => {
      const center = await this.points.centerInTransaction(d, account);
      const counts = await d.orders.countByStatus(openid); const orderCounts: C.ProfileSummary['order_counts'] = { PENDING_PAYMENT: 0, READY_TO_SHIP: 0, SHIPPED: 0, COMPLETED: 0, CLOSED: 0 }; for (const row of counts) orderCounts[row.status] = safeNumber(row.count);
      const coupons = await d.skuCoupons.countByStatus(account.id); const recent = (await d.orders.listByOwner(openid, {}, 1))[0];
      let customer: unknown = (await d.siteConfig.findByKey('customer_service'))?.config_value;
      if (typeof customer === 'string') { try { customer = JSON.parse(customer) as unknown; } catch { customer = null; } }
      return { design_count: safeNumber(await d.designs.countByOwner(openid)), cart_item_count: safeNumber(await d.cart.countByOwner(openid)), order_counts: orderCounts, points: { balance: center.balance, checked_in_today: center.checked_in_today, invite_code: account.invite_code, recent_ledger: center.recent_ledger }, sku_coupons: { available_count: safeNumber(coupons.find(row => row.status === 'AVAILABLE')?.count ?? '0'), locked_count: safeNumber(coupons.find(row => row.status === 'LOCKED')?.count ?? '0') }, recent_order: recent ? { order_no: recent.order_no, status: recent.status, total_amount_cent: recent.total_amount_cent, created_at: iso(recent.created_at) } : null, customer_service: isRecord(customer) && typeof customer.wechat_id === 'string' && typeof customer.qr_file_id === 'string' ? { wechat_id: customer.wechat_id, qr_file_id: customer.qr_file_id } : null };
    });
  }
}
