import type { TrustedIdentity } from '../../../packages/contracts/src';
import { isRecord } from '../../../packages/backend/src/errors';

/** These readers are SDK calls bound to runtime context, never event/context fields. */
export interface RuntimeIdentityReaders {
  getWechatContext(): { OPENID?: string };
  getCloudBaseUserInfo(): { uid?: string; openId?: string; isAnonymous?: boolean };
}
export function resolveTrustedIdentity(readers: RuntimeIdentityReaders): TrustedIdentity {
  const wechat = readers.getWechatContext();
  if (typeof wechat.OPENID === 'string' && wechat.OPENID.length > 0) return { kind: 'wechat', openid: wechat.OPENID };
  const user = readers.getCloudBaseUserInfo();
  if (typeof user.openId === 'string' && user.openId.length > 0) return { kind: 'wechat', openid: user.openId };
  if (!user.isAnonymous && typeof user.uid === 'string' && user.uid.length > 0) return { kind: 'web', uid: user.uid };
  return { kind: 'anonymous' };
}
export interface ContextIdentityReaders extends RuntimeIdentityReaders {
  getCloudBaseContext(context: unknown): { TCB_UUID?: string; WX_OPENID?: string; TCB_ISANONYMOUS_USER?: string };
}
export function resolveInvocationIdentity(context: unknown, readers: ContextIdentityReaders): TrustedIdentity {
  if (!isRecord(context) || !((typeof context.environment === 'string' && context.environment.length > 0) || (typeof context.environ === 'string' && context.environ.length > 0))) return resolveTrustedIdentity(readers);
  let user: ReturnType<RuntimeIdentityReaders['getCloudBaseUserInfo']>;
  try {
    // Official node-sdk 3.18.7 getCloudbaseContext(context) parses environment/environ;
    // getUserInfo() omits that argument and can miss request-local caller fields.
    const parsed = readers.getCloudBaseContext(context);
    user = { uid: parsed.TCB_UUID, openId: parsed.WX_OPENID, isAnonymous: parsed.TCB_ISANONYMOUS_USER === 'true' };
  } catch {
    // Unsupported/malformed runtime context retains the original SDK reader path.
    return resolveTrustedIdentity(readers);
  }
  return resolveTrustedIdentity({ getWechatContext: () => readers.getWechatContext(), getCloudBaseUserInfo: () => user });
}
