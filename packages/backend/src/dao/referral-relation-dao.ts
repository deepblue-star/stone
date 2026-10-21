import type { DatabaseExecutor } from "../db/database";
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
