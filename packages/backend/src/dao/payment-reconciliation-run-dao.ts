import type { DatabaseExecutor, SqlParameter } from "../db/database";
import type { RowMetadata, Timestamp } from "./types";
import { page } from "./sql";
export type ReconciliationRunStatus =
  | "RUNNING"
  | "SUCCESS"
  | "PARTIAL"
  | "FAILED";
export interface ReconciliationRunInsert {
  bill_date: string;
  status: ReconciliationRunStatus;
  started_at: Timestamp;
}
export interface ReconciliationRunUpdate {
  status: ReconciliationRunStatus;
  total_count: number;
  matched_count: number;
  issue_count: number;
  started_at: Timestamp;
  finished_at: Timestamp | null;
  error_message: string | null;
}
export interface ReconciliationRunRow
  extends ReconciliationRunInsert,
    RowMetadata {
  id: string;
  total_count: number;
  matched_count: number;
  issue_count: number;
  finished_at: Timestamp | null;
  error_message: string | null;
}
export interface ReconciliationRunFilter {
  status?: ReconciliationRunStatus;
  billDate?: string;
}
const columns =
  "CAST(id AS CHAR) AS id,CAST(bill_date AS CHAR) AS bill_date,status,total_count,matched_count,issue_count,started_at,finished_at,error_message,created_at,updated_at,is_deleted";
export class PaymentReconciliationRunDAO {
  constructor(private readonly db: DatabaseExecutor) {}
  async insert(v: ReconciliationRunInsert): Promise<string> {
    return (
      await this.db.execute(
        "INSERT INTO payment_reconciliation_runs(bill_date,status,started_at) VALUES(?,?,?)",
        [v.bill_date, v.status, v.started_at],
      )
    ).insertId;
  }
  async findById(
    id: string,
    lock = false,
  ): Promise<ReconciliationRunRow | null> {
    return (
      (
        await this.db.query<ReconciliationRunRow>(
          `SELECT ${columns} FROM payment_reconciliation_runs WHERE id=? AND is_deleted=0 LIMIT 1${lock ? " FOR UPDATE" : ""}`,
          [id],
        )
      )[0] ?? null
    );
  }
  async findByBillDate(
    date: string,
    lock = false,
  ): Promise<ReconciliationRunRow | null> {
    return (
      (
        await this.db.query<ReconciliationRunRow>(
          `SELECT ${columns} FROM payment_reconciliation_runs WHERE bill_date=? AND is_deleted=0 LIMIT 1${lock ? " FOR UPDATE" : ""}`,
          [date],
        )
      )[0] ?? null
    );
  }
  async list(
    filter: ReconciliationRunFilter = {},
    limit = 50,
    offset = 0,
  ): Promise<readonly ReconciliationRunRow[]> {
    let where = "is_deleted=0";
    const params: SqlParameter[] = [];
    if (filter.status !== undefined) {
      where += " AND status=?";
      params.push(filter.status);
    }
    if (filter.billDate !== undefined) {
      where += " AND bill_date=?";
      params.push(filter.billDate);
    }
    return this.db.query<ReconciliationRunRow>(
      `SELECT ${columns} FROM payment_reconciliation_runs WHERE ${where} ORDER BY bill_date DESC,id DESC LIMIT ? OFFSET ?`,
      [...params, ...page(limit, offset)],
    );
  }
  async updateState(
    id: string,
    expected: ReconciliationRunStatus,
    v: ReconciliationRunUpdate,
  ): Promise<number> {
    return (
      await this.db.execute(
        "UPDATE payment_reconciliation_runs SET status=?,total_count=?,matched_count=?,issue_count=?,started_at=?,finished_at=?,error_message=?,updated_at=UTC_TIMESTAMP() WHERE id=? AND status=? AND is_deleted=0",
        [
          v.status,
          v.total_count,
          v.matched_count,
          v.issue_count,
          v.started_at,
          v.finished_at,
          v.error_message,
          id,
          expected,
        ],
      )
    ).affectedRows;
  }
}
