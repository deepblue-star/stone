import { expect, it, vi } from 'vitest';
import { PaymentReconciliationIssueDAO } from '../../packages/backend/src/dao/payment-reconciliation-issue-dao';
import type { DatabaseExecutor, SqlParameter } from '../../packages/backend/src/db/database';
it('filters admin issue rows by bill date in one parameterized join before pagination', async () => {
  const query = vi.fn(async (_sql: string, _params: readonly SqlParameter[]) => []);
  const dao = new PaymentReconciliationIssueDAO({ query } as unknown as DatabaseExecutor);
  await dao.listForAdmin({ billDate: '2026-10-21', issueType: 'OTHER', resolutionStatus: 'OPEN' }, 21);
  expect(query).toHaveBeenCalledWith(expect.stringContaining('JOIN payment_reconciliation_runs'), ['2026-10-21', 'OTHER', 'OPEN', 21]);
  const sql = query.mock.calls[0]?.[0];
  expect(sql).toContain('r.bill_date=?'); expect(sql).toContain('i.is_deleted=0'); expect(sql).toContain('r.is_deleted=0'); expect(sql).not.toContain('2026-10-21');
});
it('uses stable created-time/id boundaries and excludes deleted runs from the OPEN count', async () => {
  const query = vi.fn(async (_sql: string, _params: readonly SqlParameter[]) => []);
  const dao = new PaymentReconciliationIssueDAO({ query } as unknown as DatabaseExecutor);
  const createdAt = new Date('2026-10-21T13:00:00Z');
  await dao.listForAdmin({}, 21, { createdAt, id: '3' });
  expect(query).toHaveBeenCalledWith(expect.stringContaining('i.created_at < ? OR (i.created_at = ? AND i.id < ?)'), [createdAt, createdAt, '3', 21]);
  expect(query.mock.calls[0]?.[0]).not.toContain('OFFSET');
  await dao.countUnresolved();
  expect(query.mock.calls[1]?.[0]).toContain('JOIN payment_reconciliation_runs');
  expect(query.mock.calls[1]?.[0]).toContain('r.is_deleted=0');
});
