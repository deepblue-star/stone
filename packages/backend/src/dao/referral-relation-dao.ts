import type { DatabaseExecutor, SqlParameter } from "../db/database";
import { auditTimeConditions, type AdminAuditCursor, type AdminAuditTimeFilter } from './admin-audit-query';
export interface AdminReferralFilter extends AdminAuditTimeFilter { inviterOpenid?: string; inviteeOpenid?: string; rewarded?: boolean }
export interface AdminReferralRow extends Omit<ReferralRelationRow, 'updated_at' | 'is_deleted'> { inviter_openid: string | null; invitee_openid: string | null }
import type { RowMetadata, Timestamp } from "./types";
import { page } from "./sql";
export interface ReferralRelationInsert {
  inviter_account_id: string;
  invitee_account_id: string;
  bind_channel: "SHARE_PATH" | "MANUAL_CODE";
  invite_code_snapshot: string;
}
export interface ReferralRelationRow
  extends ReferralRelationInsert,
    RowMetadata {
  id: string;
  rewarded_order_no: string | null;
  rewarded_at: Timestamp | null;
}
const columns =
  "CAST(id AS CHAR) AS id,CAST(inviter_account_id AS CHAR) AS inviter_account_id,CAST(invitee_account_id AS CHAR) AS invitee_account_id,bind_channel,invite_code_snapshot,rewarded_order_no,rewarded_at,created_at,updated_at,is_deleted";
export class ReferralRelationDAO {
  constructor(private readonly db: DatabaseExecutor) {}
  async listForAdmin(filter: AdminReferralFilter, limit: number, before?: AdminAuditCursor): Promise<readonly AdminReferralRow[]> {
    let where = 'r.is_deleted=0';
    const params: SqlParameter[] = [];
    if (filter.inviterOpenid !== undefined) { where += ' AND inviter._openid=?'; params.push(filter.inviterOpenid); }
    if (filter.inviteeOpenid !== undefined) { where += ' AND invitee._openid=?'; params.push(filter.inviteeOpenid); }
    if (filter.rewarded !== undefined) where += ` AND r.rewarded_order_no IS ${filter.rewarded ? 'NOT ' : ''}NULL`;
    where += auditTimeConditions('r', filter, before, params);
    return this.db.query<AdminReferralRow>(`SELECT CAST(r.id AS CHAR) AS id,CAST(r.inviter_account_id AS CHAR) AS inviter_account_id,CAST(r.invitee_account_id AS CHAR) AS invitee_account_id,inviter._openid AS inviter_openid,invitee._openid AS invitee_openid,r.bind_channel,r.invite_code_snapshot,r.rewarded_order_no,r.rewarded_at,r.created_at FROM referral_relations r LEFT JOIN points_accounts inviter ON inviter.id=r.inviter_account_id LEFT JOIN points_accounts invitee ON invitee.id=r.invitee_account_id WHERE ${where} ORDER BY r.created_at DESC,r.id DESC LIMIT ?`, [...params, limit]);
  }
  async countsByInviter(accountId: string): Promise<{ invited: string; rewarded: string }> { return (await this.db.query<{ invited: string; rewarded: string }>('SELECT CAST(COUNT(*) AS CHAR) AS invited,CAST(COALESCE(SUM(rewarded_order_no IS NOT NULL),0) AS CHAR) AS rewarded FROM referral_relations WHERE inviter_account_id=? AND is_deleted=0', [accountId]))[0] ?? { invited: '0', rewarded: '0' }; }
  async insert(v: ReferralRelationInsert): Promise<string> {
    return (
      await this.db.execute(
        "INSERT INTO referral_relations(inviter_account_id,invitee_account_id,bind_channel,invite_code_snapshot) VALUES(?,?,?,?)",
        [
          v.inviter_account_id,
          v.invitee_account_id,
          v.bind_channel,
          v.invite_code_snapshot,
        ],
      )
    ).insertId;
  }
  async findById(
    id: string,
    lock = false,
  ): Promise<ReferralRelationRow | null> {
    return (
      (
        await this.db.query<ReferralRelationRow>(
          `SELECT ${columns} FROM referral_relations WHERE id=? AND is_deleted=0 LIMIT 1${lock ? " FOR UPDATE" : ""}`,
          [id],
        )
      )[0] ?? null
    );
  }
  async findByInvitee(
    id: string,
    lock = false,
  ): Promise<ReferralRelationRow | null> {
    return (
      (
        await this.db.query<ReferralRelationRow>(
          `SELECT ${columns} FROM referral_relations WHERE invitee_account_id=? AND is_deleted=0 LIMIT 1${lock ? " FOR UPDATE" : ""}`,
          [id],
        )
      )[0] ?? null
    );
  }
  async listByInviter(
    id: string,
    limit = 50,
    offset = 0,
  ): Promise<readonly ReferralRelationRow[]> {
    return this.db.query<ReferralRelationRow>(
      `SELECT ${columns} FROM referral_relations WHERE inviter_account_id=? AND is_deleted=0 ORDER BY created_at DESC,id DESC LIMIT ? OFFSET ?`,
      [id, ...page(limit, offset)],
    );
  }
  async countByInviter(id: string): Promise<string> {
    return (
      (
        await this.db.query<{ count: string }>(
          "SELECT CAST(COUNT(*) AS CHAR) AS count FROM referral_relations WHERE inviter_account_id=? AND is_deleted=0",
          [id],
        )
      )[0]?.count ?? "0"
    );
  }
  async recordReward(
    id: string,
    orderNo: string,
    time: Timestamp,
  ): Promise<number> {
    return (
      await this.db.execute(
        "UPDATE referral_relations SET rewarded_order_no=?,rewarded_at=?,updated_at=UTC_TIMESTAMP() WHERE id=? AND rewarded_order_no IS NULL AND rewarded_at IS NULL AND is_deleted=0",
        [orderNo, time, id],
      )
    ).affectedRows;
  }
}
