import type { CatalogType, SaveCategoryPayload } from '../../../contracts/src/catalog';
import type { DatabaseExecutor, SqlParameter } from '../db/database';
import type { CategoryRow } from './dao';
import type { Cursor } from './rules';
const categoryColumns = 'CAST(c.id AS CHAR) AS id,c.catalog_type,c.name,c.sort_order,c.is_enabled,c.is_deleted,c.updated_at';
export class CategoryDAO {
  constructor(private readonly db: DatabaseExecutor) {}
  async findById(id: string, lock = false): Promise<CategoryRow | null> { return (await this.db.query<CategoryRow>(`SELECT ${categoryColumns} FROM catalog_categories c WHERE c.id=?${lock ? ' FOR UPDATE' : ''}`, [id]))[0] ?? null; }
  async list(type: CatalogType | null, enabled: boolean, cursor: Cursor | null = null, limit?: number): Promise<readonly CategoryRow[]> {
    const params: SqlParameter[] = []; let where = 'c.is_deleted=0';
    if (type !== null) { where += ' AND c.catalog_type=?'; params.push(type); }
    if (enabled) where += ' AND c.is_enabled=1';
    if (cursor) { where += ' AND (c.sort_order>? OR (c.sort_order=? AND c.id>?))'; params.push(cursor.sort ?? 0, cursor.sort ?? 0, cursor.id); }
    if (limit !== undefined) params.push(limit);
    return this.db.query<CategoryRow>(`SELECT ${categoryColumns},(SELECT COUNT(*) FROM catalog_items i WHERE i.category_id=c.id AND i.is_deleted=0) AS item_count FROM catalog_categories c WHERE ${where} ORDER BY c.sort_order,c.id${limit === undefined ? '' : ' LIMIT ?'}`, params);
  }
  async save(input: SaveCategoryPayload): Promise<string> {
    if (input.category_id) { await this.db.execute('UPDATE catalog_categories SET catalog_type=?,name=?,sort_order=?,is_enabled=?,updated_at=UTC_TIMESTAMP() WHERE id=? AND is_deleted=0', [input.catalog_type, input.name, input.sort_order, input.is_enabled, input.category_id]); return input.category_id; }
    return (await this.db.execute('INSERT INTO catalog_categories(catalog_type,name,sort_order,is_enabled) VALUES(?,?,?,?)', [input.catalog_type, input.name, input.sort_order, input.is_enabled])).insertId;
  }
  async softDelete(id: string): Promise<void> { await this.db.execute('UPDATE catalog_categories SET is_deleted=1,is_enabled=0,updated_at=UTC_TIMESTAMP() WHERE id=?', [id]); }
}
