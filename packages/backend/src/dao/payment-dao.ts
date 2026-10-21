import type { DatabaseExecutor } from "../db/database";
import type { RowMetadata, Timestamp } from "./types";
import { placeholders } from "./sql";
export interface PaymentInsert {
  order_id: string;
  out_trade_no: string;
  prepay_id: string | null;
  transaction_id: string | null;
  trade_state: string | null;
  success_time: Timestamp | null;
}
export interface PaymentRow extends PaymentInsert, RowMetadata {
  id: string;
}
export type PaymentProviderResult = Pick<
  PaymentInsert,
  "trade_state" | "transaction_id" | "success_time"
>;
const columns =
  "CAST(id AS CHAR) AS id,CAST(order_id AS CHAR) AS order_id,out_trade_no,prepay_id,transaction_id,trade_state,success_time,created_at,updated_at,is_deleted";
/** No deletion filter on identity or provider-result operations: compensation must find hidden records. */
export class PaymentDAO {
  constructor(private readonly db: DatabaseExecutor) {}
  async insert(v: PaymentInsert): Promise<string> {
    return (
      await this.db.execute(
        "INSERT INTO payment_records(order_id,out_trade_no,prepay_id,transaction_id,trade_state,success_time) VALUES(?,?,?,?,?,?)",
        [
          v.order_id,
          v.out_trade_no,
          v.prepay_id,
          v.transaction_id,
          v.trade_state,
          v.success_time,
        ],
      )
    ).insertId;
  }
  async findById(id: string, lock = false): Promise<PaymentRow | null> {
    return (
      (
        await this.db.query<PaymentRow>(
          `SELECT ${columns} FROM payment_records WHERE id=? LIMIT 1${lock ? " FOR UPDATE" : ""}`,
          [id],
        )
      )[0] ?? null
    );
  }
  async findByIds(
    ids: readonly string[],
    lock = false,
  ): Promise<readonly PaymentRow[]> {
    if (!ids.length) return [];
    return this.db.query<PaymentRow>(
      `SELECT ${columns} FROM payment_records WHERE id IN (${placeholders(ids)}) ORDER BY id${lock ? " FOR UPDATE" : ""}`,
      ids,
    );
  }
  async findByOrderId(id: string, lock = false): Promise<PaymentRow | null> {
    return (
      (
        await this.db.query<PaymentRow>(
          `SELECT ${columns} FROM payment_records WHERE order_id=? LIMIT 1${lock ? " FOR UPDATE" : ""}`,
          [id],
        )
      )[0] ?? null
    );
  }
  async findByOutTradeNo(no: string, lock = false): Promise<PaymentRow | null> {
    return (
      (
        await this.db.query<PaymentRow>(
          `SELECT ${columns} FROM payment_records WHERE out_trade_no=? LIMIT 1${lock ? " FOR UPDATE" : ""}`,
          [no],
        )
      )[0] ?? null
    );
  }
  async findByTransactionId(
    id: string,
    lock = false,
  ): Promise<PaymentRow | null> {
    return (
      (
        await this.db.query<PaymentRow>(
          `SELECT ${columns} FROM payment_records WHERE transaction_id=? LIMIT 1${lock ? " FOR UPDATE" : ""}`,
          [id],
        )
      )[0] ?? null
    );
  }
  async updatePrepay(id: string, prepayId: string): Promise<number> {
    return (
      await this.db.execute(
        "UPDATE payment_records SET prepay_id=?,updated_at=UTC_TIMESTAMP() WHERE id=?",
        [prepayId, id],
      )
    ).affectedRows;
  }
  async updateProviderResult(
    id: string,
    expectedState: string | null,
    v: PaymentProviderResult,
  ): Promise<number> {
    return (
      await this.db.execute(
        "UPDATE payment_records SET trade_state=?,transaction_id=?,success_time=?,updated_at=UTC_TIMESTAMP() WHERE id=? AND trade_state <=> ?",
        [v.trade_state, v.transaction_id, v.success_time, id, expectedState],
      )
    ).affectedRows;
  }
}
