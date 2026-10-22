import { randomBytes } from 'node:crypto';
import type * as C from '../../../contracts/src/index';
import type { AdminReconciliationIssueFilter, DaoSet, ReconciliationIssueRow } from '../dao/index';
import { AppError, isRecord } from '../errors';
import { id, integer, iso, PageTokens } from '../catalog/rules';
import type { AdminAccessService } from './admin-access-service';

const types: readonly string[] = ['WECHAT_SUCCESS_LOCAL_PENDING', 'LOCAL_SUCCESS_WECHAT_MISSING', 'AMOUNT_MISMATCH', 'TRANSACTION_ID_MISMATCH', 'OTHER'];
const states: readonly string[] = ['OPEN', 'RESOLVED', 'IGNORED'];
const shapes: Record<string, readonly string[]> = { listPaymentReconciliationIssues: ['resolution_status', 'bill_date', 'issue_type', 'page_token', 'page_size'], getPaymentReconciliationIssue: ['issue_id'], resolvePaymentReconciliationIssue: ['issue_id', 'resolution_status', 'resolution_note'] };
const invalid = (): never => { throw new AppError('INVALID_ARGUMENT', '对账异常请求字段无效'); };
export function validateReconciliationPayload(action: string, value: unknown): Record<string, unknown> {
  const keys = shapes[action];
  if (!keys || !isRecord(value) || Object.keys(value).length !== keys.length || keys.some(key => !Object.prototype.hasOwnProperty.call(value, key))) return invalid();
  for (const [key, field] of Object.entries(value)) {
    if (key === 'issue_id' && !id(field)) return invalid();
    if (key === 'page_size' && !integer(field, 1, 100)) return invalid();
    if (key === 'page_token' && !(field === null || typeof field === 'string' && field.length > 0 && field.length <= 2048)) return invalid();
    if (key === 'issue_type' && !(field === null || typeof field === 'string' && types.includes(field))) return invalid();
    if (key === 'resolution_status' && !(action === 'resolvePaymentReconciliationIssue' ? field === 'RESOLVED' || field === 'IGNORED' : field === null || typeof field === 'string' && states.includes(field))) return invalid();
    if (key === 'resolution_note' && !(typeof field === 'string' && field.trim().length > 0 && field.length <= 500)) return invalid();
    if (key === 'bill_date' && field !== null) {
      if (typeof field !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(field)) return invalid();
      const time = Date.parse(field + 'T00:00:00Z');
      if (!Number.isFinite(time) || new Date(time).toISOString().slice(0, 10) !== field) return invalid();
    }
  }
  return value;
}
export class PaymentReconciliationService {
  private readonly tokens: PageTokens;
  private readonly now: () => Date;
  constructor(private readonly daos: DaoSet, private readonly access: AdminAccessService, options: { tokenSecret?: string | (() => string); now?: () => Date } = {}) {
    this.tokens = new PageTokens(options.tokenSecret ?? randomBytes(32).toString('hex'));
    this.now = options.now ?? (() => new Date());
  }
  private visible(row: ReconciliationIssueRow | null): ReconciliationIssueRow { if (!row || row.is_deleted) throw new AppError('NOT_FOUND', '对账异常不存在'); return row; }
  private async visibleRun(runId: string) {
    const run = await this.daos.reconciliationRuns.findById(runId);
    if (!run || run.is_deleted) throw new AppError('NOT_FOUND', '对账任务不存在');
    return run;
  }
  private summary(row: ReconciliationIssueRow, billDate: string): C.ReconciliationIssueSummary {
    return { issue_id: row.id, bill_date: billDate, issue_type: row.issue_type, order_no: row.order_no, out_trade_no: row.out_trade_no, local_status: row.local_status, wechat_trade_state: row.wechat_trade_state, local_amount_cent: row.local_amount_cent, wechat_amount_cent: row.wechat_amount_cent, resolution_status: row.resolution_status, created_at: iso(row.created_at) };
  }
  async listIssues(payload: unknown, identity: C.TrustedIdentity): Promise<C.ReconciliationIssuePage> {
    const admin = await this.access.requireEnabledAdmin(identity);
    const input = validateReconciliationPayload('listPaymentReconciliationIssues', payload) as unknown as C.ListReconciliationIssuesPayload;
    const scope = JSON.stringify(['reconciliation-issues:keyset-v1', admin.auth_uid, input.resolution_status, input.bill_date, input.issue_type]);
    const cursor = this.tokens.decode(input.page_token, scope);
    if (cursor && (!cursor.time || !Number.isFinite(Date.parse(cursor.time)))) return invalid();
    const before = cursor ? { createdAt: new Date(cursor.time!), id: cursor.id } : undefined;
    const filter: AdminReconciliationIssueFilter = {};
    if (input.bill_date !== null) filter.billDate = input.bill_date;
    if (input.issue_type !== null) filter.issueType = input.issue_type;
    if (input.resolution_status !== null) filter.resolutionStatus = input.resolution_status;
    const [rows, openCount] = await Promise.all([this.daos.reconciliationIssues.listForAdmin(filter, input.page_size + 1, before), this.daos.reconciliationIssues.countUnresolved()]);
    const visible = rows.slice(0, input.page_size); const last = visible.at(-1);
    return { issues: visible.map(row => this.summary(row, row.bill_date)), open_count: openCount, next_page_token: rows.length > input.page_size && last ? this.tokens.encode(scope, { id: last.id, time: iso(last.created_at) }) : null };
  }
  async getIssue(payload: unknown, identity: C.TrustedIdentity): Promise<C.ReconciliationIssueDetail> {
    await this.access.requireEnabledAdmin(identity);
    const input = validateReconciliationPayload('getPaymentReconciliationIssue', payload) as unknown as C.ReconciliationIssuePayload;
    const row = this.visible(await this.daos.reconciliationIssues.findById(BigInt(input.issue_id).toString()));
    const run = await this.visibleRun(row.run_id);
    const payment = await this.daos.payments.findByOutTradeNo(row.out_trade_no) ?? (row.order_id ? await this.daos.payments.findByOrderId(row.order_id) : null);
    const orderId = row.order_id ?? payment?.order_id;
    const order = orderId ? await this.daos.orders.findById(orderId) : null;
    return { ...this.summary(row, run.bill_date), run_id: row.run_id, order_id: row.order_id, transaction_id: row.transaction_id, resolution_note: row.resolution_note, resolved_by: row.resolved_by, resolved_at: row.resolved_at ? iso(row.resolved_at) : null, updated_at: iso(row.updated_at), related_order: order ? { order_no: order.order_no, status: order.status, total_amount_cent: order.total_amount_cent } : null, related_payment: payment ? { out_trade_no: payment.out_trade_no, transaction_id: payment.transaction_id, trade_state: payment.trade_state, success_time: payment.success_time ? iso(payment.success_time) : null } : null };
  }
  async resolveIssue(payload: unknown, identity: C.TrustedIdentity): Promise<C.ReconciliationResolution> {
    const admin = await this.access.requireEnabledAdmin(identity);
    const input = validateReconciliationPayload('resolvePaymentReconciliationIssue', payload) as unknown as C.ResolveReconciliationIssuePayload;
    const issueId = BigInt(input.issue_id).toString(); const note = input.resolution_note.trim();
    let row = this.visible(await this.daos.reconciliationIssues.findById(issueId));
    await this.visibleRun(row.run_id);
    let replay = row.resolution_status !== 'OPEN';
    if (!replay) {
      const affected = await this.daos.reconciliationIssues.updateResolution(issueId, 'OPEN', { resolution_status: input.resolution_status, resolution_note: note, resolved_by: admin.auth_uid, resolved_at: this.now() });
      row = this.visible(await this.daos.reconciliationIssues.findById(issueId));
      replay = affected === 0;
    }
    if (row.resolution_status !== input.resolution_status || row.resolution_note !== note) throw new AppError('ISSUE_ALREADY_RESOLVED', '该异常已处理，请刷新查看处理结果');
    return { issue_id: row.id, resolution_status: row.resolution_status, resolution_note: row.resolution_note, resolved_by: row.resolved_by, resolved_at: row.resolved_at ? iso(row.resolved_at) : null, idempotent_replay: replay };
  }
}
