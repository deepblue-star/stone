/** Development-only: rewrite the existing points rules unchanged, then verify audit and rejection paths. */
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import cloudbase from '@cloudbase/js-sdk';
import type { SiteConfig } from '../../packages/contracts/src/index';
import { ENV_ID, tcbSql } from '../../scripts/lib/tcb-sql';

async function main() {
  process.loadEnvFile('.env.local');
  const login = JSON.parse(await readFile('.local/merchant-login.json', 'utf8')) as { environment: string; username: string; password: string };
  assert.equal(login.environment, ENV_ID);
  const app = cloudbase.init({ env: ENV_ID, region: 'ap-shanghai', accessKey: process.env.VITE_PUBLISHABLE_KEY, auth: { detectSessionInUrl: false } });
  async function call<T>(action: string, payload: object) {
    const response = await app.callFunction({ name: 'business-api', data: { action, payload } });
    return response.result as { ok: boolean; code: string; data: T; request_id: string };
  }
  try {
    const signedIn = await app.auth.signInWithPassword({ username: login.username, password: login.password });
    assert(!signedIn.error, 'Development merchant sign-in failed');
    const session = await app.auth.getSession();
    const uid = session.data.session?.user?.id;
    assert(uid && !session.data.session?.user?.is_anonymous, 'Verified merchant session required');
    const before = await call<SiteConfig>('getSiteConfig', { config_key: 'points_rules' });
    assert(before.ok, 'Existing points rules must be readable');
    const saved = await call<SiteConfig>('updateSiteConfig', { config_key: 'points_rules', config_value: before.data.config_value });
    assert(saved.ok && saved.code === 'OK', 'Update must succeed');
    assert.deepEqual(saved.data.config_value, before.data.config_value, 'Existing business rules must remain unchanged');
    const bad = await call('updateSiteConfig', { config_key: 'points_rules', config_value: { daily_check_in_points: 20, referral_first_completed_order_points: 50, private_key: 'invalid-fixture' } });
    assert(!bad.ok && bad.code === 'INVALID_ARGUMENT', 'Credential-shaped extras must be rejected');
    const after = await call<SiteConfig>('getSiteConfig', { config_key: 'points_rules' });
    assert(after.ok);
    assert.deepEqual(after.data.config_value, before.data.config_value, 'Rejected update must not change stored rules');
    const audit = await tcbSql<{ updated_by: string }>("SELECT updated_by FROM site_config WHERE config_key='points_rules' AND is_deleted=0 LIMIT 1");
    assert.equal(audit[0]?.updated_by, uid, 'Audit actor must match authenticated administrator');
    console.log(JSON.stringify({ environment: ENV_ID, key: 'points_rules', valuesUnchanged: true, auditActorMatches: true, saveRequestId: saved.request_id, rejectionRequestId: bad.request_id, readRequestId: after.request_id }));
  } finally { await app.auth.signOut(); }
}
main().then(() => process.exit(0), () => { console.error('Live site-config verification failed; raw credentials and responses suppressed'); process.exit(1); });
