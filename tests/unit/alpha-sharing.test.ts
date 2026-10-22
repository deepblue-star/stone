import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { expect, it, vi } from 'vitest';
interface MiniApp { onLaunch(options?: object): void; onShow(options?: object): Promise<void>; [key: string]: unknown }
function appFixture() {
  let app: MiniApp; const storage = new Map<string, unknown>();
  const request = vi.fn(async (_action: string, _payload: object) => ({ data: { bound: true } }));
  const login = vi.fn(), init = vi.fn();
  runInNewContext(readFileSync('miniprogram/app.js', 'utf8'), { App(value: MiniApp) { app = value; }, require(path: string) { if (path === './config') return { envId: 'dev-env' }; if (path === './services/api') return { request }; throw new Error(path); }, wx: { cloud: { init }, login, getStorageSync: (key: string) => storage.get(key), setStorageSync: (key: string, value: unknown) => storage.set(key,value), removeStorageSync: (key: string) => storage.delete(key), showToast: vi.fn() } });
  return { app: app!, request, login, init, storage };
}
it('uses native CloudBase identity and binds a shared code without caller identity fields', async () => {
  const f = appFixture(); f.app.onLaunch({ query: { ref: 'A7K2' } });
  await f.app.onShow({ query: { ref: 'A7K2' } });
  expect(f.init).toHaveBeenCalledWith({ env: 'dev-env', traceUser: true }); expect(f.login).not.toHaveBeenCalled();
  expect(f.request).toHaveBeenCalledWith('bindReferrer', { invite_code: 'A7K2', bind_channel: 'SHARE_PATH' });
  expect(f.storage.has('stone.pendingInviteCode')).toBe(false);
});
it('ignores malformed share codes and never submits untrusted identity parameters', async () => {
  const f = appFixture(); f.app.onLaunch({}); await f.app.onShow({ query: { ref: 'bad-code', openid: 'spoofed' } }); expect(f.request).not.toHaveBeenCalled();
});
