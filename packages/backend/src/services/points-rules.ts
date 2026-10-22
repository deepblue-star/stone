import type { TrustedIdentity } from '../../../contracts/src/index';
import { AppError, isRecord } from '../errors';
import { id, integer, iso } from '../catalog/rules';
export const pointsSources = ['DAILY_CHECK_IN', 'REFERRAL_FIRST_COMPLETED_ORDER', 'POINTS_EXCHANGE', 'POINTS_EXCHANGE_REFUND'] as const;
export const couponStatuses = ['AVAILABLE', 'LOCKED', 'USED', 'REFUNDED'] as const;
export function requireWechat(identity: TrustedIdentity): string { if (identity.kind !== 'wechat' || !identity.openid.trim() || identity.openid.length > 64) throw new AppError('UNAUTHORIZED', '请在微信小程序中登录'); return identity.openid; }
export function checkedPoints(value: bigint): string { if (value < 0n || value > 18446744073709551615n) throw new AppError('CONFLICT', '积分超出账户范围'); return value.toString(); }
export function shanghaiDate(now: Date): string { return new Date(now.getTime() + 8 * 3600_000).toISOString().slice(0, 10); }
export { iso };
const shapes: Record<string, readonly string[]> = { getPointsCenter: [], dailyCheckIn: [], getMyInviteInfo: [], getProfileSummary: [], getMyAvailableSkuCoupons: [], listMyPointsLedger: ['page_token','page_size'], listPointsExchangeSkus: ['category_id','page_token','page_size'], listMySkuCoupons: ['status','page_token','page_size'], exchangePointsForSkuCoupon: ['exchange_key','sku_id'], bindReferrer: ['invite_code','bind_channel'] };
export function validatePointsPayload(action: string, payload: unknown): Record<string, unknown> {
  const fields = shapes[action];
  if (!fields || !isRecord(payload) || fields.some(key => !(key in payload)) || Object.keys(payload).some(key => !fields.includes(key) && !(action === 'listMyPointsLedger' && (key === 'source_type' || key === 'direction')))) throw new AppError('INVALID_ARGUMENT', '请求字段无效');
  for (const [key, value] of Object.entries(payload)) {
    let valid = true;
    if (key === 'page_size') valid = integer(value, 1, 100);
    if (key === 'page_token') valid = value === null || (typeof value === 'string' && value.length > 0 && value.length <= 2048);
    if (key === 'category_id') valid = value === null || id(value);
    if (key === 'sku_id') valid = id(value);
    if (key === 'exchange_key') valid = typeof value === 'string' && /^[A-Za-z0-9_-]{1,96}$/.test(value);
    if (key === 'invite_code') valid = typeof value === 'string' && /^[A-Z0-9]{4}$/.test(value);
    if (key === 'bind_channel') valid = value === 'SHARE_PATH' || value === 'MANUAL_CODE';
    if (key === 'status') valid = value === null || couponStatuses.some(status => status === value);
    if (key === 'source_type') valid = value === null || pointsSources.some(source => source === value);
    if (key === 'direction') valid = value === null || value === 'EARN' || value === 'SPEND';
    if (!valid) throw new AppError('INVALID_ARGUMENT', `${key}格式无效`);
  }
  return payload;
}
