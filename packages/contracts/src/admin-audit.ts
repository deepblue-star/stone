import type { CouponStatus, PointsPagePayload, PointsSourceType } from './points';

/** Application-specific RFC3339 bounds with timezone and 0–3 fractional digits; resulting UTC year must be 1000–9999 (MySQL DATETIME). OpenID fields are filters only. */
export interface AdminAuditTimeFilters { created_from?: string | null; created_to?: string | null }
export interface AdminPointsLedgerPayload extends PointsPagePayload, AdminAuditTimeFilters { openid?: string | null; source_type?: PointsSourceType | null }
export interface AdminReferralRelationsPayload extends PointsPagePayload, AdminAuditTimeFilters { inviter_openid?: string | null; invitee_openid?: string | null; rewarded?: boolean | null }
export interface AdminSkuCouponsPayload extends PointsPagePayload, AdminAuditTimeFilters { sku_id?: string | null; openid?: string | null; status?: CouponStatus | null }
export interface AdminAuditPage<T> { items: T[]; next_page_token: string | null }
export interface AdminPointsLedgerEntry { ledger_id: string; account_id: string; openid_masked: string | null; points_delta: string; balance_after: string; source_type: string; source_ref: string | null; description: string; created_at: string }
export interface AdminReferralRelation { relation_id: string; inviter_account_id: string; invitee_account_id: string; inviter_openid_masked: string | null; invitee_openid_masked: string | null; bind_channel: 'SHARE_PATH' | 'MANUAL_CODE'; invite_code_snapshot: string; rewarded_order_no: string | null; rewarded_at: string | null; created_at: string }
export interface AdminSkuCoupon { coupon_id: string; account_id: string; openid_masked: string | null; sku_id: string; status: CouponStatus; points_cost_snapshot: number; source_type: string; source_ref: string | null; locked_order_no: string | null; locked_at: string | null; used_order_no: string | null; used_at: string | null; refunded_at: string | null; refund_reason: string | null; created_at: string; current_sku: { item_name: string | null; diameter_mm: number | null; image_file_id: string | null; is_on_sale: boolean; is_deleted: boolean } }
export type AdminPointsLedgerPage = AdminAuditPage<AdminPointsLedgerEntry>;
export type AdminReferralRelationsPage = AdminAuditPage<AdminReferralRelation>;
export interface AdminSkuCouponsPage extends AdminAuditPage<AdminSkuCoupon> { image_urls: Record<string, string> }
