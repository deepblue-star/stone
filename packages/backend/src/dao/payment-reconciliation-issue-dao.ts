import type { DatabaseExecutor, SqlParameter } from "../db/database";
import type { RowMetadata, Timestamp } from "./types";
import { page } from "./sql";
export type ReconciliationIssueType =
  | "WECHAT_SUCCESS_LOCAL_PENDING"
  | "LOCAL_SUCCESS_WECHAT_MISSING"
  | "AMOUNT_MISMATCH"
  | "TRANSACTION_ID_MISMATCH"
  | "OTHER";
export type ResolutionStatus = "OPEN" | "RESOLVED" | "IGNORED";
export interface ReconciliationIssueInsert {
  run_id: string;
  issue_type: ReconciliationIssueType;
  order_id: string | null;
  order_no: string | null;
  out_trade_no: string;
  transaction_id: string | null;
  local_status: string | null;
  wechat_trade_state: string | null;
  local_amount_cent: string | null;
  wechat_amount_cent: string | null;
}
export interface ReconciliationResolution {
  resolution_status: ResolutionStatus;
  resolution_note: string | null;
  resolved_by: string | null;
  resolved_at: Timestamp | null;
}
export interface ReconciliationIssueRow
  extends ReconciliationIssueInsert,
    ReconciliationResolution,
    RowMetadata {
  id: string;
}
export interface ReconciliationIssueFilter {
  runId?: string;
  issueType?: ReconciliationIssueType;
  resolutionStatus?: ResolutionStatus;
  orderId?: string;
  outTradeNo?: string;
}
const columns =
  "CAST(id AS CHAR) AS id,CAST(run_id AS CHAR) AS run_id,issue_type,CAST(order_id AS CHAR) AS order_id,order_no,out_trade_no,transaction_id,local_status,wechat_trade_state,CAST(local_amount_cent AS CHAR) AS local_amount_cent,CAST(wechat_amount_cent AS CHAR) AS wechat_amount_cent,resolution_status,resolution_note,resolved_by,resolved_at,created_at,updated_at,is_deleted";
export class PaymentReconciliationIssueDAO {
  constructor(private readonly db: DatabaseExecutor) {}
  async insert(v: ReconciliationIssueInsert): Promise<string> {
    return (
      await this.db.execute(
        "INSERT INTO payment_reconciliation_issues(run_id,issue_type,order_id,order_no,out_trade_no,transaction_id,local_status,wechat_trade_state,local_amount_cent,wechat_amount_cent) VALUES(?,?,?,?,?,?,?,?,?,?)",
        [
          v.run_id,
          v.issue_type,
          v.order_id,
          v.order_no,
          v.out_trade_no,
          v.transaction_id,
          v.local_status,
          v.wechat_trade_state,
          v.local_amount_cent,
          v.wechat_amount_cent,
        ],
      )
    ).insertId;
  }
  async findById(id: string): Promise<ReconciliationIssueRow | null> {
    return (
      (
        await this.db.query<ReconciliationIssueRow>(
          `SELECT ${columns} FROM payment_reconciliation_issues WHERE id=? AND is_deleted=0 LIMIT 1`,
          [id],
        )
      )[0] ?? null
    );
  }
  async list(
    filter: ReconciliationIssueFilter = {},
    limit = 50,
    offset = 0,
  ): Promise<readonly ReconciliationIssueRow[]> {
    let where = "is_deleted=0";
    const params: SqlParameter[] = [];
    if (filter.runId !== undefined) {
      where += " AND run_id=?";
      params.push(filter.runId);
    }
    if (filter.issueType !== undefined) {
      where += " AND issue_type=?";
      params.push(filter.issueType);
    }
    if (filter.resolutionStatus !== undefined) {
      where += " AND resolution_status=?";
      params.push(filter.resolutionStatus);
    }
    if (filter.orderId !== undefined) {
      where += " AND order_id=?";
      params.push(filter.orderId);
    }
    if (filter.outTradeNo !== undefined) {
      where += " AND out_trade_no=?";
      params.push(filter.outTradeNo);
    }
    return this.db.query<ReconciliationIssueRow>(
      `SELECT ${columns} FROM payment_reconciliation_issues WHERE ${where} ORDER BY created_at DESC,id DESC LIMIT ? OFFSET ?`,
      [...params, ...page(limit, offset)],
    );
  }
  async countUnresolved(runId?: string): Promise<string> {
    return (
      (
        await this.db.query<{ count: string }>(
          `SELECT CAST(COUNT(*) AS CHAR) AS count FROM payment_reconciliation_issues WHERE resolution_status=? AND is_deleted=0${runId !== undefined ? " AND run_id=?" : ""}`,
          runId !== undefined ? ["OPEN", runId] : ["OPEN"],
        )
      )[0]?.count ?? "0"
    );
  }
  async updateResolution(
    id: string,
    expected: ResolutionStatus,
    v: ReconciliationResolution,
  ): Promise<number> {
    return (
      await this.db.execute(
        "UPDATE payment_reconciliation_issues SET resolution_status=?,resolution_note=?,resolved_by=?,resolved_at=?,updated_at=UTC_TIMESTAMP() WHERE id=? AND resolution_status=? AND is_deleted=0",
        [
          v.resolution_status,
          v.resolution_note,
          v.resolved_by,
          v.resolved_at,
          id,
          expected,
        ],
      )
    ).affectedRows;
  }
}
