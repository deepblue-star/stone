import type { DatabaseExecutor, SqlParameter } from "../db/database";
import { auditTimeConditions, type AdminAuditCursor, type AdminAuditTimeFilter } from '../dao/admin-audit-query';
export interface AdminSkuCouponFilter extends AdminAuditTimeFilter { skuId?: string; openid?: string; status?: SkuCouponStatus }
export interface AdminSkuCouponRow extends Omit<SkuCouponRow, 'updated_at' | 'is_deleted' | 'event_key' | 'locked_order_id' | 'used_order_id'> { _openid: string | null; locked_order_no: string | null; used_order_no: string | null; item_name: string | null; diameter_mm: string | number | null; image_file_id: string | null; sku_is_on_sale: number | null; item_is_on_sale: number | null; sku_is_deleted: number | null; item_is_deleted: number | null }
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
  async listForAdmin(filter: AdminSkuCouponFilter, limit: number, before?: AdminAuditCursor): Promise<readonly AdminSkuCouponRow[]> {
    let where = 'q.is_deleted=0';
    const params: SqlParameter[] = [];
    if (filter.skuId !== undefined) { where += ' AND q.sku_id=?'; params.push(filter.skuId); }
    if (filter.openid !== undefined) { where += ' AND a._openid=?'; params.push(filter.openid); }
    if (filter.status !== undefined) { where += ' AND q.status=?'; params.push(filter.status); }
    where += auditTimeConditions('q', filter, before, params);
    return this.db.query<AdminSkuCouponRow>(`SELECT CAST(q.id AS CHAR) AS id,CAST(q.account_id AS CHAR) AS account_id,a._openid,CAST(q.sku_id AS CHAR) AS sku_id,q.status,q.points_cost_snapshot,q.source_type,q.source_ref,locked_order.order_no AS locked_order_no,q.locked_at,used_order.order_no AS used_order_no,q.used_at,q.refunded_at,q.refund_reason,q.created_at,i.name AS item_name,s.diameter_mm,COALESCE(s.image_file_id,JSON_UNQUOTE(JSON_EXTRACT(i.images,'$[0]'))) AS image_file_id,s.is_on_sale AS sku_is_on_sale,i.is_on_sale AS item_is_on_sale,s.is_deleted AS sku_is_deleted,i.is_deleted AS item_is_deleted FROM user_sku_coupons q LEFT JOIN points_accounts a ON a.id=q.account_id LEFT JOIN catalog_skus s ON s.id=q.sku_id LEFT JOIN catalog_items i ON i.id=s.item_id LEFT JOIN orders locked_order ON locked_order.id=q.locked_order_id LEFT JOIN orders used_order ON used_order.id=q.used_order_id WHERE ${where} ORDER BY q.created_at DESC,q.id DESC LIMIT ?`, [...params, limit]);
  }
  async listAvailableForCheckout(accountId: string, skuIds: readonly string[], lock = false): Promise<readonly SkuCouponRow[]> {
    if (!skuIds.length) return [];
    return this.db.query<SkuCouponRow>(`SELECT ${columns} FROM user_sku_coupons WHERE account_id=? AND sku_id IN (${placeholders(skuIds)}) AND status='AVAILABLE' AND is_deleted=0 ORDER BY id${lock ? ' FOR UPDATE' : ''}`, [accountId,...skuIds]);
  }
  async countByStatus(accountId: string): Promise<readonly { status: string; count: string }[]> { return this.db.query<{ status: string; count: string }>('SELECT status,CAST(COUNT(*) AS CHAR) AS count FROM user_sku_coupons WHERE account_id=? AND is_deleted=0 GROUP BY status', [accountId]); }
  async availableCounts(accountId: string): Promise<readonly { sku_id: string; count: string }[]> { return this.db.query<{ sku_id: string; count: string }>("SELECT CAST(q.sku_id AS CHAR) AS sku_id,CAST(COUNT(*) AS CHAR) AS count FROM user_sku_coupons q JOIN catalog_skus s ON s.id=q.sku_id JOIN catalog_items i ON i.id=s.item_id JOIN catalog_categories c ON c.id=i.category_id WHERE q.account_id=? AND q.status='AVAILABLE' AND q.is_deleted=0 AND s.is_deleted=0 AND s.is_on_sale=1 AND i.is_deleted=0 AND i.is_on_sale=1 AND c.catalog_type='BEAD' AND c.is_deleted=0 AND c.is_enabled=1 GROUP BY q.sku_id ORDER BY q.sku_id", [accountId]); }
  async findByEventKey(key: string, lock = false): Promise<SkuCouponRow | null> {
    return (await this.db.query<SkuCouponRow>(`SELECT ${columns} FROM user_sku_coupons WHERE event_key=? AND is_deleted=0 LIMIT 1${lock ? ' FOR UPDATE' : ''}`, [key]))[0] ?? null;
  }
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
