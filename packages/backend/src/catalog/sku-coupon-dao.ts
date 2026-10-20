import type { DatabaseExecutor } from '../db/database';
import type { CouponRow } from './dao';
export class SkuCouponDAO {
  constructor(private readonly db: DatabaseExecutor) {}
  async listActiveBySku(skuId: string, lock = false): Promise<readonly CouponRow[]> {
    return this.db.query<CouponRow>(`SELECT CAST(q.id AS CHAR) AS coupon_id,CAST(q.account_id AS CHAR) AS account_id,q.points_cost_snapshot,q.status,${lock ? "'' AS _openid" : 'COALESCE(a._openid,\'\') AS _openid'} FROM user_sku_coupons q${lock ? '' : ' LEFT JOIN points_accounts a ON a.id=q.account_id'} WHERE q.sku_id=? AND q.is_deleted=0 AND q.status IN ('AVAILABLE','LOCKED') ORDER BY q.id${lock ? ' FOR UPDATE' : ''}`, [skuId]);
  }
  async markRefunded(id: string, reason: string): Promise<void> { await this.db.execute("UPDATE user_sku_coupons SET status='REFUNDED',refunded_at=UTC_TIMESTAMP(),refund_reason=?,updated_at=UTC_TIMESTAMP() WHERE id=? AND status='AVAILABLE' AND is_deleted=0", [reason, id]); }
}
