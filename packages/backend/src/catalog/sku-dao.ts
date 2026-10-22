import type {
  SaveCatalogSkuPayload,
  SpecValues,
} from "../../../contracts/src/catalog";
import type { DatabaseExecutor, SqlParameter } from "../db/database";
import type { SkuRow } from "./dao";
import { placeholders, page } from "../dao/sql";
import type { PointsExchangeSku } from '../../../contracts/src/index';
export interface StockCounters {
  stock_total: number;
  stock_reserved: number;
}
const skuColumns =
  "CAST(id AS CHAR) AS id,CAST(item_id AS CHAR) AS item_id,spec_values,spec_signature,diameter_mm,image_file_id,CAST(price_cent AS CHAR) AS price_cent,points_exchange_enabled,points_cost,stock_total,stock_reserved,is_on_sale,is_deleted,updated_at";
export class SkuDAO {
  constructor(private readonly db: DatabaseExecutor) {}
  /** Controlled historical display must retain logically deleted material rows. */
  async findHistoricalByIds(ids: readonly string[]): Promise<readonly SkuRow[]> {
    if (!ids.length) return [];
    return this.db.query<SkuRow>(`SELECT ${skuColumns} FROM catalog_skus WHERE id IN (${placeholders(ids)}) ORDER BY id`, ids);
  }
  async listExchangeSkus(categoryId: string | null, after: string | null, limit: number): Promise<readonly PointsExchangeSku[]> {
    return this.db.query<PointsExchangeSku>(`SELECT CAST(s.id AS CHAR) AS sku_id,i.name AS item_name,s.diameter_mm,s.image_file_id,s.points_cost,(s.stock_total-s.stock_reserved) AS available_stock FROM catalog_skus s JOIN catalog_items i ON i.id=s.item_id JOIN catalog_categories c ON c.id=i.category_id WHERE s.is_deleted=0 AND s.is_on_sale=1 AND s.points_exchange_enabled=1 AND s.points_cost>0 AND c.catalog_type='BEAD' AND i.is_deleted=0 AND i.is_on_sale=1 AND c.is_deleted=0 AND c.is_enabled=1 AND (? IS NULL OR c.id=?) AND (? IS NULL OR s.id>?) ORDER BY s.id LIMIT ?`, [categoryId, categoryId, after, after, limit]);
  }
  async findById(id: string, lock = false): Promise<SkuRow | null> {
    return (
      (
        await this.db.query<SkuRow>(
          `SELECT ${skuColumns} FROM catalog_skus WHERE id=?${lock ? " FOR UPDATE" : ""}`,
          [id],
        )
      )[0] ?? null
    );
  }
  async listByItemIds(
    itemIds: readonly string[],
    lock = false,
  ): Promise<readonly SkuRow[]> {
    if (!itemIds.length) return [];
    return this.db.query<SkuRow>(
      `SELECT ${skuColumns} FROM catalog_skus WHERE item_id IN (${itemIds.map(() => "?").join(",")}) AND is_deleted=0 ORDER BY item_id,id${lock ? " FOR UPDATE" : ""}`,
      itemIds,
    );
  }
  async save(
    input: SaveCatalogSkuPayload,
    values: SpecValues | null,
    signature: string | null,
  ): Promise<string> {
    const params: SqlParameter[] = [
      values === null ? null : JSON.stringify(values),
      signature,
      input.diameter_mm,
      input.image_file_id,
      input.price_cent,
      input.is_on_sale,
      input.points_exchange_enabled,
      input.points_cost,
    ];
    if (input.sku_id) {
      await this.db.execute(
        "UPDATE catalog_skus SET spec_values=?,spec_signature=?,diameter_mm=?,image_file_id=?,price_cent=?,is_on_sale=?,points_exchange_enabled=?,points_cost=?,updated_at=UTC_TIMESTAMP() WHERE id=? AND is_deleted=0",
        [...params, input.sku_id],
      );
      return input.sku_id;
    }
    return (
      await this.db.execute(
        "INSERT INTO catalog_skus(spec_values,spec_signature,diameter_mm,image_file_id,price_cent,is_on_sale,points_exchange_enabled,points_cost,item_id,stock_total,stock_reserved) VALUES(?,?,?,?,?,?,?,?,?,0,0)",
        [...params, input.item_id],
      )
    ).insertId;
  }
  async updateSpec(
    id: string,
    values: SpecValues,
    signature: string,
  ): Promise<number> {
    return (
      await this.db.execute(
        "UPDATE catalog_skus SET spec_values=?,spec_signature=? WHERE id=?",
        [JSON.stringify(values), signature, id],
      )
    ).affectedRows;
  }
  async findByIds(
    ids: readonly string[],
    lock = false,
  ): Promise<readonly SkuRow[]> {
    if (!ids.length) return [];
    return this.db.query<SkuRow>(
      `SELECT ${skuColumns} FROM catalog_skus WHERE id IN (${placeholders(ids)}) AND is_deleted=0 ORDER BY id${lock ? " FOR UPDATE" : ""}`,
      ids,
    );
  }
  async findBySpecSignature(
    itemId: string,
    signature: string,
  ): Promise<SkuRow | null> {
    return (
      (
        await this.db.query<SkuRow>(
          `SELECT ${skuColumns} FROM catalog_skus WHERE item_id=? AND spec_signature=? AND is_deleted=0 ORDER BY id LIMIT 1`,
          [itemId, signature],
        )
      )[0] ?? null
    );
  }
  async listPointsExchange(limit = 50, offset = 0): Promise<readonly SkuRow[]> {
    return this.db.query<SkuRow>(
      `SELECT ${skuColumns} FROM catalog_skus WHERE points_exchange_enabled=1 AND is_on_sale=1 AND is_deleted=0 ORDER BY id LIMIT ? OFFSET ?`,
      page(limit, offset),
    );
  }
  async updateStockCounters(
    id: string,
    expectedTotal: number,
    expectedReserved: number,
    input: StockCounters,
  ): Promise<number> {
    return (
      await this.db.execute(
        "UPDATE catalog_skus SET stock_total=?,stock_reserved=?,updated_at=UTC_TIMESTAMP() WHERE id=? AND stock_total=? AND stock_reserved=? AND is_deleted=0 AND ?>=?",
        [
          input.stock_total,
          input.stock_reserved,
          id,
          expectedTotal,
          expectedReserved,
          input.stock_total,
          input.stock_reserved,
        ],
      )
    ).affectedRows;
  }
  async adjustStock(skuId: string, total: number): Promise<number> {
    return (
      await this.db.execute(
        "UPDATE catalog_skus SET stock_total=?,updated_at=UTC_TIMESTAMP() WHERE id=? AND is_deleted=0",
        [total, skuId],
      )
    ).affectedRows;
  }
  async softDelete(id: string): Promise<number> {
    return (
      await this.db.execute(
        "UPDATE catalog_skus SET is_deleted=1,is_on_sale=0,updated_at=UTC_TIMESTAMP() WHERE id=?",
        [id],
      )
    ).affectedRows;
  }
}
