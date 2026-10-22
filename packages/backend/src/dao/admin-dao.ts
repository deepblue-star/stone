import type { Admin } from "../../../contracts/src/index";
import type { DatabaseExecutor, SqlParameter } from "../db/database";
import { page } from "./sql";
import type { RowMetadata } from "./types";
export interface AdminRow extends RowMetadata {
  id: string;
  auth_uid: string;
  display_name: string;
  enabled: number;
}
export interface AdminInsert {
  auth_uid: string;
  display_name: string;
  enabled: number;
}
export type AdminUpdate = Pick<AdminInsert, "display_name" | "enabled">;
const columns =
  "CAST(id AS CHAR) AS id,auth_uid,display_name,enabled,created_at,updated_at,is_deleted";
export class AdminDAO {
  constructor(private readonly db: DatabaseExecutor) {}
  async findEnabledByAuthUid(uid: string): Promise<Admin | null> {
    return (
      (
        await this.db.query<Admin>(
          "SELECT CAST(id AS CHAR) AS id, auth_uid, display_name FROM admin_allowlist WHERE auth_uid = ? AND enabled = 1 AND is_deleted = 0 LIMIT 1",
          [uid],
        )
      )[0] ?? null
    );
  }
  async insert(input: AdminInsert): Promise<string> {
    return (
      await this.db.execute(
        "INSERT INTO admin_allowlist(auth_uid,display_name,enabled) VALUES(?,?,?)",
        [input.auth_uid, input.display_name, input.enabled],
      )
    ).insertId;
  }
  async findById(id: string): Promise<AdminRow | null> {
    return (
      (
        await this.db.query<AdminRow>(
          `SELECT ${columns} FROM admin_allowlist WHERE id=? AND is_deleted=0 LIMIT 1`,
          [id],
        )
      )[0] ?? null
    );
  }
  async findByAuthUid(uid: string): Promise<AdminRow | null> {
    return (
      (
        await this.db.query<AdminRow>(
          `SELECT ${columns} FROM admin_allowlist WHERE auth_uid=? AND is_deleted=0 LIMIT 1`,
          [uid],
        )
      )[0] ?? null
    );
  }
  async list(
    filter: { enabled?: boolean } = {},
    limit = 50,
    offset = 0,
  ): Promise<readonly AdminRow[]> {
    const params: SqlParameter[] = [];
    let where = "is_deleted=0";
    if (filter.enabled !== undefined) {
      where += " AND enabled=?";
      params.push(filter.enabled);
    }
    return this.db.query<AdminRow>(
      `SELECT ${columns} FROM admin_allowlist WHERE ${where} ORDER BY id LIMIT ? OFFSET ?`,
      [...params, ...page(limit, offset)],
    );
  }
  async update(id: string, input: AdminUpdate): Promise<number> {
    return (
      await this.db.execute(
        "UPDATE admin_allowlist SET display_name=?,enabled=?,updated_at=UTC_TIMESTAMP() WHERE id=? AND is_deleted=0",
        [input.display_name, input.enabled, id],
      )
    ).affectedRows;
  }
  async softDelete(id: string): Promise<number> {
    return (
      await this.db.execute(
        "UPDATE admin_allowlist SET is_deleted=1,updated_at=UTC_TIMESTAMP() WHERE id=? AND is_deleted=0",
        [id],
      )
    ).affectedRows;
  }
}
