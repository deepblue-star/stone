import type { SaveCatalogItemPayload } from '../../../contracts/src/catalog';
import type { DatabaseExecutor, SqlParameter } from '../db/database';
import type { ItemRow } from './dao';
import type { Cursor } from './rules';
const itemColumns = 'CAST(i.id AS CHAR) AS id,CAST(i.category_id AS CHAR) AS category_id,c.catalog_type,i.name,i.description,i.images,i.spec_schema,i.is_on_sale,i.is_deleted,i.updated_at';
export class CatalogItemDAO {
  constructor(private readonly db: DatabaseExecutor) {}
  async findById(id: string, lock = false): Promise<ItemRow | null> { return (await this.db.query<ItemRow>(`SELECT ${itemColumns} FROM catalog_items i JOIN catalog_categories c ON c.id=i.category_id WHERE i.id=?${lock ? ' FOR UPDATE OF i' : ''}`, [id]))[0] ?? null; }
  async hasAnyByCategory(categoryId: string): Promise<boolean> { return (await this.db.query<{ id: string }>('SELECT CAST(id AS CHAR) AS id FROM catalog_items WHERE category_id=? LIMIT 1', [categoryId])).length > 0; }
  async list(filter: { categoryId?: string | null; categoryIds?: string[]; keyword?: string | null; onSale?: boolean | null; publicStandard?: boolean }, cursor: Cursor | null = null, limit?: number, lock = false): Promise<readonly ItemRow[]> {
    let where = 'i.is_deleted=0'; const params: SqlParameter[] = [];
    if (filter.categoryId) { where += ' AND i.category_id=?'; params.push(filter.categoryId); }
    if (filter.categoryIds) { if (!filter.categoryIds.length) return []; where += ` AND i.category_id IN (${filter.categoryIds.map(() => '?').join(',')})`; params.push(...filter.categoryIds); }
    if (filter.keyword) { where += " AND i.name LIKE ? ESCAPE '='"; params.push(`%${filter.keyword.replace(/[=%_]/g, '=$&')}%`); }
    if (filter.onSale !== undefined && filter.onSale !== null) { where += ' AND i.is_on_sale=?'; params.push(filter.onSale); }
    if (filter.publicStandard) where += " AND c.catalog_type='STANDARD' AND c.is_enabled=1 AND c.is_deleted=0";
    if (cursor) { where += ' AND i.id>?'; params.push(cursor.id); }
    if (limit !== undefined) params.push(limit);
    return this.db.query<ItemRow>(`SELECT ${itemColumns},(SELECT COUNT(*) FROM catalog_skus s WHERE s.item_id=i.id AND s.is_deleted=0) AS sku_count,(SELECT COALESCE(SUM(s.stock_total),0) FROM catalog_skus s WHERE s.item_id=i.id AND s.is_deleted=0) AS stock_total,(SELECT COALESCE(SUM(s.stock_reserved),0) FROM catalog_skus s WHERE s.item_id=i.id AND s.is_deleted=0) AS stock_reserved,(SELECT MIN(s.price_cent) FROM catalog_skus s WHERE s.item_id=i.id AND s.is_deleted=0 AND s.is_on_sale=1) AS min_price_cent,EXISTS(SELECT 1 FROM catalog_skus s WHERE s.item_id=i.id AND s.is_deleted=0 AND s.is_on_sale=1 AND s.stock_total>s.stock_reserved) AS has_available_sku FROM catalog_items i JOIN catalog_categories c ON c.id=i.category_id WHERE ${where} ORDER BY i.id${limit === undefined ? '' : ' LIMIT ?'}${lock ? ' FOR UPDATE OF i' : ''}`, params);
  }
  async save(input: SaveCatalogItemPayload): Promise<string> {
    const values: SqlParameter[] = [input.category_id, input.name, input.description, JSON.stringify(input.images), input.spec_schema === null ? null : JSON.stringify(input.spec_schema), input.is_on_sale];
    if (input.item_id) { await this.db.execute('UPDATE catalog_items SET category_id=?,name=?,description=?,images=?,spec_schema=?,is_on_sale=?,updated_at=UTC_TIMESTAMP() WHERE id=? AND is_deleted=0', [...values, input.item_id]); return input.item_id; }
    return (await this.db.execute('INSERT INTO catalog_items(category_id,name,description,images,spec_schema,is_on_sale) VALUES(?,?,?,?,?,?)', values)).insertId;
  }
  async softDelete(id: string): Promise<void> { await this.db.execute('UPDATE catalog_items SET is_deleted=1,is_on_sale=0,updated_at=UTC_TIMESTAMP() WHERE id=?', [id]); }
}
