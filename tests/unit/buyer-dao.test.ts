import { describe, expect, it } from 'vitest';
import { createDaos } from '../../packages/backend/src/dao/index';
import type { SqlParameter } from '../../packages/backend/src/db/database';
describe('buyer historical and address SQL', () => {
  it('batch-reads historical material rows including deleted ancestors without changing public readers', async () => {
    const calls: { sql: string; params: readonly SqlParameter[] }[] = [];
    const d = createDaos({ query: async <T>(sql: string, params: readonly SqlParameter[] = []) => { calls.push({ sql, params }); return [] as T[]; }, execute: async () => ({ insertId: '1', affectedRows: 1 }) });
    for (const dao of [d.skus, d.items, d.categories]) {
      await dao.findHistoricalByIds([]); expect(calls).toHaveLength(0);
      await dao.findHistoricalByIds(['1','2']); const call = calls.pop()!; expect(call.sql).toMatch(/IN \(\?,\?\)/); expect(call.sql).not.toMatch(/is_deleted=0/); expect(call.params).toEqual(['1','2']);
    }
  });
  it('clears default upon owner-scoped deletion and orders addresses by latest update', async () => {
    const calls: { sql: string; params: readonly SqlParameter[] }[] = [];
    const d = createDaos({ query: async <T>(sql: string, params: readonly SqlParameter[] = []) => { calls.push({ sql, params }); return [] as T[]; }, execute: async (sql, params = []) => { calls.push({ sql, params }); return { insertId: '1', affectedRows: 1 }; } });
    await d.addresses.softDelete('owner','1'); expect(calls[0]).toMatchObject({ params: ['owner','1'] }); expect(calls[0]!.sql).toContain('SET is_deleted=1,is_default=0'); expect(calls[0]!.sql).toContain('WHERE _openid=? AND id=? AND is_deleted=0');
    await d.addresses.listByOwner('owner'); expect(calls[1]!.sql).toContain('ORDER BY is_default DESC,updated_at DESC,id DESC');
  });
});
