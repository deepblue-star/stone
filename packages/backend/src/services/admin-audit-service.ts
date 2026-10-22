import type * as C from '../../../contracts/src/index';
import type { AdminSkuCouponRow, DaoSet } from '../dao/index';
import type { AdminAuditCursor, AdminAuditTimeFilter } from '../dao/admin-audit-query';
import { id, integer, iso, PageTokens } from '../catalog/rules';
import { noImageUrls, selectedImages, type ImageUrlResolver } from '../catalog/images';
import { AppError, isRecord } from '../errors';
import type { AdminAccessService } from './admin-access-service';

export type AdminAuditAction = 'listAdminPointsLedger' | 'listAdminReferralRelations' | 'listAdminSkuCoupons';
const fields: Record<AdminAuditAction, readonly string[]> = {
  listAdminPointsLedger: ['openid', 'source_type'],
  listAdminReferralRelations: ['inviter_openid', 'invitee_openid', 'rewarded'],
  listAdminSkuCoupons: ['sku_id', 'openid', 'status'],
};
const sources: readonly string[] = ['DAILY_CHECK_IN', 'REFERRAL_FIRST_COMPLETED_ORDER', 'POINTS_EXCHANGE', 'POINTS_EXCHANGE_REFUND'];
const statuses: readonly string[] = ['AVAILABLE', 'LOCKED', 'USED', 'REFUNDED'];
const invalid = (): never => { throw new AppError('INVALID_ARGUMENT', '管理审计查询参数无效'); };
/** RFC3339 with 0–3 fractional digits; preserve milliseconds and require UTC years 1000–9999 for MySQL DATETIME. */
function instant(value: unknown): string {
  if (typeof value !== 'string') return invalid();
  const match = /^(\d{4})-(\d{2})-(\d{2})[Tt](\d{2}):(\d{2}):(\d{2})(?:\.\d{1,3})?(?:[Zz]|([+-])(\d{2}):(\d{2}))$/.exec(value);
  if (!match) return invalid();
  const year = Number(match[1]), month = Number(match[2]), day = Number(match[3]);
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  if (month < 1 || month > 12 || day < 1 || day > days[month - 1]! || Number(match[4]) > 23 || Number(match[5]) > 59 || Number(match[6]) > 59 || Number(match[8] ?? 0) > 23 || Number(match[9] ?? 0) > 59) return invalid();
  const time = Date.parse(value);
  if (!Number.isFinite(time)) return invalid();
  const date = new Date(time);
  if (date.getUTCFullYear() < 1000 || date.getUTCFullYear() > 9999) return invalid();
  return date.toISOString();
}
export function validateAdminAuditPayload(action: AdminAuditAction, payload: unknown): Record<string, unknown> {
  const allowed = [...fields[action], 'page_token', 'page_size', 'created_from', 'created_to'];
  if (!isRecord(payload) || ![Object.prototype, null].includes(Object.getPrototypeOf(payload) as object | null) || Object.keys(payload).some(key => !allowed.includes(key)) || !Object.hasOwn(payload, 'page_token') || !Object.hasOwn(payload, 'page_size')) return invalid();
  if (!integer(payload.page_size, 1, 100) || !(payload.page_token === null || typeof payload.page_token === 'string' && payload.page_token.length > 0 && payload.page_token.length <= 2048)) return invalid();
  const normalized: Record<string, unknown> = { page_token: payload.page_token, page_size: payload.page_size };
  for (const key of allowed.filter(key => key !== 'page_token' && key !== 'page_size')) {
    const value = payload[key];
    if (value === undefined || value === null) { normalized[key] = null; continue; }
    if (key.endsWith('openid')) {
      if (typeof value !== 'string' || value.trim().length < 1 || value.trim().length > 128) return invalid();
      normalized[key] = value.trim();
    } else if (key === 'sku_id') { if (!id(value)) return invalid(); normalized[key] = BigInt(value).toString(); }
    else if (key === 'rewarded') { if (typeof value !== 'boolean') return invalid(); normalized[key] = value; }
    else if (key === 'source_type' || key === 'status') { if (typeof value !== 'string' || !(key === 'status' ? statuses : sources).includes(value)) return invalid(); normalized[key] = value; }
    else normalized[key] = instant(value);
  }
  if (typeof normalized.created_from === 'string' && typeof normalized.created_to === 'string' && normalized.created_from > normalized.created_to) return invalid();
  return normalized;
}
const masked = (openid: string | null): string | null => openid === null ? null : openid.length > 8 ? `${openid.slice(0, 4)}****${openid.slice(-4)}` : '****';
const sqlInstant = (time: string): string => time.replace('T', ' ').replace('Z', '');
const nullableTime = (time: Date | string | null): string | null => time === null ? null : iso(time);

