import { describe, expect, it } from 'vitest';
import { createBusinessApi } from '../../cloudfunctions/business-api/src/app';
import { SiteConfigService } from '../../packages/backend/src/services/site-config-service';
import { AdminAccessService } from '../../packages/backend/src/services/admin-access-service';
import { SiteConfigDAO, AdminDAO, createDaos } from '../../packages/backend/src/dao';
import { mysqlPoolOptions } from '../../packages/backend/src/db/mysql';
import { jsonSafe, type SiteConfigKey } from '../../packages/contracts/src';
import type { DatabaseExecutor, SqlParameter } from '../../packages/backend/src/db/database';
import type { SiteConfigRecord } from '../../packages/backend/src/dao';

const rows: SiteConfigRecord[] = [
  { config_key: 'home_banners', config_value: [{ image_file_id: 'cloud://banner', link_type: 'PAGE', link_value: '/pages/design/index', sort_order: 20, secret: 'filtered' }, { image_file_id: 'cloud://first', link_type: 'NONE', link_value: '', sort_order: 1 }] },
  { config_key: 'customer_service', config_value: { wechat_id: 'service', qr_file_id: 'cloud://qr', internal_token: 'filtered' } },
  { config_key: 'feature_entries', config_value: [{ key: 'DIY', enabled: true, private: 'filtered' }] },
];

function fixture(configRows: readonly SiteConfigRecord[] = rows, admin = true) {
  const queries: { sql: string; params: readonly SqlParameter[] }[] = [];
  const db: DatabaseExecutor = {
    async query<T>(sql: string, params: readonly SqlParameter[] = []): Promise<readonly T[]> {
      queries.push({ sql, params });
      const result = sql.includes('admin_allowlist') ? (admin ? [{ id: '9007199254740993', auth_uid: 'trusted', display_name: 'Admin' }] : []) : configRows.filter(row => params.includes(row.config_key));
      return result as unknown as readonly T[];
    },
    async execute() { return { affectedRows: 1, insertId: '9007199254740993' }; },
  };
  const service = new SiteConfigService(new SiteConfigDAO(db), new AdminAccessService(new AdminDAO(db)));
  const logs: unknown[] = [];
  const api = createBusinessApi({ siteConfigService: service, resolveIdentity: async () => ({ kind: 'web', uid: 'trusted' }), log: entry => logs.push(entry) });
  return { api, service, db, queries, logs };
}

