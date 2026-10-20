import type { Admin, EntityId } from '../../../contracts/src';
import type { DatabaseExecutor } from '../db/database';

export interface SiteConfigRecord { config_key: string; config_value: unknown; updated_at?: Date | string }
export class SiteConfigDAO {
  constructor(private readonly db: DatabaseExecutor) {}
  async findByKey(key: string): Promise<SiteConfigRecord | null> {
    const rows = await this.db.query<SiteConfigRecord>('SELECT config_key, config_value, updated_at FROM site_config WHERE config_key = ? AND is_deleted = 0 LIMIT 1', [key]);
    return rows[0] ?? null;
  }
  async findByKeys(keys: readonly string[]): Promise<readonly SiteConfigRecord[]> {
    if (keys.length === 0) return [];
    return this.db.query<SiteConfigRecord>(`SELECT config_key, config_value, updated_at FROM site_config WHERE config_key IN (${keys.map(() => '?').join(', ')}) AND is_deleted = 0`, keys);
  }
}
export class AdminDAO {
  constructor(private readonly db: DatabaseExecutor) {}
  async findEnabledByAuthUid(uid: string): Promise<Admin | null> {
    const rows = await this.db.query<Admin>('SELECT CAST(id AS CHAR) AS id, auth_uid, display_name FROM admin_allowlist WHERE auth_uid = ? AND enabled = 1 AND is_deleted = 0 LIMIT 1', [uid]);
    return rows[0] ?? null;
  }
}

export interface PointsAccount { id: EntityId; _openid: string; balance: string; total_earned: string; total_spent: string; invite_code: string }
export interface PointsAccountInsert { openid: string; inviteCode: string }
export interface PointsBalanceUpdate { id: EntityId; balance: string; totalEarned: string; totalSpent: string }
const accountColumns = 'CAST(id AS CHAR) AS id, _openid, CAST(balance AS CHAR) AS balance, CAST(total_earned AS CHAR) AS total_earned, CAST(total_spent AS CHAR) AS total_spent, invite_code';
export class PointsAccountDAO {
  constructor(private readonly db: DatabaseExecutor) {}
  async findByOpenId(openid: string): Promise<PointsAccount | null> {
    const rows = await this.db.query<PointsAccount>(`SELECT ${accountColumns} FROM points_accounts WHERE _openid = ? AND is_deleted = 0 LIMIT 1`, [openid]);
    return rows[0] ?? null;
  }
  async findForUpdate(id: EntityId): Promise<PointsAccount | null> {
    const rows = await this.db.query<PointsAccount>(`SELECT ${accountColumns} FROM points_accounts WHERE id = ? AND is_deleted = 0 FOR UPDATE`, [id]);
    return rows[0] ?? null;
  }
  async insert(input: PointsAccountInsert): Promise<EntityId> {
    const result = await this.db.execute('INSERT INTO points_accounts (_openid, invite_code) VALUES (?, ?)', [input.openid, input.inviteCode]);
    return result.insertId;
  }
  async updateBalance(input: PointsBalanceUpdate): Promise<void> {
    await this.db.execute('UPDATE points_accounts SET balance = ?, total_earned = ?, total_spent = ? WHERE id = ? AND is_deleted = 0', [input.balance, input.totalEarned, input.totalSpent, input.id]);
  }
}
export interface PointsLedger { id: EntityId; account_id: EntityId; points_delta: string; balance_after: string; source_type: string; event_key: string; source_ref: string | null; description: string }
export type PointsLedgerInsert = Omit<PointsLedger, 'id'>;
export class PointsLedgerDAO {
  constructor(private readonly db: DatabaseExecutor) {}
  async findByEventKey(eventKey: string): Promise<PointsLedger | null> {
    const rows = await this.db.query<PointsLedger>('SELECT CAST(id AS CHAR) AS id, CAST(account_id AS CHAR) AS account_id, CAST(points_delta AS CHAR) AS points_delta, CAST(balance_after AS CHAR) AS balance_after, source_type, event_key, source_ref, description FROM points_ledger WHERE event_key = ? AND is_deleted = 0 LIMIT 1', [eventKey]);
    return rows[0] ?? null;
  }
  async insert(input: PointsLedgerInsert): Promise<EntityId> {
    const result = await this.db.execute('INSERT INTO points_ledger (account_id, points_delta, balance_after, source_type, event_key, source_ref, description) VALUES (?, ?, ?, ?, ?, ?, ?)', [input.account_id, input.points_delta, input.balance_after, input.source_type, input.event_key, input.source_ref, input.description]);
    return result.insertId;
  }
}
export function createDaos(executor: DatabaseExecutor) {
  return { siteConfig: new SiteConfigDAO(executor), admin: new AdminDAO(executor), pointsAccounts: new PointsAccountDAO(executor), pointsLedger: new PointsLedgerDAO(executor) };
}
export type DaoSet = ReturnType<typeof createDaos>;