export class AdminAuditService {
  private readonly tokens: PageTokens;
  private readonly images: ImageUrlResolver;
  constructor(private readonly daos: DaoSet, private readonly access: AdminAccessService, options: { tokenSecret: string | (() => string); images?: ImageUrlResolver }) {
    this.tokens = new PageTokens(options.tokenSecret);
    this.images = options.images ?? noImageUrls;
  }
  private timeFilter(p: C.AdminAuditTimeFilters): AdminAuditTimeFilter {
    return { ...(p.created_from ? { createdFrom: sqlInstant(p.created_from) } : {}), ...(p.created_to ? { createdTo: sqlInstant(p.created_to) } : {}) };
  }
  private cursor(token: string | null, scope: string): AdminAuditCursor | undefined {
    const cursor = this.tokens.decode(token, scope);
    if (!cursor) return undefined;
    if (cursor.time === undefined) return invalid();
    return { createdAt: sqlInstant(instant(cursor.time)), id: cursor.id };
  }
  private next<Row extends { id: string; created_at: Date | string }>(rows: readonly Row[], size: number, scope: string): string | null {
    const last = rows[size - 1];
    return rows.length > size && last ? this.tokens.encode(scope, { id: last.id, time: iso(last.created_at) }) : null;
  }
  private currentSku(row: AdminSkuCouponRow): C.AdminSkuCoupon['current_sku'] {
    if (row.sku_is_deleted === null || row.item_is_deleted === null) return { item_name: null, diameter_mm: null, image_file_id: null, is_on_sale: false, is_deleted: true };
    return { item_name: row.item_name, diameter_mm: row.diameter_mm === null ? null : Number(row.diameter_mm), image_file_id: row.image_file_id, is_on_sale: row.sku_is_on_sale === 1 && row.item_is_on_sale === 1, is_deleted: row.sku_is_deleted !== 0 || row.item_is_deleted !== 0 };
  }
  async listPointsLedger(payload: unknown, identity: C.TrustedIdentity): Promise<C.AdminPointsLedgerPage> {
    const admin = await this.access.requireEnabledAdmin(identity);
    const p = validateAdminAuditPayload('listAdminPointsLedger', payload) as unknown as C.AdminPointsLedgerPayload;
    const filter = { ...(p.openid ? { openid: p.openid } : {}), ...(p.source_type ? { sourceType: p.source_type } : {}), ...this.timeFilter(p) };
    const scope = JSON.stringify(['admin-audit:ledger:keyset-v1', admin.auth_uid, filter]);
    const rows = await this.daos.pointsLedger.listForAdmin(filter, p.page_size + 1, this.cursor(p.page_token, scope));
    return { items: rows.slice(0, p.page_size).map(row => ({ ledger_id: row.id, account_id: row.account_id, openid_masked: masked(row._openid), points_delta: row.points_delta, balance_after: row.balance_after, source_type: row.source_type, source_ref: row.source_ref, description: row.description, created_at: iso(row.created_at) })), next_page_token: this.next(rows, p.page_size, scope) };
  }
  async listReferralRelations(payload: unknown, identity: C.TrustedIdentity): Promise<C.AdminReferralRelationsPage> {
    const admin = await this.access.requireEnabledAdmin(identity);
    const p = validateAdminAuditPayload('listAdminReferralRelations', payload) as unknown as C.AdminReferralRelationsPayload;
    const filter = { ...(p.inviter_openid ? { inviterOpenid: p.inviter_openid } : {}), ...(p.invitee_openid ? { inviteeOpenid: p.invitee_openid } : {}), ...(typeof p.rewarded === 'boolean' ? { rewarded: p.rewarded } : {}), ...this.timeFilter(p) };
    const scope = JSON.stringify(['admin-audit:referrals:keyset-v1', admin.auth_uid, filter]);
    const rows = await this.daos.referrals.listForAdmin(filter, p.page_size + 1, this.cursor(p.page_token, scope));
    return { items: rows.slice(0, p.page_size).map(row => ({ relation_id: row.id, inviter_account_id: row.inviter_account_id, invitee_account_id: row.invitee_account_id, inviter_openid_masked: masked(row.inviter_openid), invitee_openid_masked: masked(row.invitee_openid), bind_channel: row.bind_channel, invite_code_snapshot: row.invite_code_snapshot, rewarded_order_no: row.rewarded_order_no, rewarded_at: nullableTime(row.rewarded_at), created_at: iso(row.created_at) })), next_page_token: this.next(rows, p.page_size, scope) };
  }
  async listSkuCoupons(payload: unknown, identity: C.TrustedIdentity): Promise<C.AdminSkuCouponsPage> {
    const admin = await this.access.requireEnabledAdmin(identity);
    const p = validateAdminAuditPayload('listAdminSkuCoupons', payload) as unknown as C.AdminSkuCouponsPayload;
    const filter = { ...(p.sku_id ? { skuId: p.sku_id } : {}), ...(p.openid ? { openid: p.openid } : {}), ...(p.status ? { status: p.status } : {}), ...this.timeFilter(p) };
    const scope = JSON.stringify(['admin-audit:coupons:keyset-v1', admin.auth_uid, filter]);
    const rows = await this.daos.skuCoupons.listForAdmin(filter, p.page_size + 1, this.cursor(p.page_token, scope));
    const items = rows.slice(0, p.page_size).map((row): C.AdminSkuCoupon => ({ coupon_id: row.id, account_id: row.account_id, openid_masked: masked(row._openid), sku_id: row.sku_id, status: row.status, points_cost_snapshot: row.points_cost_snapshot, source_type: row.source_type, source_ref: row.source_ref, locked_order_no: row.locked_order_no, locked_at: nullableTime(row.locked_at), used_order_no: row.used_order_no, used_at: nullableTime(row.used_at), refunded_at: nullableTime(row.refunded_at), refund_reason: row.refund_reason, created_at: iso(row.created_at), current_sku: this.currentSku(row) }));
    return { items, next_page_token: this.next(rows, p.page_size, scope), image_urls: await this.images.resolve(selectedImages(items.map(item => item.current_sku.image_file_id))) };
  }
}
