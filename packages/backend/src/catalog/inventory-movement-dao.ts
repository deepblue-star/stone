import type { DatabaseExecutor, SqlParameter } from '../db/database';
import type { MovementRow } from './dao';
import type { Cursor } from './rules';
const movementColumns = 'CAST(id AS CHAR) AS id,event_key,CAST(sku_id AS CHAR) AS sku_id,action,stock_delta,reserved_delta,CAST(order_id AS CHAR) AS order_id,operator_uid,remark,created_at';
export class InventoryMovementDAO {
  constructor(private readonly db: DatabaseExecutor) {}
  async findByEventKey(eventKey: string): Promise<MovementRow | null> { return (await this.db.query<MovementRow>(`SELECT ${movementColumns} FROM inventory_movements WHERE event_key=? LIMIT 1`, [eventKey]))[0] ?? null; }
  async insertAdjustment(eventKey: string, skuId: string, delta: number, uid: string, remark: string): Promise<void> { await this.db.execute("INSERT INTO inventory_movements(event_key,sku_id,action,stock_delta,reserved_delta,operator_uid,remark) VALUES(?,?,'ADMIN_ADJUST',?,0,?,?)", [eventKey, skuId, delta, uid, remark]); }
  async listBySku(skuId: string, cursor: Cursor | null, limit: number): Promise<readonly MovementRow[]> {
    const params: SqlParameter[] = [skuId]; let where = 'sku_id=? AND is_deleted=0';
    if (cursor) { where += ' AND (created_at<? OR (created_at=? AND id<?))'; params.push(cursor.time ?? '', cursor.time ?? '', cursor.id); }
    params.push(limit);
    return this.db.query<MovementRow>(`SELECT ${movementColumns} FROM inventory_movements WHERE ${where} ORDER BY created_at DESC,id DESC LIMIT ?`, params);
  }
}
