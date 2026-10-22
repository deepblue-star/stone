import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import cloudbase, { type IContextParam } from '@cloudbase/node-sdk';
import { resolveInvocationIdentity } from '../../cloudfunctions/business-api/src/identity';
import { createBusinessApi } from '../../cloudfunctions/business-api/src/app';
import type { SiteConfigService } from '../../packages/backend/src/services/site-config-service';

function context(environment: Record<string, string>) {
  return { memory_limit_in_mb: 128, time_limit_in_ms: 1000, request_id: 'synthetic-request', function_version: 'test', function_name: 'test', namespace: 'test', environment: JSON.stringify(environment) };
}
function readers() {
  const auth = cloudbase.init({ env: 'synthetic-environment' }).auth();
  return { getWechatContext: () => ({}), getCloudBaseUserInfo: () => auth.getUserInfo(), parseInvocationContext: (value: unknown) => cloudbase.parseContext(value as IContextParam) };
}
beforeEach(() => {
  for (const key of ['TCB_UUID', 'TCB_CONTEXT_KEYS', 'WX_CONTEXT_KEYS', 'WX_OPENID', 'TCB_ISANONYMOUS_USER']) vi.stubEnv(key, '');
});
afterEach(() => vi.unstubAllEnvs());
describe('SDK invocation context identity', () => {
  it('reads the official SDK environment context when process-only auth has no UID', () => {
    const sdk = readers();
    expect(sdk.getCloudBaseUserInfo().uid).toBe('');
    expect(resolveInvocationIdentity(context({ TCB_UUID: 'synthetic-admin', TCB_ISANONYMOUS_USER: 'false' }), sdk)).toEqual({ kind: 'web', uid: 'synthetic-admin' });
  });
  it('preserves anonymous rejection and WeChat priority from contextual SDK values', () => {
    expect(resolveInvocationIdentity(context({ TCB_UUID: 'synthetic-anonymous', TCB_ISANONYMOUS_USER: 'true' }), readers())).toEqual({ kind: 'anonymous' });
    expect(resolveInvocationIdentity(context({ TCB_UUID: 'synthetic-web', WX_OPENID: 'synthetic-wechat' }), readers())).toEqual({ kind: 'wechat', openid: 'synthetic-wechat' });
    expect(resolveInvocationIdentity(context({ TCB_UUID: 'synthetic-web' }), { ...readers(), getWechatContext: () => ({ OPENID: 'synthetic-wx-sdk' }) })).toEqual({ kind: 'web', uid: 'synthetic-web' });
  });
  it('uses ambient SDK only without an invocation envelope and rejects malformed envelopes', () => {
    const sdk = { ...readers(), getCloudBaseUserInfo: () => ({ uid: 'synthetic-fallback', isAnonymous: false }) };
    expect(resolveInvocationIdentity({}, sdk)).toEqual({ kind: 'web', uid: 'synthetic-fallback' });
    expect(resolveInvocationIdentity({ environment: '[broken' }, sdk)).toEqual({ kind: 'anonymous' });
    expect(resolveInvocationIdentity(context({}), sdk)).toEqual({ kind: 'anonymous' });
  });
  it('binds context per invocation and ignores spoofed event, payload and context UID fields', async () => {
    const api = createBusinessApi({
      siteConfigService: {} as SiteConfigService,
      actionRegistry: new Map([['probe', { validate: () => ({}), run: async (_payload, resolveIdentity) => resolveIdentity() }]]),
      resolveIdentity: async invocation => resolveInvocationIdentity(invocation, readers()), log() {},
    });
    const a = { ...context({ TCB_UUID: 'synthetic-a' }), uid: 'spoofed' };
    const b = context({ TCB_UUID: 'synthetic-b' });
    const results = await Promise.all([api({ action: 'probe', payload: { uid: 'spoofed' }, uid: 'spoofed' }, a), api({ action: 'probe', payload: {} }, b)]);
    expect(results[0]).toMatchObject({ ok: true, data: { kind: 'web', uid: 'synthetic-a' } });
    expect(results[1]).toMatchObject({ ok: true, data: { kind: 'web', uid: 'synthetic-b' } });
  });
  it('does not inherit a previous native caller from process variables on a warm instance', () => {
    vi.stubEnv('WX_CONTEXT_KEYS', 'WX_OPENID');
    vi.stubEnv('WX_OPENID', 'synthetic-previous-wechat');
    vi.stubEnv('TCB_CONTEXT_KEYS', 'TCB_UUID');
    vi.stubEnv('TCB_UUID', 'synthetic-previous-web');
    const sdk = readers();
    expect(resolveInvocationIdentity(context({ TCB_UUID: 'synthetic-current-web', TCB_ISANONYMOUS_USER: 'false' }), sdk)).toEqual({ kind: 'web', uid: 'synthetic-current-web' });
    expect(resolveInvocationIdentity(context({ WX_OPENID: 'synthetic-current-wechat' }), sdk)).toEqual({ kind: 'wechat', openid: 'synthetic-current-wechat' });
    expect(resolveInvocationIdentity(context({}), sdk)).toEqual({ kind: 'anonymous' });
  });
  it('rejects present but empty or wrongly typed invocation envelopes without ambient fallback', () => {
    const sdk = { ...readers(), getCloudBaseUserInfo: () => ({ uid: 'synthetic-stale-admin', isAnonymous: false }) };
    for (const malformed of [{ environment: {} }, { environment: '' }, { environment: null }, { environ: {} }, { environ: '' }, { environ: null }]) {
      expect(resolveInvocationIdentity(malformed, sdk)).toEqual({ kind: 'anonymous' });
    }
    expect(resolveInvocationIdentity({}, sdk)).toEqual({ kind: 'web', uid: 'synthetic-stale-admin' });
  });
});
