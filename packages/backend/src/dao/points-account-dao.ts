import type { EntityId } from "../../../contracts/src/index";
import type { DatabaseExecutor } from "../db/database";
import { placeholders } from "./sql";
export interface PointsAccount {
  id: EntityId;
  _openid: string;
  balance: string;
  total_earned: string;
  total_spent: string;
  invite_code: string;
}
export interface PointsAccountInsert {
  openid: string;
  inviteCode: string;
}
export interface PointsBalanceUpdate {
  id: EntityId;
  balance: string;
  totalEarned: string;
  totalSpent: string;
}
const columns =
  "CAST(id AS CHAR) AS id, _openid, CAST(balance AS CHAR) AS balance, CAST(total_earned AS CHAR) AS total_earned, CAST(total_spent AS CHAR) AS total_spent, invite_code";
export class PointsAccountDAO {
  constructor(private readonly db: DatabaseExecutor) {}
  async findByOpenId(
    openid: string,
    lock = false,
  ): Promise<PointsAccount | null> {
    return (
      (
        await this.db.query<PointsAccount>(
          `SELECT ${columns} FROM points_accounts WHERE _openid = ? AND is_deleted = 0 LIMIT 1${lock ? " FOR UPDATE" : ""}`,
          [openid],
        )
      )[0] ?? null
    );
  }
  async findForUpdate(id: EntityId): Promise<PointsAccount | null> {
    return (
      (
        await this.db.query<PointsAccount>(
          `SELECT ${columns} FROM points_accounts WHERE id = ? AND is_deleted = 0 FOR UPDATE`,
          [id],
        )
      )[0] ?? null
    );
  }
  async findById(id: string, lock = false): Promise<PointsAccount | null> {
    return (
      (
        await this.db.query<PointsAccount>(
          `SELECT ${columns} FROM points_accounts WHERE id=? AND is_deleted=0 LIMIT 1${lock ? " FOR UPDATE" : ""}`,
          [id],
        )
      )[0] ?? null
    );
  }
  async findByInviteCode(code: string): Promise<PointsAccount | null> {
    return (
      (
        await this.db.query<PointsAccount>(
          `SELECT ${columns} FROM points_accounts WHERE invite_code=? AND is_deleted=0 LIMIT 1`,
          [code],
        )
      )[0] ?? null
    );
  }
  async findByIds(
    ids: readonly string[],
    lock = false,
  ): Promise<readonly PointsAccount[]> {
    if (!ids.length) return [];
    return this.db.query<PointsAccount>(
      `SELECT ${columns} FROM points_accounts WHERE id IN (${placeholders(ids)}) AND is_deleted=0 ORDER BY id${lock ? " FOR UPDATE" : ""}`,
      ids,
    );
  }
  async insert(input: PointsAccountInsert): Promise<EntityId> {
    return (
      await this.db.execute(
        "INSERT INTO points_accounts (_openid, invite_code) VALUES (?, ?)",
        [input.openid, input.inviteCode],
      )
    ).insertId;
  }
  async updateBalance(input: PointsBalanceUpdate): Promise<number> {
    return (
      await this.db.execute(
        "UPDATE points_accounts SET balance = ?, total_earned = ?, total_spent = ? WHERE id = ? AND is_deleted = 0",
        [input.balance, input.totalEarned, input.totalSpent, input.id],
      )
    ).affectedRows;
  }
  async updateBalanceIf(
    input: PointsBalanceUpdate,
    expectedBalance: string,
  ): Promise<number> {
    return (
      await this.db.execute(
        "UPDATE points_accounts SET balance = ?, total_earned = ?, total_spent = ? WHERE id = ? AND balance = ? AND is_deleted = 0",
        [
          input.balance,
          input.totalEarned,
          input.totalSpent,
          input.id,
          expectedBalance,
        ],
      )
    ).affectedRows;
  }
}
