import type { DatabaseExecutor } from "../db/database";
import type { RowMetadata } from "./types";
import { page, placeholders } from "./sql";
export interface CartTarget {
  item_type: "DESIGN" | "STANDARD";
  sku_id: string | null;
  design_version_id: string | null;
}
export interface CartInsert extends CartTarget {
  _openid: string;
  quantity: number;
}
export interface CartRow extends CartInsert, RowMetadata {
  id: string;
}
const columns =
  "CAST(id AS CHAR) AS id,_openid,item_type,CAST(sku_id AS CHAR) AS sku_id,CAST(design_version_id AS CHAR) AS design_version_id,quantity,created_at,updated_at,is_deleted";
export class CartDAO {
  constructor(private readonly db: DatabaseExecutor) {}
  async insert(input: CartInsert): Promise<string> {
    return (
      await this.db.execute(
        "INSERT INTO cart_items(_openid,item_type,sku_id,design_version_id,quantity) VALUES(?,?,?,?,?)",
        [
          input._openid,
          input.item_type,
          input.sku_id,
          input.design_version_id,
          input.quantity,
        ],
      )
    ).insertId;
  }
  async findByOwnerId(
    openid: string,
    id: string,
    lock = false,
  ): Promise<CartRow | null> {
    return (
      (
        await this.db.query<CartRow>(
          `SELECT ${columns} FROM cart_items WHERE _openid=? AND id=? AND is_deleted=0 LIMIT 1${lock ? " FOR UPDATE" : ""}`,
          [openid, id],
        )
      )[0] ?? null
    );
  }
  async listByOwner(
    openid: string,
    limit = 50,
    offset = 0,
  ): Promise<readonly CartRow[]> {
    return this.db.query<CartRow>(
      `SELECT ${columns} FROM cart_items WHERE _openid=? AND is_deleted=0 ORDER BY created_at DESC,id DESC LIMIT ? OFFSET ?`,
      [openid, ...page(limit, offset)],
    );
  }
  async findSelected(
    openid: string,
    ids: readonly string[],
    lock = false,
  ): Promise<readonly CartRow[]> {
    if (!ids.length) return [];
    return this.db.query<CartRow>(
      `SELECT ${columns} FROM cart_items WHERE _openid=? AND id IN (${placeholders(ids)}) AND is_deleted=0 ORDER BY id${lock ? " FOR UPDATE" : ""}`,
      [openid, ...ids],
    );
  }
  async findTarget(
    openid: string,
    target: CartTarget,
    includeDeleted = false,
    lock = false,
  ): Promise<CartRow | null> {
    return (
      (
        await this.db.query<CartRow>(
          `SELECT ${columns} FROM cart_items WHERE _openid=? AND item_type=? AND sku_id <=> ? AND design_version_id <=> ?${includeDeleted ? "" : " AND is_deleted=0"} ORDER BY is_deleted,id LIMIT 1${lock ? " FOR UPDATE" : ""}`,
          [openid, target.item_type, target.sku_id, target.design_version_id],
        )
      )[0] ?? null
    );
  }
  async updateQuantity(
    openid: string,
    id: string,
    quantity: number,
  ): Promise<number> {
    return (
      await this.db.execute(
        "UPDATE cart_items SET quantity=?,updated_at=UTC_TIMESTAMP() WHERE _openid=? AND id=? AND is_deleted=0",
        [quantity, openid, id],
      )
    ).affectedRows;
  }
  async restore(openid: string, id: string, quantity: number): Promise<number> {
    return (
      await this.db.execute(
        "UPDATE cart_items SET is_deleted=0,quantity=?,updated_at=UTC_TIMESTAMP() WHERE _openid=? AND id=? AND is_deleted=1",
        [quantity, openid, id],
      )
    ).affectedRows;
  }
  async softDelete(openid: string, id: string): Promise<number> {
    return (
      await this.db.execute(
        "UPDATE cart_items SET is_deleted=1,updated_at=UTC_TIMESTAMP() WHERE _openid=? AND id=? AND is_deleted=0",
        [openid, id],
      )
    ).affectedRows;
  }
  async softDeleteMany(
    openid: string,
    ids: readonly string[],
  ): Promise<number> {
    if (!ids.length) return 0;
    return (
      await this.db.execute(
        `UPDATE cart_items SET is_deleted=1,updated_at=UTC_TIMESTAMP() WHERE _openid=? AND id IN (${placeholders(ids)}) AND is_deleted=0`,
        [openid, ...ids],
      )
    ).affectedRows;
  }
}
