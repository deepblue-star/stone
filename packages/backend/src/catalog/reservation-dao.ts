import type { DatabaseExecutor } from "../db/database";
import type { RowMetadata } from "../dao/types";
import { batchPlaceholders, page } from "../dao/sql";
export type ReservationStatus = "RESERVED" | "CONSUMED" | "RELEASED";
export interface ReservationInsert {
  order_id: string;
  sku_id: string;
  quantity: number;
  status: ReservationStatus;
}
export interface ReservationRow extends ReservationInsert, RowMetadata {
  id: string;
}
const columns =
  "CAST(id AS CHAR) AS id,CAST(order_id AS CHAR) AS order_id,CAST(sku_id AS CHAR) AS sku_id,quantity,status,created_at,updated_at,is_deleted";
export class ReservationDAO {
  constructor(private readonly db: DatabaseExecutor) {}
  async countPendingOrders(skuId: string): Promise<number> {
    const rows = await this.db.query<{ count: number }>(
      "SELECT COUNT(DISTINCT order_id) AS count FROM order_stock_reservations WHERE sku_id=? AND status='RESERVED' AND is_deleted=0",
      [skuId],
    );
    return Number(rows[0]?.count ?? 0);
  }
  async insertMany(rows: readonly ReservationInsert[]): Promise<number> {
    if (!rows.length) return 0;
    return (
      await this.db.execute(
        `INSERT INTO order_stock_reservations(order_id,sku_id,quantity,status) VALUES ${batchPlaceholders(rows, 4)}`,
        rows.flatMap((v) => [v.order_id, v.sku_id, v.quantity, v.status]),
      )
    ).affectedRows;
  }
  async listByOrder(
    orderId: string,
    status?: ReservationStatus,
    lock = false,
  ): Promise<readonly ReservationRow[]> {
    return this.db.query<ReservationRow>(
      `SELECT ${columns} FROM order_stock_reservations WHERE order_id=? AND is_deleted=0${status !== undefined ? " AND status=?" : ""} ORDER BY id${lock ? " FOR UPDATE" : ""}`,
      status !== undefined ? [orderId, status] : [orderId],
    );
  }
  async listBySku(
    skuId: string,
    status?: ReservationStatus,
    limit = 50,
    offset = 0,
  ): Promise<readonly ReservationRow[]> {
    return this.db.query<ReservationRow>(
      `SELECT ${columns} FROM order_stock_reservations WHERE sku_id=? AND is_deleted=0${status !== undefined ? " AND status=?" : ""} ORDER BY id LIMIT ? OFFSET ?`,
      [
        skuId,
        ...(status !== undefined ? [status] : []),
        ...page(limit, offset),
      ],
    );
  }
  async updateState(
    id: string,
    expected: ReservationStatus,
    target: ReservationStatus,
  ): Promise<number> {
    return (
      await this.db.execute(
        "UPDATE order_stock_reservations SET status=?,updated_at=UTC_TIMESTAMP() WHERE id=? AND status=? AND is_deleted=0",
        [target, id, expected],
      )
    ).affectedRows;
  }
}
