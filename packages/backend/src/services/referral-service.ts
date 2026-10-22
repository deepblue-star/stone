import type * as C from '../../../contracts/src/index';
import type { DaoSet, PointsAccount, ReferralRelationRow } from '../dao/index';
import type { UnitOfWork } from '../db/unit-of-work';
import { compareId, safeNumber } from '../catalog/rules';
import { AppError } from '../errors';
import { checkedPoints, requireWechat, validatePointsPayload } from './points-rules';
import type { PointsService } from './points-service';
export interface CompletionAccountLocks {
  openid: string;
  inviteeAccountId: string;
  lockedAccountIds: readonly string[];
  accounts: ReadonlyMap<string, PointsAccount>;
  relation: ReferralRelationRow | null;
}
export class ReferralService {
  constructor(private readonly daos: DaoSet, private readonly uow: UnitOfWork<DaoSet>, private readonly points: PointsService) {}
  async getMyInviteInfo(payload: Record<string, never>, identity: C.TrustedIdentity): Promise<C.MyInviteInfo> { const openid = requireWechat(identity); validatePointsPayload('getMyInviteInfo', payload); return this.points.withAccount(openid, async (d, a) => { const counts = await d.referrals.countsByInviter(a.id); return { invite_code: a.invite_code, share_path: `/pages/home/index?ref=${a.invite_code}`, bound_referrer: Boolean(await d.referrals.findByInvitee(a.id)), invited_user_count: safeNumber(counts.invited), rewarded_user_count: safeNumber(counts.rewarded) }; }); }
  async bindReferrer(payload: C.BindReferrerPayload, identity: C.TrustedIdentity): Promise<C.BindReferrerResult> { const openid = requireWechat(identity); validatePointsPayload('bindReferrer', payload); return this.uow.run(async d => {
    const ensured = await this.points.ensureAccount(d, openid); const a = await d.pointsAccounts.findForUpdate(ensured.id); if (!a) throw new AppError('INTERNAL_ERROR', '积分账户不存在'); const inviter = await d.pointsAccounts.findByInviteCode(payload.invite_code);
    if (!inviter) throw new AppError('NOT_FOUND', '邀请码不存在'); if (inviter.id === a.id) throw new AppError('SELF_REFERRAL', '不能邀请自己');
    if (await d.orders.firstCompletedOrder(openid, true)) throw new AppError('REFERRAL_BINDING_CLOSED', '完成首单后不能绑定邀请人');
    const prior = await d.referrals.findByInvitee(a.id, true); if (prior) { if (prior.inviter_account_id !== inviter.id) throw new AppError('REFERRAL_ALREADY_BOUND', '已绑定其他邀请人'); return { relation_id: prior.id, bound: true, idempotent_replay: true }; }
    const id = await d.referrals.insert({ inviter_account_id: inviter.id, invitee_account_id: a.id, bind_channel: payload.bind_channel, invite_code_snapshot: payload.invite_code }); return { relation_id: id, bound: true, idempotent_replay: false };
  }); }
  /**
   * Completion protocol: OrderService MUST call this before locking/updating an order,
   * then transition it and pass this context to grantFirstCompletedOrderReward in the
   * same UnitOfWork. All account locks precede relation/order locks, numerically sorted
   * to match AdminCatalogService. A concurrent binding requires a fresh transaction.
   */
  async lockCompletionAccounts(d: DaoSet, openid: string): Promise<CompletionAccountLocks> {
    const invitee = await this.points.ensureAccount(d, openid);
    const before = await d.referrals.findByInvitee(invitee.id);
    const ids = [...new Set([invitee.id, ...(before ? [before.inviter_account_id] : [])])].sort(compareId);
    const accounts = new Map<string, PointsAccount>();
    for (const id of ids) {
      const account = await d.pointsAccounts.findForUpdate(id);
      if (!account) throw new AppError('CONFLICT', '邀请关联账户已变化');
      accounts.set(id, account);
    }
    const relation = await d.referrals.findByInvitee(invitee.id, true);
    if (relation && !accounts.has(relation.inviter_account_id)) throw new AppError('CONFLICT', '邀请关系已变化，请重试');
    return { openid, inviteeAccountId: invitee.id, lockedAccountIds: ids, accounts, relation };
  }
  /** OrderService passes its prelocked context after the COMPLETED transition. */
  async grantFirstCompletedOrderReward(d: DaoSet, orderNo: string, locks?: CompletionAccountLocks): Promise<void> {
    const order = await d.orders.findByOrderNo(orderNo); if (!order || order.status !== 'COMPLETED') throw new AppError('CONFLICT', '订单尚未完成');
    const context = locks ?? await this.lockCompletionAccounts(d, order._openid);
    if (context.openid !== order._openid) throw new AppError('CONFLICT', '订单与积分账户不一致');
    const relation = context.relation; if (!relation || relation.rewarded_order_no) return;
    const first = await d.orders.firstCompletedOrder(order._openid, true); if (first?.order_no !== orderNo) return;
    const inviter = context.accounts.get(relation.inviter_account_id); if (!inviter) throw new AppError('CONFLICT', '邀请人账户未锁定');
    const key = `REFERRAL_FIRST_COMPLETED_ORDER:${orderNo}`; if (await d.pointsLedger.findByEventKey(key, true)) return;
    const points = (await this.points.rules(d)).referral_first_completed_order_points;
    if (!points) {
      if (await d.referrals.recordReward(relation.id, orderNo, this.points.now()) !== 1) throw new AppError('CONFLICT', '邀请奖励状态已变化');
      return;
    }
    const balance = checkedPoints(BigInt(inviter.balance) + BigInt(points)); const earned = checkedPoints(BigInt(inviter.total_earned) + BigInt(points));
    await d.pointsAccounts.updateBalance({ id: inviter.id, balance, totalEarned: earned, totalSpent: inviter.total_spent });
    await d.pointsLedger.insert({ account_id: inviter.id, points_delta: String(points), balance_after: balance, source_type: 'REFERRAL_FIRST_COMPLETED_ORDER', event_key: key, source_ref: orderNo, description: '邀请好友首单完成奖励' });
    if (await d.referrals.recordReward(relation.id, orderNo, this.points.now()) !== 1) throw new AppError('CONFLICT', '邀请奖励状态已变化');
  }
}
