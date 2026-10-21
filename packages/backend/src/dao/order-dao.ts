import type { DatabaseExecutor, SqlParameter } from "../db/database";
import type { RowMetadata, Timestamp } from "./types";
import { page, placeholders } from "./sql";
export type OrderStatus =
  | "PENDING_PAYMENT"
  | "READY_TO_SHIP"
  | "SHIPPED"
  | "COMPLETED"
  | "CLOSED";
export interface OrderInsert {
  order_no: string;
  _openid: string;
  checkout_key: string;
  checkout_request_hash: string;
  quote_hash: string;
  payment_mode: "WECHAT" | "ZERO_PAY";
  status: OrderStatus;
  goods_amount_cent: string;
  discount_amount_cent: string;
  shipping_fee_cent: string;
  total_amount_cent: string;
  address_snapshot: unknown;
  payment_deadline_at: Timestamp | null;
  paid_at: Timestamp | null;
  carrier_name: string | null;
  tracking_no: string | null;
  shipped_at: Timestamp | null;
  completed_at: Timestamp | null;
  closed_at: Timestamp | null;
}
export interface OrderRow extends OrderInsert, RowMetadata {
  id: string;
}
export interface OrderFilter {
  openid?: string;
  status?: OrderStatus;
  orderNo?: string;
  createdFrom?: Timestamp;
  createdTo?: Timestamp;
}
export interface OrderStateUpdate {
  status: OrderStatus;
  paid_at: Timestamp | null;
  shipped_at: Timestamp | null;
  completed_at: Timestamp | null;
  closed_at: Timestamp | null;
}
export interface OrderShipmentUpdate {
  status: OrderStatus;
  carrier_name: string;
  tracking_no: string;
  shipped_at: Timestamp;
}
export interface OrderStatusCount {
  status: OrderStatus;
  count: string;
}
const columns =
  "CAST(id AS CHAR) AS id,order_no,_openid,checkout_key,checkout_request_hash,quote_hash,payment_mode,status,CAST(goods_amount_cent AS CHAR) AS goods_amount_cent,CAST(discount_amount_cent AS CHAR) AS discount_amount_cent,CAST(shipping_fee_cent AS CHAR) AS shipping_fee_cent,CAST(total_amount_cent AS CHAR) AS total_amount_cent,address_snapshot,payment_deadline_at,paid_at,carrier_name,tracking_no,shipped_at,completed_at,closed_at,created_at,updated_at,is_deleted";
