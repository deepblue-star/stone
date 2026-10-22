import type { EntityId } from "../../../contracts/src/index";
import type { DatabaseExecutor, SqlParameter } from "../db/database";
import { page } from "./sql";
import { auditTimeConditions, type AdminAuditCursor, type AdminAuditTimeFilter } from './admin-audit-query';
export interface AdminPointsLedgerFilter extends AdminAuditTimeFilter { openid?: string; sourceType?: string }
export interface AdminPointsLedgerRow extends Omit<PointsLedger, 'event_key'> { _openid: string | null }
export interface PointsLedger {
  id: EntityId;
  account_id: EntityId;
  points_delta: string;
  balance_after: string;
  source_type: string;
  event_key: string;
  source_ref: string | null;
  description: string;
  created_at: Date | string;
}
export type PointsLedgerInsert = Omit<PointsLedger, "id" | "created_at">;
export interface PointsLedgerFilter {
  direction?: 'EARN' | 'SPEND';
  sourceType?: string;
  sourceRef?: string;
}
const columns =
  "CAST(id AS CHAR) AS id, CAST(account_id AS CHAR) AS account_id, CAST(points_delta AS CHAR) AS points_delta, CAST(balance_after AS CHAR) AS balance_after, source_type, event_key, source_ref, description, created_at";
function filterSql(
  account: string,
  filter: PointsLedgerFilter,
): [string, SqlParameter[]] {
  let where = "account_id=? AND is_deleted=0";
  const params: SqlParameter[] = [account];
  if (filter.direction === 'EARN') where += ' AND points_delta>0';
  if (filter.direction === 'SPEND') where += ' AND points_delta<0';
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
  async listForAdmin(filter: AdminPointsLedgerFilter, limit: number, before?: AdminAuditCursor): Promise<readonly AdminPointsLedgerRow[]> {
    let where = 'l.is_deleted=0';
    const params: SqlParameter[] = [];
    if (filter.openid !== undefined) { where += ' AND a._openid=?'; params.push(filter.openid); }
    if (filter.sourceType !== undefined) { where += ' AND l.source_type=?'; params.push(filter.sourceType); }
    where += auditTimeConditions('l', filter, before, params);
    return this.db.query<AdminPointsLedgerRow>(`SELECT CAST(l.id AS CHAR) AS id,CAST(l.account_id AS CHAR) AS account_id,a._openid,CAST(l.points_delta AS CHAR) AS points_delta,CAST(l.balance_after AS CHAR) AS balance_after,l.source_type,l.source_ref,l.description,l.created_at FROM points_ledger l LEFT JOIN points_accounts a ON a.id=l.account_id WHERE ${where} ORDER BY l.created_at DESC,l.id DESC LIMIT ?`, [...params, limit]);
  }
  async findByEventKey(key: string, lock = false): Promise<PointsLedger | null> {
    return (
      (
        await this.db.query<PointsLedger>(
          `SELECT ${columns} FROM points_ledger WHERE event_key = ? AND is_deleted = 0 LIMIT 1${lock ? ' FOR UPDATE' : ''}`,
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
