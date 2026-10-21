import type { DatabaseExecutor, SqlParameter } from "../db/database";
import type { MovementRow } from "./dao";
import type { Cursor } from "./rules";
import { batchPlaceholders, page } from "../dao/sql";
export interface InventoryMovementInsert {
  event_key: string;
  sku_id: string;
  order_id: string | null;
  action: MovementRow["action"];
  stock_delta: number;
  reserved_delta: number;
  operator_uid: string | null;
  remark: string | null;
}
function values(v: InventoryMovementInsert): SqlParameter[] {
  return [
    v.event_key,
    v.sku_id,
    v.order_id,
    v.action,
    v.stock_delta,
    v.reserved_delta,
    v.operator_uid,
    v.remark,
  ];
}
const movementColumns =
  "CAST(id AS CHAR) AS id,event_key,CAST(sku_id AS CHAR) AS sku_id,action,stock_delta,reserved_delta,CAST(order_id AS CHAR) AS order_id,operator_uid,remark,created_at";
export class InventoryMovementDAO {
  constructor(private readonly db: DatabaseExecutor) {}
  async findByEventKey(eventKey: string): Promise<MovementRow | null> {
    return (
      (
        await this.db.query<MovementRow>(
          `SELECT ${movementColumns} FROM inventory_movements WHERE event_key=? LIMIT 1`,
          [eventKey],
        )
      )[0] ?? null
    );
  }
  async insertAdjustment(
    eventKey: string,
    skuId: string,
    delta: number,
    uid: string,
    remark: string,
  ): Promise<string> {
    return (
      await this.db.execute(
        "INSERT INTO inventory_movements(event_key,sku_id,action,stock_delta,reserved_delta,operator_uid,remark) VALUES(?,?,'ADMIN_ADJUST',?,0,?,?)",
        [eventKey, skuId, delta, uid, remark],
      )
    ).insertId;
  }
  async listBySku(
    skuId: string,
    cursor: Cursor | null,
    limit: number,
  ): Promise<readonly MovementRow[]> {
    const params: SqlParameter[] = [skuId];
    let where = "sku_id=? AND is_deleted=0";
    if (cursor) {
      where +=
        " AND (inventory_movements.created_at<? OR (inventory_movements.created_at=? AND inventory_movements.id<?))";
      params.push(cursor.time ?? "", cursor.time ?? "", cursor.id);
    }
    params.push(page(limit)[0]);
    return this.db.query<MovementRow>(
      `SELECT ${movementColumns} FROM inventory_movements WHERE ${where} ORDER BY inventory_movements.created_at DESC,inventory_movements.id DESC LIMIT ?`,
      params,
    );
  }
  async insert(input: InventoryMovementInsert): Promise<string> {
    return (
      await this.db.execute(
        "INSERT INTO inventory_movements(event_key,sku_id,order_id,action,stock_delta,reserved_delta,operator_uid,remark) VALUES(?,?,?,?,?,?,?,?)",
        values(input),
      )
    ).insertId;
  }
  async insertMany(rows: readonly InventoryMovementInsert[]): Promise<number> {
    if (!rows.length) return 0;
    return (
      await this.db.execute(
        `INSERT INTO inventory_movements(event_key,sku_id,order_id,action,stock_delta,reserved_delta,operator_uid,remark) VALUES ${batchPlaceholders(rows, 8)}`,
        rows.flatMap(values),
      )
    ).affectedRows;
  }
  async listByOrder(
    orderId: string,
    limit = 50,
    offset = 0,
  ): Promise<readonly MovementRow[]> {
    return this.db.query<MovementRow>(
      `SELECT ${movementColumns} FROM inventory_movements WHERE order_id=? AND is_deleted=0 ORDER BY created_at DESC,id DESC LIMIT ? OFFSET ?`,
      [orderId, ...page(limit, offset)],
    );
  }
}
