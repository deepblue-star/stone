import type * as C from '../../../../packages/contracts/src/index';
import type { PointsService } from '../../../../packages/backend/src/services/points-service';
import type { ReferralService } from '../../../../packages/backend/src/services/referral-service';
import type { SkuCouponService } from '../../../../packages/backend/src/services/sku-coupon-service';
import type { ProfileService } from '../../../../packages/backend/src/services/profile-service';
export class GetPointsCenterHandler { constructor(private readonly service: PointsService) {} handle(payload: Record<string, never>, identity: C.TrustedIdentity) { return this.service.getPointsCenter(payload, identity); } }
export class DailyCheckInHandler { constructor(private readonly service: PointsService) {} handle(payload: Record<string, never>, identity: C.TrustedIdentity) { return this.service.dailyCheckIn(payload, identity); } }
export class ListMyPointsLedgerHandler { constructor(private readonly service: PointsService) {} handle(payload: C.PointsLedgerPayload, identity: C.TrustedIdentity) { return this.service.listMyPointsLedger(payload, identity); } }
export class ListPointsExchangeSkusHandler { constructor(private readonly service: PointsService) {} handle(payload: C.ExchangeSkusPayload, identity: C.TrustedIdentity) { return this.service.listPointsExchangeSkus(payload, identity); } }
export class ExchangePointsForSkuCouponHandler { constructor(private readonly service: PointsService) {} handle(payload: C.ExchangePointsPayload, identity: C.TrustedIdentity) { return this.service.exchangePointsForSkuCoupon(payload, identity); } }
export class ListMySkuCouponsHandler { constructor(private readonly service: SkuCouponService) {} handle(payload: C.ListSkuCouponsPayload, identity: C.TrustedIdentity) { return this.service.listMySkuCoupons(payload, identity); } }
export class GetMyAvailableSkuCouponsHandler { constructor(private readonly service: SkuCouponService) {} handle(payload: Record<string, never>, identity: C.TrustedIdentity) { return this.service.getMyAvailableSkuCoupons(payload, identity); } }
export class GetMyInviteInfoHandler { constructor(private readonly service: ReferralService) {} handle(payload: Record<string, never>, identity: C.TrustedIdentity) { return this.service.getMyInviteInfo(payload, identity); } }
export class BindReferrerHandler { constructor(private readonly service: ReferralService) {} handle(payload: C.BindReferrerPayload, identity: C.TrustedIdentity) { return this.service.bindReferrer(payload, identity); } }
export class GetProfileSummaryHandler { constructor(private readonly service: ProfileService) {} handle(payload: Record<string, never>, identity: C.TrustedIdentity) { return this.service.getProfileSummary(payload, identity); } }
