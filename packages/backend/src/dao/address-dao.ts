import type { DatabaseExecutor } from "../db/database";
import type { RowMetadata } from "./types";
import { page } from "./sql";
export interface AddressFields {
  receiver_name: string;
  phone: string;
  province_code: string;
  province: string;
  city_code: string;
  city: string;
  district_code: string;
  district: string;
  address_line: string;
  is_default: number;
}
export interface AddressInsert extends AddressFields {
  _openid: string;
}
export interface AddressRow extends AddressInsert, RowMetadata {
  id: string;
}
const columns =
  "CAST(id AS CHAR) AS id,_openid,receiver_name,phone,province_code,province,city_code,city,district_code,district,address_line,is_default,created_at,updated_at,is_deleted";
const values = (v: AddressFields) => [
  v.receiver_name,
  v.phone,
  v.province_code,
  v.province,
  v.city_code,
  v.city,
  v.district_code,
  v.district,
  v.address_line,
  v.is_default,
];
export class AddressDAO {
  constructor(private readonly db: DatabaseExecutor) {}
  async insert(input: AddressInsert): Promise<string> {
    return (
      await this.db.execute(
        "INSERT INTO addresses(_openid,receiver_name,phone,province_code,province,city_code,city,district_code,district,address_line,is_default) VALUES(?,?,?,?,?,?,?,?,?,?,?)",
        [input._openid, ...values(input)],
      )
    ).insertId;
  }
  async findByOwnerId(openid: string, id: string): Promise<AddressRow | null> {
    return (
      (
        await this.db.query<AddressRow>(
          `SELECT ${columns} FROM addresses WHERE _openid=? AND id=? AND is_deleted=0 LIMIT 1`,
          [openid, id],
        )
      )[0] ?? null
    );
  }
  async listByOwner(
    openid: string,
    limit = 50,
    offset = 0,
  ): Promise<readonly AddressRow[]> {
    return this.db.query<AddressRow>(
      `SELECT ${columns} FROM addresses WHERE _openid=? AND is_deleted=0 ORDER BY is_default DESC,id DESC LIMIT ? OFFSET ?`,
      [openid, ...page(limit, offset)],
    );
  }
  async findDefault(openid: string): Promise<AddressRow | null> {
    return (
      (
        await this.db.query<AddressRow>(
          `SELECT ${columns} FROM addresses WHERE _openid=? AND is_default=1 AND is_deleted=0 ORDER BY id LIMIT 1`,
          [openid],
        )
      )[0] ?? null
    );
  }
  async update(
    openid: string,
    id: string,
    input: AddressFields,
  ): Promise<number> {
    return (
      await this.db.execute(
        "UPDATE addresses SET receiver_name=?,phone=?,province_code=?,province=?,city_code=?,city=?,district_code=?,district=?,address_line=?,is_default=?,updated_at=UTC_TIMESTAMP() WHERE _openid=? AND id=? AND is_deleted=0",
        [...values(input), openid, id],
      )
    ).affectedRows;
  }
  async clearDefault(openid: string): Promise<number> {
    return (
      await this.db.execute(
        "UPDATE addresses SET is_default=0,updated_at=UTC_TIMESTAMP() WHERE _openid=? AND is_deleted=0",
        [openid],
      )
    ).affectedRows;
  }
  async setDefault(openid: string, id: string): Promise<number> {
    return (
      await this.db.execute(
        "UPDATE addresses SET is_default=1,updated_at=UTC_TIMESTAMP() WHERE _openid=? AND id=? AND is_deleted=0",
        [openid, id],
      )
    ).affectedRows;
  }
  async softDelete(openid: string, id: string): Promise<number> {
    return (
      await this.db.execute(
        "UPDATE addresses SET is_deleted=1,updated_at=UTC_TIMESTAMP() WHERE _openid=? AND id=? AND is_deleted=0",
        [openid, id],
      )
    ).affectedRows;
  }
}
