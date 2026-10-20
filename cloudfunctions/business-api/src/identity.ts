import type { TrustedIdentity } from '../../../packages/contracts/src';

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
