import type { TrustedIdentity } from '../../../packages/contracts/src/index';
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
  parseInvocationContext(context: unknown): { environment?: unknown; environ?: unknown };
}
export function resolveInvocationIdentity(context: unknown, readers: ContextIdentityReaders): TrustedIdentity {
  if (!isRecord(context) || !('environment' in context || 'environ' in context)) return resolveTrustedIdentity(readers);
  if (!((typeof context.environment === 'string' && context.environment.length > 0) || (typeof context.environ === 'string' && context.environ.length > 0))) return { kind: 'anonymous' };
  let user: ReturnType<RuntimeIdentityReaders['getCloudBaseUserInfo']>;
  try {
    // Official parseContext reads this invocation only. getCloudbaseContext also merges
    // process.env, which can retain a different caller on a reused function instance.
    const envelope = readers.parseInvocationContext(context);
    const fields = envelope.environment ?? envelope.environ;
    if (!isRecord(fields)) return { kind: 'anonymous' };
    const parsed = fields;
    user = { uid: typeof parsed.TCB_UUID === 'string' ? parsed.TCB_UUID : undefined, openId: typeof parsed.WX_OPENID === 'string' ? parsed.WX_OPENID : undefined, isAnonymous: parsed.TCB_ISANONYMOUS_USER === 'true' };
  } catch {
    return { kind: 'anonymous' };
  }
  return resolveTrustedIdentity({ getWechatContext: () => ({}), getCloudBaseUserInfo: () => user });
}
