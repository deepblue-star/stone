import type { DatabaseExecutor } from '../db/database';
export class ReservationDAO {
  constructor(private readonly db: DatabaseExecutor) {}
  async countPendingOrders(skuId: string): Promise<number> { const rows = await this.db.query<{ count: number }>("SELECT COUNT(DISTINCT order_id) AS count FROM order_stock_reservations WHERE sku_id=? AND status='RESERVED' AND is_deleted=0", [skuId]); return Number(rows[0]?.count ?? 0); }
}
