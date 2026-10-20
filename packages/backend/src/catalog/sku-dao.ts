import type { SaveCatalogSkuPayload, SpecValues } from '../../../contracts/src/catalog';
import type { DatabaseExecutor, SqlParameter } from '../db/database';
import type { SkuRow } from './dao';
const skuColumns = 'CAST(id AS CHAR) AS id,CAST(item_id AS CHAR) AS item_id,spec_values,spec_signature,diameter_mm,image_file_id,CAST(price_cent AS CHAR) AS price_cent,points_exchange_enabled,points_cost,stock_total,stock_reserved,is_on_sale,is_deleted,updated_at';
export class SkuDAO {
  constructor(private readonly db: DatabaseExecutor) {}
  async findById(id: string, lock = false): Promise<SkuRow | null> { return (await this.db.query<SkuRow>(`SELECT ${skuColumns} FROM catalog_skus WHERE id=?${lock ? ' FOR UPDATE' : ''}`, [id]))[0] ?? null; }
  async listByItemIds(itemIds: readonly string[], lock = false): Promise<readonly SkuRow[]> {
    if (!itemIds.length) return [];
    return this.db.query<SkuRow>(`SELECT ${skuColumns} FROM catalog_skus WHERE item_id IN (${itemIds.map(() => '?').join(',')}) AND is_deleted=0 ORDER BY item_id,id${lock ? ' FOR UPDATE' : ''}`, itemIds);
  }
  async save(input: SaveCatalogSkuPayload, values: SpecValues | null, signature: string | null): Promise<string> {
    const params: SqlParameter[] = [values === null ? null : JSON.stringify(values), signature, input.diameter_mm, input.image_file_id, input.price_cent, input.is_on_sale, input.points_exchange_enabled, input.points_cost];
    if (input.sku_id) { await this.db.execute('UPDATE catalog_skus SET spec_values=?,spec_signature=?,diameter_mm=?,image_file_id=?,price_cent=?,is_on_sale=?,points_exchange_enabled=?,points_cost=?,updated_at=UTC_TIMESTAMP() WHERE id=? AND is_deleted=0', [...params, input.sku_id]); return input.sku_id; }
    return (await this.db.execute('INSERT INTO catalog_skus(spec_values,spec_signature,diameter_mm,image_file_id,price_cent,is_on_sale,points_exchange_enabled,points_cost,item_id,stock_total,stock_reserved) VALUES(?,?,?,?,?,?,?,?,?,0,0)', [...params, input.item_id])).insertId;
  }
  async updateSpec(id: string, values: SpecValues, signature: string): Promise<void> { await this.db.execute('UPDATE catalog_skus SET spec_values=?,spec_signature=? WHERE id=?', [JSON.stringify(values), signature, id]); }
  async adjustStock(skuId: string, total: number): Promise<void> { await this.db.execute('UPDATE catalog_skus SET stock_total=?,updated_at=UTC_TIMESTAMP() WHERE id=? AND is_deleted=0', [total, skuId]); }
  async softDelete(id: string): Promise<void> { await this.db.execute('UPDATE catalog_skus SET is_deleted=1,is_on_sale=0,updated_at=UTC_TIMESTAMP() WHERE id=?', [id]); }
}
