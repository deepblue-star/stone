import type { DatabaseExecutor } from "../db/database";
import type { CouponRow } from "./dao";
import type { RowMetadata, Timestamp } from "../dao/types";
import { page, placeholders } from "../dao/sql";
export type SkuCouponStatus = "AVAILABLE" | "LOCKED" | "USED" | "REFUNDED";
export interface SkuCouponState {
  status: SkuCouponStatus;
  locked_order_id: string | null;
  locked_at: Timestamp | null;
  used_order_id: string | null;
  used_at: Timestamp | null;
  refunded_at: Timestamp | null;
  refund_reason: string | null;
}
export interface SkuCouponInsert extends SkuCouponState {
  account_id: string;
  sku_id: string;
  source_type: string;
  source_ref: string | null;
  points_cost_snapshot: number;
  event_key: string;
}
export interface SkuCouponRow extends SkuCouponInsert, RowMetadata {
  id: string;
}
export interface SkuCouponFilter {
  status?: SkuCouponStatus;
  skuId?: string;
}
export interface SkuCouponAvailableCount {
  sku_id: string;
  count: string;
}
const columns =
  "CAST(id AS CHAR) AS id,CAST(account_id AS CHAR) AS account_id,CAST(sku_id AS CHAR) AS sku_id,source_type,source_ref,points_cost_snapshot,event_key,status,CAST(locked_order_id AS CHAR) AS locked_order_id,locked_at,CAST(used_order_id AS CHAR) AS used_order_id,used_at,refunded_at,refund_reason,created_at,updated_at,is_deleted";
