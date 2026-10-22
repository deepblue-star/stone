/** Read-only business checks on the named development environment. Never print identities or signed URLs. */
import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import cloudbase from '@cloudbase/js-sdk';
import type { AdminPointsLedgerPage, AdminReferralRelationsPage, AdminSkuCouponsPage } from '../../packages/contracts/src';
import { ENV_ID } from '../../scripts/lib/tcb-sql';

async function main() {
  process.loadEnvFile('.env.local');
  const login = JSON.parse(await readFile('.local/merchant-login.json', 'utf8')) as { environment: string; username: string; password: string };
  assert.equal(login.environment, ENV_ID);
  const app = cloudbase.init({ env: ENV_ID, region: 'ap-shanghai', accessKey: process.env.VITE_PUBLISHABLE_KEY, auth: { detectSessionInUrl: false } });
  const checks: { action: string; code: string; count?: number; request_id: string }[] = [];
  async function call<T>(action: string, payload: object, expected = 'OK'): Promise<T> {
    const response = await app.callFunction({ name: 'business-api', data: { action, payload } });
    const result = response.result as { ok: boolean; code: string; data: T; request_id: string };
    assert.equal(result.code, expected, 'Audit action returned an unexpected status');
    assert.equal(result.ok, expected === 'OK');
    checks.push({ action, code: result.code, count: result.data && typeof result.data === 'object' && 'items' in result.data && Array.isArray(result.data.items) ? result.data.items.length : undefined, request_id: result.request_id });
    return result.data;
  }
  try {
    assert(!(await app.auth.signInWithPassword({ username: login.username, password: login.password })).error);
    const ledger = await call<AdminPointsLedgerPage>('listAdminPointsLedger', { page_token: null, page_size: 1 });
    assert(ledger.items.length > 0, 'Existing development member events required');
    for (const row of ledger.items) { assert.equal(typeof row.points_delta, 'string'); assert.equal(typeof row.balance_after, 'string'); assert(!('openid' in row) && !('_openid' in row)); }
    let disjointPageIds: boolean | null = null;
    if (ledger.next_page_token) {
      const next = await call<AdminPointsLedgerPage>('listAdminPointsLedger', { page_token: ledger.next_page_token, page_size: 1 });
      disjointPageIds = next.items.every(row => !ledger.items.some(first => first.ledger_id === row.ledger_id)); assert(disjointPageIds);
      await call('listAdminPointsLedger', { source_type: 'REFERRAL_FIRST_COMPLETED_ORDER', page_token: ledger.next_page_token, page_size: 1 }, 'INVALID_ARGUMENT');
    }
    await call('listAdminPointsLedger', { uid: 'untrusted-filter', page_token: null, page_size: 20 }, 'INVALID_ARGUMENT');
    const empty = await call<AdminPointsLedgerPage>('listAdminPointsLedger', { created_from: '2099-01-01T00:00:00Z', page_token: null, page_size: 20 }); assert.equal(empty.items.length, 0);
    const referrals = await call<AdminReferralRelationsPage>('listAdminReferralRelations', { rewarded: false, page_token: null, page_size: 20 });
    assert(referrals.items.every(row => row.rewarded_order_no === null && !('inviter_openid' in row) && !('invitee_openid' in row)));
    const coupons = await call<AdminSkuCouponsPage>('listAdminSkuCoupons', { status: 'AVAILABLE', page_token: null, page_size: 20 });
    assert(coupons.items.length > 0, 'Existing real development exchange required');
    const imageIds = new Set(coupons.items.map(row => row.current_sku.image_file_id).filter(Boolean));
    assert(Object.keys(coupons.image_urls).every(id => imageIds.has(id)));
    assert(coupons.items.every(row => row.status === 'AVAILABLE' && !('openid' in row) && !('_openid' in row)));
    const sku = coupons.items[0]!.sku_id;
    const filtered = await call<AdminSkuCouponsPage>('listAdminSkuCoupons', { sku_id: '000' + sku, status: 'AVAILABLE', page_token: null, page_size: 20 }); assert(filtered.items.every(row => row.sku_id === sku));
    const result = { environment: ENV_ID, businessReadOnly: true, disjointPageIds, maskedRowsOnly: true, referralRowCount: referrals.items.length, availableCouponCount: coupons.items.length, checks };
    await writeFile('.local/admin-audit-live-results.json', JSON.stringify(result, null, 2));
    console.log(JSON.stringify({ environment: ENV_ID, businessReadOnly: true, checkCount: checks.length, disjointPageIds, maskedRowsOnly: true, referralRowCount: referrals.items.length, availableCouponCount: coupons.items.length }));
  } finally { await app.auth.signOut(); }
}
main().then(() => process.exit(0), () => { console.error('Live audit verification failed; raw credentials and responses suppressed'); process.exit(1); });
