import type { TrustedIdentity } from '../../../packages/contracts/src/index';
import type { PointsService } from '../../../packages/backend/src/services/points-service';
import type { ReferralService } from '../../../packages/backend/src/services/referral-service';
import type { SkuCouponService } from '../../../packages/backend/src/services/sku-coupon-service';
import type { ProfileService } from '../../../packages/backend/src/services/profile-service';
import { validatePointsPayload } from '../../../packages/backend/src/services/points-rules';
import type { RegisteredAction } from './action-registry';
import * as H from './handlers/points-handlers';
export interface PointsServices { pointsService: PointsService; referralService: ReferralService; profileService: ProfileService; skuCouponService: SkuCouponService }
export function createPointsActions(services: PointsServices): [string, RegisteredAction][] {
  function trusted<P>(action: string, handler: { handle(payload: P, identity: TrustedIdentity): Promise<unknown> }): [string, RegisteredAction] { return [action, { validate: payload => validatePointsPayload(action, payload), async run(payload, resolveIdentity) { return handler.handle(validatePointsPayload(action, payload) as P, await resolveIdentity()); } }]; }
  return [trusted('getPointsCenter', new H.GetPointsCenterHandler(services.pointsService)), trusted('dailyCheckIn', new H.DailyCheckInHandler(services.pointsService)), trusted('listMyPointsLedger', new H.ListMyPointsLedgerHandler(services.pointsService)), trusted('listPointsExchangeSkus', new H.ListPointsExchangeSkusHandler(services.pointsService)), trusted('exchangePointsForSkuCoupon', new H.ExchangePointsForSkuCouponHandler(services.pointsService)), trusted('listMySkuCoupons', new H.ListMySkuCouponsHandler(services.skuCouponService)), trusted('getMyAvailableSkuCoupons', new H.GetMyAvailableSkuCouponsHandler(services.skuCouponService)), trusted('getMyInviteInfo', new H.GetMyInviteInfoHandler(services.referralService)), trusted('bindReferrer', new H.BindReferrerHandler(services.referralService)), trusted('getProfileSummary', new H.GetProfileSummaryHandler(services.profileService))];
}
