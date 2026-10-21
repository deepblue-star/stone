import type { DatabaseExecutor } from "../db/database";
export interface SiteConfigRecord {
  config_key: string;
  config_value: unknown;
  updated_at?: Date | string;
}
export class SiteConfigDAO {
  constructor(private readonly db: DatabaseExecutor) {}
  async findByKey(key: string): Promise<SiteConfigRecord | null> {
    const rows = await this.db.query<SiteConfigRecord>(
      "SELECT config_key, config_value, updated_at FROM site_config WHERE config_key = ? AND is_deleted = 0 LIMIT 1",
      [key],
    );
    return rows[0] ?? null;
  }
  async findByKeys(
    keys: readonly string[],
  ): Promise<readonly SiteConfigRecord[]> {
    if (keys.length === 0) return [];
    return this.db.query<SiteConfigRecord>(
      `SELECT config_key, config_value, updated_at FROM site_config WHERE config_key IN (${keys.map(() => "?").join(", ")}) AND is_deleted = 0`,
      keys,
    );
  }
  async upsert(
    key: string,
    value: unknown,
    updatedBy: string | null,
  ): Promise<number> {
    return (
      await this.db.execute(
        "INSERT INTO site_config(config_key,config_value,updated_by) VALUES(?,?,?) ON DUPLICATE KEY UPDATE config_value=VALUES(config_value),updated_by=VALUES(updated_by),is_deleted=0,updated_at=UTC_TIMESTAMP()",
        [key, JSON.stringify(value), updatedBy],
      )
    ).affectedRows;
  }
}
