import type { EntityId } from "../../../contracts/src";
import type { DatabaseExecutor, SqlParameter } from "../db/database";
import { page } from "./sql";
export interface PointsLedger {
  id: EntityId;
  account_id: EntityId;
  points_delta: string;
  balance_after: string;
  source_type: string;
  event_key: string;
  source_ref: string | null;
  description: string;
}
export type PointsLedgerInsert = Omit<PointsLedger, "id">;
export interface PointsLedgerFilter {
  sourceType?: string;
  sourceRef?: string;
}
const columns =
  "CAST(id AS CHAR) AS id, CAST(account_id AS CHAR) AS account_id, CAST(points_delta AS CHAR) AS points_delta, CAST(balance_after AS CHAR) AS balance_after, source_type, event_key, source_ref, description";
function filterSql(
  account: string,
  filter: PointsLedgerFilter,
): [string, SqlParameter[]] {
  let where = "account_id=? AND is_deleted=0";
  const params: SqlParameter[] = [account];
  if (filter.sourceType !== undefined) {
    where += " AND source_type=?";
    params.push(filter.sourceType);
  }
  if (filter.sourceRef !== undefined) {
    where += " AND source_ref=?";
    params.push(filter.sourceRef);
  }
  return [where, params];
}
export class PointsLedgerDAO {
  constructor(private readonly db: DatabaseExecutor) {}
  async findByEventKey(key: string): Promise<PointsLedger | null> {
    return (
      (
        await this.db.query<PointsLedger>(
          `SELECT ${columns} FROM points_ledger WHERE event_key = ? AND is_deleted = 0 LIMIT 1`,
          [key],
        )
      )[0] ?? null
    );
  }
  async insert(input: PointsLedgerInsert): Promise<EntityId> {
    return (
      await this.db.execute(
        "INSERT INTO points_ledger (account_id, points_delta, balance_after, source_type, event_key, source_ref, description) VALUES (?, ?, ?, ?, ?, ?, ?)",
        [
          input.account_id,
          input.points_delta,
          input.balance_after,
          input.source_type,
          input.event_key,
          input.source_ref,
          input.description,
        ],
      )
    ).insertId;
  }
  async listByAccount(
    account: string,
    filter: PointsLedgerFilter = {},
    limit = 50,
    offset = 0,
  ): Promise<readonly PointsLedger[]> {
    const [where, params] = filterSql(account, filter);
    return this.db.query<PointsLedger>(
      `SELECT ${columns} FROM points_ledger WHERE ${where} ORDER BY created_at DESC,id DESC LIMIT ? OFFSET ?`,
      [...params, ...page(limit, offset)],
    );
  }
  async sumByAccount(
    account: string,
    filter: PointsLedgerFilter = {},
  ): Promise<string> {
    const [where, params] = filterSql(account, filter);
    return (
      (
        await this.db.query<{ total: string }>(
          `SELECT CAST(COALESCE(SUM(points_delta),0) AS CHAR) AS total FROM points_ledger WHERE ${where}`,
          params,
        )
      )[0]?.total ?? "0"
    );
  }
}
