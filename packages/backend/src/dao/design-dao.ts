import type { DatabaseExecutor, SqlParameter } from "../db/database";
import type { RowMetadata } from "./types";
import { page, placeholders } from "./sql";
export interface DesignRow extends RowMetadata {
  id: string;
  _openid: string;
  name: string;
  current_version_no: number;
}
export interface DesignInsert {
  _openid: string;
  name: string;
  current_version_no: number;
}
export type DesignUpdate = Pick<DesignInsert, "name" | "current_version_no">;
const columns =
  "CAST(id AS CHAR) AS id,_openid,name,current_version_no,created_at,updated_at,is_deleted";
export class DesignDAO {
  constructor(private readonly db: DatabaseExecutor) {}
  async countByOwner(openid: string): Promise<string> { return (await this.db.query<{ count: string }>('SELECT CAST(COUNT(*) AS CHAR) AS count FROM designs WHERE _openid=? AND is_deleted=0', [openid]))[0]?.count ?? '0'; }
  async insert(input: DesignInsert): Promise<string> {
    return (
      await this.db.execute(
        "INSERT INTO designs(_openid,name,current_version_no) VALUES(?,?,?)",
        [input._openid, input.name, input.current_version_no],
      )
    ).insertId;
  }
  async findByOwnerId(
    openid: string,
    id: string,
    lock = false,
  ): Promise<DesignRow | null> {
    return (
      (
        await this.db.query<DesignRow>(
          `SELECT ${columns} FROM designs WHERE _openid=? AND id=? AND is_deleted=0 LIMIT 1${lock ? " FOR UPDATE" : ""}`,
          [openid, id],
        )
      )[0] ?? null
    );
  }
  async findByIds(
    ids: readonly string[],
    openid?: string,
  ): Promise<readonly DesignRow[]> {
    if (!ids.length) return [];
    const params: SqlParameter[] = [...ids];
    if (openid !== undefined) params.push(openid);
    return this.db.query<DesignRow>(
      `SELECT ${columns} FROM designs WHERE id IN (${placeholders(ids)}) AND is_deleted=0${openid !== undefined ? " AND _openid=?" : ""} ORDER BY id`,
      params,
    );
  }
  async listByOwner(
    openid: string,
    limit = 50,
    offset = 0,
  ): Promise<readonly DesignRow[]> {
    return this.db.query<DesignRow>(
      `SELECT ${columns} FROM designs WHERE _openid=? AND is_deleted=0 ORDER BY updated_at DESC,id DESC LIMIT ? OFFSET ?`,
      [openid, ...page(limit, offset)],
    );
  }
  async update(
    openid: string,
    id: string,
    input: DesignUpdate,
  ): Promise<number> {
    return (
      await this.db.execute(
        "UPDATE designs SET name=?,current_version_no=?,updated_at=UTC_TIMESTAMP() WHERE _openid=? AND id=? AND is_deleted=0",
        [input.name, input.current_version_no, openid, id],
      )
    ).affectedRows;
  }
  async softDelete(openid: string, id: string): Promise<number> {
    return (
      await this.db.execute(
        "UPDATE designs SET is_deleted=1,updated_at=UTC_TIMESTAMP() WHERE _openid=? AND id=? AND is_deleted=0",
        [openid, id],
      )
    ).affectedRows;
  }
}
