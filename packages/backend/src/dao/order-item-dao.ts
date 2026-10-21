import type { DatabaseExecutor, SqlParameter } from "../db/database";
import type { RowMetadata } from "./types";
import { placeholders, batchPlaceholders } from "./sql";
export interface OrderItemInsert {
  order_id: string;
  item_type: "DESIGN" | "STANDARD";
  sku_id: string | null;
  design_version_id: string | null;
  quantity: number;
  unit_price_cent: string;
  gross_amount_cent: string;
  discount_amount_cent: string;
  line_amount_cent: string;
  item_snapshot: unknown;
  promotion_snapshot: unknown | null;
}
export interface OrderItemRow extends OrderItemInsert, RowMetadata {
  id: string;
}
const insertColumns =
  "order_id,item_type,sku_id,design_version_id,quantity,unit_price_cent,gross_amount_cent,discount_amount_cent,line_amount_cent,item_snapshot,promotion_snapshot";
const columns =
  "CAST(id AS CHAR) AS id,CAST(order_id AS CHAR) AS order_id,item_type,CAST(sku_id AS CHAR) AS sku_id,CAST(design_version_id AS CHAR) AS design_version_id,quantity,CAST(unit_price_cent AS CHAR) AS unit_price_cent,CAST(gross_amount_cent AS CHAR) AS gross_amount_cent,CAST(discount_amount_cent AS CHAR) AS discount_amount_cent,CAST(line_amount_cent AS CHAR) AS line_amount_cent,item_snapshot,promotion_snapshot,created_at,updated_at,is_deleted";
function values(v: OrderItemInsert): SqlParameter[] {
  return [
    v.order_id,
    v.item_type,
    v.sku_id,
    v.design_version_id,
    v.quantity,
    v.unit_price_cent,
    v.gross_amount_cent,
    v.discount_amount_cent,
    v.line_amount_cent,
    JSON.stringify(v.item_snapshot),
    v.promotion_snapshot === null ? null : JSON.stringify(v.promotion_snapshot),
  ];
}
export class OrderItemDAO {
  constructor(private readonly db: DatabaseExecutor) {}
  async insert(input: OrderItemInsert): Promise<string> {
    return (
      await this.db.execute(
        `INSERT INTO order_items(${insertColumns}) VALUES(?,?,?,?,?,?,?,?,?,?,?)`,
        values(input),
      )
    ).insertId;
  }
  async insertMany(rows: readonly OrderItemInsert[]): Promise<number> {
    if (!rows.length) return 0;
    return (
      await this.db.execute(
        `INSERT INTO order_items(${insertColumns}) VALUES ${batchPlaceholders(rows, 11)}`,
        rows.flatMap(values),
      )
    ).affectedRows;
  }
  async listByOrder(orderId: string): Promise<readonly OrderItemRow[]> {
    return this.db.query<OrderItemRow>(
      `SELECT ${columns} FROM order_items WHERE order_id=? AND is_deleted=0 ORDER BY id`,
      [orderId],
    );
  }
  async listByOrderIds(
    ids: readonly string[],
  ): Promise<readonly OrderItemRow[]> {
    if (!ids.length) return [];
    return this.db.query<OrderItemRow>(
      `SELECT ${columns} FROM order_items WHERE order_id IN (${placeholders(ids)}) AND is_deleted=0 ORDER BY order_id,id`,
      ids,
    );
  }
}