const stateValues = (v: SkuCouponState) => [
  v.status,
  v.locked_order_id,
  v.locked_at,
  v.used_order_id,
  v.used_at,
  v.refunded_at,
  v.refund_reason,
];
export class SkuCouponDAO {
  constructor(private readonly db: DatabaseExecutor) {}
  async listActiveBySku(
    skuId: string,
    lock = false,
  ): Promise<readonly CouponRow[]> {
    return this.db.query<CouponRow>(
      `SELECT CAST(q.id AS CHAR) AS coupon_id,CAST(q.account_id AS CHAR) AS account_id,q.points_cost_snapshot,q.status,${lock ? "'' AS _openid" : "COALESCE(a._openid,'') AS _openid"} FROM user_sku_coupons q${lock ? "" : " LEFT JOIN points_accounts a ON a.id=q.account_id"} WHERE q.sku_id=? AND q.is_deleted=0 AND q.status IN ('AVAILABLE','LOCKED') ORDER BY q.id${lock ? " FOR UPDATE" : ""}`,
      [skuId],
    );
  }
  async markRefunded(
    id: string,
    reason: string,
    refundedAt: Timestamp,
  ): Promise<number> {
    return (
      await this.db.execute(
        "UPDATE user_sku_coupons SET status='REFUNDED',refunded_at=?,refund_reason=?,updated_at=UTC_TIMESTAMP() WHERE id=? AND status='AVAILABLE' AND is_deleted=0",
        [refundedAt, reason, id],
      )
    ).affectedRows;
  }
  async insert(v: SkuCouponInsert): Promise<string> {
    return (
      await this.db.execute(
        "INSERT INTO user_sku_coupons(account_id,sku_id,source_type,source_ref,points_cost_snapshot,event_key,status,locked_order_id,locked_at,used_order_id,used_at,refunded_at,refund_reason) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)",
        [
          v.account_id,
          v.sku_id,
          v.source_type,
          v.source_ref,
          v.points_cost_snapshot,
          v.event_key,
          ...stateValues(v),
        ],
      )
    ).insertId;
  }
  async findById(id: string, lock = false): Promise<SkuCouponRow | null> {
    return (
      (
        await this.db.query<SkuCouponRow>(
          `SELECT ${columns} FROM user_sku_coupons WHERE id=? AND is_deleted=0 LIMIT 1${lock ? " FOR UPDATE" : ""}`,
          [id],
        )
      )[0] ?? null
    );
  }
  async findByIds(
    ids: readonly string[],
    lock = false,
  ): Promise<readonly SkuCouponRow[]> {
    if (!ids.length) return [];
    return this.db.query<SkuCouponRow>(
      `SELECT ${columns} FROM user_sku_coupons WHERE id IN (${placeholders(ids)}) AND is_deleted=0 ORDER BY id${lock ? " FOR UPDATE" : ""}`,
      ids,
    );
  }
  async listByOwner(
    accountId: string,
    filter: SkuCouponFilter = {},
    limit = 50,
    offset = 0,
  ): Promise<readonly SkuCouponRow[]> {
    let where = "account_id=? AND is_deleted=0";
    const params = [accountId];
    if (filter.status !== undefined) {
      where += " AND status=?";
      params.push(filter.status);
    }
    if (filter.skuId !== undefined) {
      where += " AND sku_id=?";
      params.push(filter.skuId);
    }
    return this.db.query<SkuCouponRow>(
      `SELECT ${columns} FROM user_sku_coupons WHERE ${where} ORDER BY id LIMIT ? OFFSET ?`,
      [...params, ...page(limit, offset)],
    );
  }
  async listByOrder(
    orderId: string,
    lock = false,
  ): Promise<readonly SkuCouponRow[]> {
    return this.db.query<SkuCouponRow>(
      `SELECT ${columns} FROM user_sku_coupons WHERE (locked_order_id=? OR used_order_id=?) AND is_deleted=0 ORDER BY id${lock ? " FOR UPDATE" : ""}`,
      [orderId, orderId],
    );
  }
  async listBySku(
    skuId: string,
    status?: SkuCouponStatus,
    limit = 50,
    offset = 0,
  ): Promise<readonly SkuCouponRow[]> {
    return this.db.query<SkuCouponRow>(
      `SELECT ${columns} FROM user_sku_coupons WHERE sku_id=? AND is_deleted=0${status !== undefined ? " AND status=?" : ""} ORDER BY id LIMIT ? OFFSET ?`,
      [
        skuId,
        ...(status !== undefined ? [status] : []),
        ...page(limit, offset),
      ],
    );
  }
  async countAvailableBySku(
    accountId: string,
    skuIds: readonly string[],
  ): Promise<readonly SkuCouponAvailableCount[]> {
    if (!skuIds.length) return [];
    return this.db.query<SkuCouponAvailableCount>(
      `SELECT CAST(sku_id AS CHAR) AS sku_id,CAST(COUNT(*) AS CHAR) AS count FROM user_sku_coupons WHERE account_id=? AND sku_id IN (${placeholders(skuIds)}) AND status=? AND is_deleted=0 GROUP BY sku_id ORDER BY sku_id`,
      [accountId, ...skuIds, "AVAILABLE"],
    );
  }
  async updateState(
    id: string,
    expected: SkuCouponStatus,
    v: SkuCouponState,
  ): Promise<number> {
    return (
      await this.db.execute(
        "UPDATE user_sku_coupons SET status=?,locked_order_id=?,locked_at=?,used_order_id=?,used_at=?,refunded_at=?,refund_reason=?,updated_at=UTC_TIMESTAMP() WHERE id=? AND status=? AND is_deleted=0",
        [...stateValues(v), id, expected],
      )
    ).affectedRows;
  }
  async updateStates(
    ids: readonly string[],
    expected: SkuCouponStatus,
    v: SkuCouponState,
  ): Promise<number> {
    if (!ids.length) return 0;
    return (
      await this.db.execute(
        `UPDATE user_sku_coupons SET status=?,locked_order_id=?,locked_at=?,used_order_id=?,used_at=?,refunded_at=?,refund_reason=?,updated_at=UTC_TIMESTAMP() WHERE id IN (${placeholders(ids)}) AND status=? AND is_deleted=0`,
        [...stateValues(v), ...ids, expected],
      )
    ).affectedRows;
  }
}