function filters(filter: OrderFilter): [string, SqlParameter[]] {
  let where = "is_deleted=0";
  const params: SqlParameter[] = [];
  if (filter.openid !== undefined) {
    where += " AND _openid=?";
    params.push(filter.openid);
  }
  if (filter.status !== undefined) {
    where += " AND status=?";
    params.push(filter.status);
  }
  if (filter.orderNo !== undefined) {
    where += " AND order_no=?";
    params.push(filter.orderNo);
  }
  if (filter.createdFrom !== undefined) {
    where += " AND created_at>=?";
    params.push(filter.createdFrom);
  }
  if (filter.createdTo !== undefined) {
    where += " AND created_at<=?";
    params.push(filter.createdTo);
  }
  return [where, params];
}
/** Identity and compensation reads deliberately include hidden financial records. */
export class OrderDAO {
  constructor(private readonly db: DatabaseExecutor) {}
  async insert(v: OrderInsert): Promise<string> {
    return (
      await this.db.execute(
        "INSERT INTO orders(order_no,_openid,checkout_key,checkout_request_hash,quote_hash,payment_mode,status,goods_amount_cent,discount_amount_cent,shipping_fee_cent,total_amount_cent,address_snapshot,payment_deadline_at,paid_at,carrier_name,tracking_no,shipped_at,completed_at,closed_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
        [
          v.order_no,
          v._openid,
          v.checkout_key,
          v.checkout_request_hash,
          v.quote_hash,
          v.payment_mode,
          v.status,
          v.goods_amount_cent,
          v.discount_amount_cent,
          v.shipping_fee_cent,
          v.total_amount_cent,
          JSON.stringify(v.address_snapshot),
          v.payment_deadline_at,
          v.paid_at,
          v.carrier_name,
          v.tracking_no,
          v.shipped_at,
          v.completed_at,
          v.closed_at,
        ],
      )
    ).insertId;
  }
  async findById(id: string, lock = false): Promise<OrderRow | null> {
    return (
      (
        await this.db.query<OrderRow>(
          `SELECT ${columns} FROM orders WHERE id=? LIMIT 1${lock ? " FOR UPDATE" : ""}`,
          [id],
        )
      )[0] ?? null
    );
  }
  async findByIds(
    ids: readonly string[],
    lock = false,
  ): Promise<readonly OrderRow[]> {
    if (!ids.length) return [];
    return this.db.query<OrderRow>(
      `SELECT ${columns} FROM orders WHERE id IN (${placeholders(ids)}) ORDER BY id${lock ? " FOR UPDATE" : ""}`,
      ids,
    );
  }
  async findByOrderNo(no: string, lock = false): Promise<OrderRow | null> {
    return (
      (
        await this.db.query<OrderRow>(
          `SELECT ${columns} FROM orders WHERE order_no=? LIMIT 1${lock ? " FOR UPDATE" : ""}`,
          [no],
        )
      )[0] ?? null
    );
  }
  async findByOwnerId(
    openid: string,
    id: string,
    lock = false,
  ): Promise<OrderRow | null> {
    return (
      (
        await this.db.query<OrderRow>(
          `SELECT ${columns} FROM orders WHERE _openid=? AND id=? AND is_deleted=0 LIMIT 1${lock ? " FOR UPDATE" : ""}`,
          [openid, id],
        )
      )[0] ?? null
    );
  }
  async findByCheckoutKey(
    openid: string,
    key: string,
    lock = false,
  ): Promise<OrderRow | null> {
    return (
      (
        await this.db.query<OrderRow>(
          `SELECT ${columns} FROM orders WHERE _openid=? AND checkout_key=? LIMIT 1${lock ? " FOR UPDATE" : ""}`,
          [openid, key],
        )
      )[0] ?? null
    );
  }
  async listByOwner(
    openid: string,
    filter: Omit<OrderFilter, "openid"> = {},
    limit = 50,
    offset = 0,
  ): Promise<readonly OrderRow[]> {
    const [where, params] = filters({ ...filter, openid });
    return this.db.query<OrderRow>(
      `SELECT ${columns} FROM orders WHERE ${where} ORDER BY created_at DESC,id DESC LIMIT ? OFFSET ?`,
      [...params, ...page(limit, offset)],
    );
  }
  async listAdmin(
    filter: OrderFilter = {},
    limit = 50,
    offset = 0,
  ): Promise<readonly OrderRow[]> {
    const [where, params] = filters(filter);
    return this.db.query<OrderRow>(
      `SELECT ${columns} FROM orders WHERE ${where} ORDER BY created_at DESC,id DESC LIMIT ? OFFSET ?`,
      [...params, ...page(limit, offset)],
    );
  }
  async countByStatus(openid?: string): Promise<readonly OrderStatusCount[]> {
    return this.db.query<OrderStatusCount>(
      `SELECT status,CAST(COUNT(*) AS CHAR) AS count FROM orders WHERE is_deleted=0${openid !== undefined ? " AND _openid=?" : ""} GROUP BY status`,
      openid !== undefined ? [openid] : [],
    );
  }
  async scanPending(
    createdSince: Timestamp,
    limit = 50,
  ): Promise<readonly OrderRow[]> {
    return this.db.query<OrderRow>(
      `SELECT ${columns} FROM orders WHERE status=? AND created_at>=? ORDER BY created_at,id LIMIT ?`,
      ["PENDING_PAYMENT", createdSince, page(limit)[0]],
    );
  }
  async scanDeadline(
    deadline: Timestamp,
    limit = 50,
  ): Promise<readonly OrderRow[]> {
    return this.db.query<OrderRow>(
      `SELECT ${columns} FROM orders WHERE status=? AND payment_deadline_at<=? ORDER BY payment_deadline_at,id LIMIT ?`,
      ["PENDING_PAYMENT", deadline, page(limit)[0]],
    );
  }
  async scanRecent(
    createdSince: Timestamp,
    statuses: readonly OrderStatus[],
    limit = 50,
  ): Promise<readonly OrderRow[]> {
    if (!statuses.length) return [];
    return this.db.query<OrderRow>(
      `SELECT ${columns} FROM orders WHERE created_at>=? AND status IN (${placeholders(statuses)}) ORDER BY created_at,id LIMIT ?`,
      [createdSince, ...statuses, page(limit)[0]],
    );
  }
  async updateState(
    id: string,
    expected: OrderStatus,
    v: OrderStateUpdate,
  ): Promise<number> {
    return (
      await this.db.execute(
        "UPDATE orders SET status=?,paid_at=?,shipped_at=?,completed_at=?,closed_at=?,updated_at=UTC_TIMESTAMP() WHERE id=? AND status=?",
        [
          v.status,
          v.paid_at,
          v.shipped_at,
          v.completed_at,
          v.closed_at,
          id,
          expected,
        ],
      )
    ).affectedRows;
  }
  async updateShipment(
    id: string,
    expected: OrderStatus,
    v: OrderShipmentUpdate,
  ): Promise<number> {
    return (
      await this.db.execute(
        "UPDATE orders SET status=?,carrier_name=?,tracking_no=?,shipped_at=?,updated_at=UTC_TIMESTAMP() WHERE id=? AND status=?",
        [v.status, v.carrier_name, v.tracking_no, v.shipped_at, id, expected],
      )
    ).affectedRows;
  }
}
