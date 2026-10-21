import type { DatabaseExecutor } from "../db/database";
import type { RowMetadata } from "./types";
import { page, placeholders } from "./sql";
export interface DesignVersionRow extends RowMetadata {
  id: string;
  design_id: string;
  version_no: number;
  components: unknown;
  thumbnail_file_id: string | null;
}
export interface DesignVersionInsert {
  design_id: string;
  version_no: number;
  components: unknown;
  thumbnail_file_id: string | null;
}
const columns =
  "CAST(id AS CHAR) AS id,CAST(design_id AS CHAR) AS design_id,version_no,components,thumbnail_file_id,created_at,updated_at,is_deleted";
export class DesignVersionDAO {
  constructor(private readonly db: DatabaseExecutor) {}
  async insert(input: DesignVersionInsert): Promise<string> {
    return (
      await this.db.execute(
        "INSERT INTO design_versions(design_id,version_no,components,thumbnail_file_id) VALUES(?,?,?,?)",
        [
          input.design_id,
          input.version_no,
          JSON.stringify(input.components),
          input.thumbnail_file_id,
        ],
      )
    ).insertId;
  }
  async findById(id: string): Promise<DesignVersionRow | null> {
    return (
      (
        await this.db.query<DesignVersionRow>(
          `SELECT ${columns} FROM design_versions WHERE id=? AND is_deleted=0 LIMIT 1`,
          [id],
        )
      )[0] ?? null
    );
  }
  async findByIds(
    ids: readonly string[],
  ): Promise<readonly DesignVersionRow[]> {
    if (!ids.length) return [];
    return this.db.query<DesignVersionRow>(
      `SELECT ${columns} FROM design_versions WHERE id IN (${placeholders(ids)}) AND is_deleted=0 ORDER BY id`,
      ids,
    );
  }
  async findByDesignVersion(
    designId: string,
    version: number,
  ): Promise<DesignVersionRow | null> {
    return (
      (
        await this.db.query<DesignVersionRow>(
          `SELECT ${columns} FROM design_versions WHERE design_id=? AND version_no=? AND is_deleted=0 LIMIT 1`,
          [designId, version],
        )
      )[0] ?? null
    );
  }
  async listByDesign(
    designId: string,
    limit = 50,
    offset = 0,
  ): Promise<readonly DesignVersionRow[]> {
    return this.db.query<DesignVersionRow>(
      `SELECT ${columns} FROM design_versions WHERE design_id=? AND is_deleted=0 ORDER BY version_no DESC,id DESC LIMIT ? OFFSET ?`,
      [designId, ...page(limit, offset)],
    );
  }
}
