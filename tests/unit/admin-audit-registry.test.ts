import { existsSync } from 'node:fs';
import { expect, it, vi } from 'vitest';
import { createBusinessApi } from '../../cloudfunctions/business-api/src/app';
import { createDaos } from '../../packages/backend/src/dao/index';
import { AdminAccessService } from '../../packages/backend/src/services/admin-access-service';
import { AdminAuditService } from '../../packages/backend/src/services/admin-audit-service';
import type { DatabaseExecutor, SqlParameter } from '../../packages/backend/src/db/database';
import type { SiteConfigService } from '../../packages/backend/src/services/site-config-service';

it('registers exactly three thin audit actions and forwards trusted identity', async () => {
  expect(existsSync('cloudfunctions/business-api/src/admin-audit-registry.ts')).toBe(true);
  const path = '../../cloudfunctions/business-api/src/admin-audit-registry.ts';
  const { createAdminAuditActions } = await import(path) as typeof import('../../cloudfunctions/business-api/src/admin-audit-registry');
  const service = { listPointsLedger: vi.fn(async () => ({ items: [], next_page_token: null })), listReferralRelations: vi.fn(async () => ({ items: [], next_page_token: null })), listSkuCoupons: vi.fn(async () => ({ items: [], next_page_token: null, image_urls: {} })) } as unknown as AdminAuditService;
  const registry = new Map(createAdminAuditActions(service));
  expect([...registry.keys()]).toEqual(['listAdminPointsLedger', 'listAdminReferralRelations', 'listAdminSkuCoupons']);
  const payload = { page_token: null, page_size: 20 };
  const identity = { kind: 'web' as const, uid: 'test-trusted-admin' };
  for (const action of registry.values()) await action.run(action.validate(payload), async () => identity);
  expect(service.listPointsLedger).toHaveBeenCalledWith(payload, identity);
  expect(service.listReferralRelations).toHaveBeenCalledWith(payload, identity);
  expect(service.listSkuCoupons).toHaveBeenCalledWith(payload, identity);
});
it('wires optional audit service through the API and rejects spoofed identity before audit reads', async () => {
  const calls: string[] = [];
  const db: DatabaseExecutor = { async query<Row>(sql: string, params: readonly SqlParameter[] = []) { calls.push(sql); return (sql.includes('admin_allowlist') && params[0] === 'trusted-admin' ? [{ id: '1', auth_uid: 'trusted-admin', display_name: '测试管理员' }] : []) as Row[]; }, async execute() { throw new Error('audit cannot write'); } };
  const daos = createDaos(db);
  const service = new AdminAuditService(daos, new AdminAccessService(daos.admin), { tokenSecret: 'audit-registry-secret-32-characters' });
  const logs = vi.fn();
  const api = createBusinessApi({ siteConfigService: {} as SiteConfigService, adminAuditService: service, resolveIdentity: async () => ({ kind: 'web', uid: 'trusted-admin' }), log: logs });
  for (const action of ['listAdminPointsLedger', 'listAdminReferralRelations', 'listAdminSkuCoupons']) {
    expect(await api({ action, payload: { page_token: null, page_size: 20 } }, {})).toMatchObject({ ok: true, data: { items: [], next_page_token: null } });
  }
  calls.length = 0;
  expect(await api({ action: 'listAdminPointsLedger', payload: { page_token: null, page_size: 20, uid: 'spoofed-admin' } }, {})).toMatchObject({ ok: false, code: 'INVALID_ARGUMENT' });
  expect(calls).toHaveLength(1); expect(calls[0]).toContain('admin_allowlist');
  const anonymous = createBusinessApi({ siteConfigService: {} as SiteConfigService, adminAuditService: service, resolveIdentity: async () => ({ kind: 'anonymous' }), log: logs });
  calls.length = 0;
  expect(await anonymous({ action: 'listAdminPointsLedger', payload: { uid: 'trusted-admin' } }, {})).toMatchObject({ ok: false, code: 'UNAUTHORIZED' });
  expect(calls).toHaveLength(0);
});
