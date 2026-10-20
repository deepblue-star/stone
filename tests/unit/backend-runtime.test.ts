import { afterEach, describe, expect, it, vi } from 'vitest';
import { resolveTrustedIdentity } from '../../cloudfunctions/business-api/src/identity';
import { main } from '../../cloudfunctions/business-api/src';
import { createMysqlDatabase } from '../../packages/backend/src/db/mysql';

afterEach(() => { vi.unstubAllEnvs(); vi.restoreAllMocks(); });

describe('trusted runtime identity', () => {
  it('uses WeChat OPENID as WeChat identity without promoting it to admin UID', () => {
    expect(resolveTrustedIdentity({ getWechatContext: () => ({ OPENID: 'wx-user' }), getCloudBaseUserInfo: () => ({ uid: 'also-present' }) })).toEqual({ kind: 'wechat', openid: 'wx-user' });
  });
  it('accepts CloudBase UID only from the server SDK identity reader', () => {
    expect(resolveTrustedIdentity({ getWechatContext: () => ({}), getCloudBaseUserInfo: () => ({ uid: 'platform-uid' }) })).toEqual({ kind: 'web', uid: 'platform-uid' });
  });
  it('rejects anonymous CloudBase identities even if a UID exists', () => {
    expect(resolveTrustedIdentity({ getWechatContext: () => ({}), getCloudBaseUserInfo: () => ({ uid: 'anonymous-uid', isAnonymous: true }) })).toEqual({ kind: 'anonymous' });
  });
  it('does not turn a CloudBase OpenID into a Web UID', () => {
    expect(resolveTrustedIdentity({ getWechatContext: () => ({}), getCloudBaseUserInfo: () => ({ openId: 'wx-only' }) })).toEqual({ kind: 'wechat', openid: 'wx-only' });
  });
  it('does not promote a WeChat caller to Web admin when only the Node SDK exposes OpenID', () => {
    expect(resolveTrustedIdentity({ getWechatContext: () => ({}), getCloudBaseUserInfo: () => ({ uid: 'wx-linked-uid', openId: 'wx-openid' }) })).toEqual({ kind: 'wechat', openid: 'wx-openid' });
  });
  it('unknown actions work with no CloudBase environment or DB credentials', async () => {
    vi.stubEnv('STONE_ENV_ID', '');
    vi.stubEnv('MYSQL_USER', '');
    vi.stubEnv('MYSQL_PASSWORD', '');
    const logger = vi.spyOn(console, 'info').mockImplementation(() => undefined);
    expect(await main({ action: 'unimplemented', payload: {}, uid: 'spoof' }, { request_id: 'runtime-request' })).toMatchObject({ ok: false, code: 'INVALID_ARGUMENT', request_id: 'runtime-request' });
    expect(logger).toHaveBeenCalledTimes(1);
  });
  it('creating an unconfigured database performs no connection or credential validation', async () => {
    const database = createMysqlDatabase({});
    await expect(database.end()).resolves.toBeUndefined();
    await expect(database.query('SELECT 1')).rejects.toThrow('Missing database configuration');
  });
});