describe('business-api foundation', () => {
  it('returns only validated public fields, ordered banners and fixed SQL keys', async () => {
    const { api, queries } = fixture();
    const response = await api({ action: 'getPublicSiteConfig', payload: {} }, { request_id: 'request-1' });
    expect(response).toMatchObject({ ok: true, code: 'OK', request_id: 'request-1', data: { banners: [{ image_file_id: 'cloud://first', link_type: 'NONE', link_value: '', sort_order: 1 }, { image_file_id: 'cloud://banner', link_type: 'PAGE', link_value: '/pages/design/index', sort_order: 20 }], customer_service: { wechat_id: 'service', qr_file_id: 'cloud://qr' }, feature_entries: [{ key: 'DIY', enabled: true }] } });
    expect(JSON.stringify(response)).not.toContain('filtered');
    expect(queries).toHaveLength(1);
    expect(queries[0]?.params).toEqual(['home_banners', 'customer_service', 'feature_entries']);
    expect(queries[0]?.sql).toMatch(/is_deleted\s*=\s*0/);
  });

  it('uses safe defaults for missing public config', async () => {
    expect(await fixture([]).service.getPublicSiteConfig()).toEqual({ banners: [], customer_service: null, feature_entries: [] });
  });

  it.each([
    { action: 'missing', payload: {} },
    { action: 'getPublicSiteConfig', payload: { config_key: 'payment_rules' } },
    { action: 'getPublicSiteConfig', payload: [] },
    { action: 'getPublicSiteConfig' },
    { action: 'getSiteConfig', payload: { config_key: 'password' } },
    { action: 'getSiteConfig', payload: { config_key: 'home_banners', uid: 'spoof' } },
    null,
  ])('rejects invalid request before identity or DAO access: %j', async request => {
    const { service, queries } = fixture();
    let identityCalls = 0;
    const api = createBusinessApi({ siteConfigService: service, resolveIdentity: async () => { identityCalls++; throw new Error('should not read identity'); }, log() {} });
    expect(await api(request, {})).toMatchObject({ ok: false, code: 'INVALID_ARGUMENT', data: null });
    expect(identityCalls).toBe(0);
    expect(queries).toHaveLength(0);
  });

  it('does not read platform identity for public config', async () => {
    const { service } = fixture();
    const api = createBusinessApi({ siteConfigService: service, resolveIdentity: async () => { throw new Error('auth not configured'); }, log() {} });
    expect(await api({ action: 'getPublicSiteConfig', payload: {} }, {})).toMatchObject({ ok: true });
  });

  it.each([{ kind: 'anonymous' as const }, { kind: 'wechat' as const, openid: 'trusted' }])('rejects admin access from non-Web identity: %j', async identity => {
    const { service, queries } = fixture();
    const api = createBusinessApi({ siteConfigService: service, resolveIdentity: async () => identity, log() {} });
    const result = await api({ action: 'getSiteConfig', payload: { config_key: 'home_banners' }, uid: 'trusted', OPENID: 'trusted' }, { uid: 'trusted', auth: { uid: 'trusted' } });
    expect(result).toMatchObject({ ok: false, code: 'UNAUTHORIZED' });
    expect(queries).toHaveLength(0);
  });

  it('requires enabled admin in the service and returns config to authorized UID', async () => {
    const { api, queries } = fixture();
    expect(await api({ action: 'getSiteConfig', payload: { config_key: 'home_banners' } }, {})).toMatchObject({ ok: true, data: { config_key: 'home_banners' } });
    expect(queries[0]?.sql).toMatch(/enabled\s*=\s*1/);
    expect(queries[0]?.sql).toMatch(/is_deleted\s*=\s*0/);
    expect(queries[0]?.params).toEqual(['trusted']);
    expect(await fixture(rows, false).api({ action: 'getSiteConfig', payload: { config_key: 'home_banners' } }, {})).toMatchObject({ ok: false, code: 'FORBIDDEN' });
    expect(await fixture([]).api({ action: 'getSiteConfig', payload: { config_key: 'home_banners' } }, {})).toMatchObject({ ok: false, code: 'NOT_FOUND' });
  });

  it('enforces the key allowlist inside the service as well as the handler', async () => {
    const { service, queries } = fixture();
    await expect(service.getSiteConfig('private_credentials' as SiteConfigKey, { kind: 'web', uid: 'trusted' })).rejects.toMatchObject({ code: 'INVALID_ARGUMENT' });
    expect(queries).toHaveLength(0);
  });

  it('admin reads return complete editable JSON with an ISO UTC timestamp', async () => {
    const { api } = fixture([{ config_key: 'points_rules', config_value: '{"daily_check_in_points":5,"referral_first_completed_order_points":100}', updated_at: new Date('2026-10-21T04:00:00Z') }]);
    expect(await api({ action: 'getSiteConfig', payload: { config_key: 'points_rules' } }, {})).toMatchObject({ ok: true, data: { config_key: 'points_rules', config_value: { daily_check_in_points: 5, referral_first_completed_order_points: 100 }, updated_at: '2026-10-21T04:00:00.000Z' } });
  });

  it.each([
    { config_key: 'home_banners', config_value: [{ image_file_id: 'cloud://image', link_type: 'EXEC', link_value: 'javascript:secret', sort_order: 1 }] },
    { config_key: 'customer_service', config_value: { wechat_id: 5, qr_file_id: 'cloud://qr' } },
    { config_key: 'feature_entries', config_value: [{ key: 'DIY', enabled: 'true' }] },
    { config_key: 'home_banners', config_value: '{broken JSON SECRET' },
  ])('rejects malformed database config safely: %j', async row => {
    const result = await fixture([row]).api({ action: 'getPublicSiteConfig', payload: {} }, {});
    expect(result).toMatchObject({ ok: false, code: 'CONFIG_INVALID', data: null });
    expect(JSON.stringify(result)).not.toContain('SECRET');
  });

  it('sanitizes unexpected errors and logs only known metadata', async () => {
    const { service, logs } = fixture();
    const api = createBusinessApi({ siteConfigService: service, resolveIdentity: async () => { throw new Error('SQL password=SECRET'); }, log: entry => logs.push(entry) });
    const result = await api({ action: 'getSiteConfig', payload: { config_key: 'home_banners' }, token: 'SECRET' }, { request_id: 'safe-id', secret: 'SECRET' });
    expect(result).toMatchObject({ ok: false, code: 'INTERNAL_ERROR', data: null, request_id: 'safe-id' });
    expect(JSON.stringify({ result, logs })).not.toContain('SECRET');
    expect(Object.keys(logs[0] as object).sort()).toEqual(['action', 'code', 'durationMs', 'requestId']);
  });

  it('uses generated request IDs and serializes BIGINT and dates safely', async () => {
    const result = await fixture().api({ action: 'missing', payload: {} }, {});
    expect(result.request_id).toMatch(/^[a-f0-9-]{36}$/);
    expect(jsonSafe({ id: 9007199254740993n, at: new Date('2026-10-21T00:00:00Z') })).toEqual({ id: '9007199254740993', at: '2026-10-21T00:00:00.000Z' });
  });

  it('keeps SQL parameterized and skips empty findByKeys', async () => {
    const { db, queries } = fixture();
    const dao = new SiteConfigDAO(db);
    await dao.findByKey("x' OR 1=1");
    expect(queries[0]?.sql).not.toContain("x' OR");
    expect(queries[0]?.params).toEqual(["x' OR 1=1"]);
    expect(await dao.findByKeys([])).toEqual([]);
    expect(queries).toHaveLength(1);
    expect(Object.keys(createDaos(db))).toEqual(['siteConfig', 'admin', 'pointsAccounts', 'pointsLedger', 'categories', 'items', 'skus', 'designs', 'designVersions', 'cart', 'addresses', 'orders', 'orderItems', 'payments', 'reconciliationRuns', 'reconciliationIssues', 'reservations', 'inventoryMovements', 'referrals', 'skuCoupons']);
  });
});

describe('mysql configuration', () => {
  const env = { MYSQL_HOST: '127.0.0.1', MYSQL_PORT: '3306', MYSQL_DATABASE: 'test', MYSQL_USER: 'test', MYSQL_PASSWORD: 'secret', MYSQL_CONNECTION_LIMIT: '5' };
  it('requires explicit credentials and validates connection settings', () => {
    expect(() => mysqlPoolOptions({})).toThrow();
    expect(() => mysqlPoolOptions({ ...env, MYSQL_PORT: '3306oops' })).toThrow();
    expect(() => mysqlPoolOptions({ ...env, MYSQL_CONNECTION_LIMIT: '0' })).toThrow();
    expect(mysqlPoolOptions(env)).toMatchObject({ timezone: 'Z', supportBigNumbers: true, bigNumberStrings: true, decimalNumbers: false, multipleStatements: false, connectionLimit: 5 });
  });
});
