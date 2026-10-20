import mysql, { type Pool, type PoolConnection, type PoolOptions, type ResultSetHeader, type RowDataPacket } from 'mysql2/promise';
import type { DatabaseConnection, DatabaseExecutor, DatabasePool, MutationResult, SqlParameter } from './database';

export type DatabaseEnvironment = Readonly<Record<string, string | undefined>>;
function required(env: DatabaseEnvironment, key: string): string {
  const value = env[key];
  if (!value) throw new Error(`Missing database configuration: ${key}`);
  return value;
}
function integer(value: string | undefined, fallback: number, max: number): number {
  if (value === undefined || value === '') return fallback;
  if (!/^\d+$/.test(value)) throw new Error('Invalid database integer configuration');
  const result = Number(value);
  if (!Number.isSafeInteger(result) || result < 1 || result > max) throw new Error('Invalid database integer configuration');
  return result;
}
export function mysqlPoolOptions(env: DatabaseEnvironment = process.env): PoolOptions {
  if (env.MYSQL_SSL !== undefined && env.MYSQL_SSL !== '' && env.MYSQL_SSL !== 'true' && env.MYSQL_SSL !== 'false') throw new Error('Invalid MYSQL_SSL setting');
  return {
    host: required(env, 'MYSQL_HOST'),
    port: integer(env.MYSQL_PORT, 3306, 65535),
    database: required(env, 'MYSQL_DATABASE'),
    user: required(env, 'MYSQL_USER'),
    password: required(env, 'MYSQL_PASSWORD'),
    connectionLimit: integer(env.MYSQL_CONNECTION_LIMIT, 5, 100),
    waitForConnections: true,
    queueLimit: 100,
    connectTimeout: 10000,
    timezone: 'Z',
    supportBigNumbers: true,
    bigNumberStrings: true,
    decimalNumbers: false,
    multipleStatements: false,
    charset: 'utf8mb4',
    ...(env.MYSQL_SSL === 'true' ? { ssl: { rejectUnauthorized: true } } : {}),
  };
}
class MysqlConnection implements DatabaseConnection {
  constructor(private readonly connection: PoolConnection) {}
  async query<Row>(sql: string, params: readonly SqlParameter[] = []): Promise<readonly Row[]> {
    const [rows] = await this.connection.execute<RowDataPacket[]>(sql, [...params]);
    return rows as unknown as readonly Row[];
  }
  async execute(sql: string, params: readonly SqlParameter[] = []): Promise<MutationResult> {
    const [result] = await this.connection.execute<ResultSetHeader>(sql, [...params]);
    const insertId: unknown = result.insertId;
    if (typeof insertId === 'number' && !Number.isSafeInteger(insertId)) throw new Error('Unsafe insert identifier returned by database driver');
    return { affectedRows: result.affectedRows, insertId: String(insertId) };
  }
  async beginTransaction(): Promise<void> { await this.connection.beginTransaction(); }
  async commit(): Promise<void> { await this.connection.commit(); }
  async rollback(): Promise<void> { await this.connection.rollback(); }
  async release(): Promise<void> { this.connection.release(); }
  async destroy(): Promise<void> { this.connection.destroy(); }
}

export interface MysqlDatabase extends DatabaseExecutor, DatabasePool { end(): Promise<void> }
/** No pool or credential validation occurs until the first actual DB operation. */
export function createMysqlDatabase(env: DatabaseEnvironment = process.env): MysqlDatabase {
  let pool: Pool | undefined;
  function getPool(): Pool { return pool ??= mysql.createPool(mysqlPoolOptions(env)); }
  async function getConnection(): Promise<DatabaseConnection> {
    const raw = await getPool().getConnection();
    try {
      // Set every checkout as well as client conversion; session state may be reused.
      await raw.query("SET SESSION time_zone = '+00:00'");
      return new MysqlConnection(raw);
    } catch (error) {
      // Destroy a session whose initialization failed; never return it to the pool.
      try { raw.destroy(); } finally { throw error; }
    }
  }
  async function withConnection<T>(operation: (connection: DatabaseConnection) => Promise<T>): Promise<T> {
    const connection = await getConnection();
    let failed = false;
    try { return await operation(connection); }
    catch (error) { failed = true; throw error; }
    finally {
      try { await connection.release(); }
      catch (error) {
        // A failed release must not leave an uncertain session reusable.
        try { await connection.destroy(); }
        catch {
          // Preserve the operation or release error even if discard also fails.
          if (!failed) throw error;
        }
        if (!failed) throw error;
      }
    }
  }
  return {
    getConnection,
    query: <Row>(sql: string, params?: readonly SqlParameter[]) => withConnection(connection => connection.query<Row>(sql, params)),
    execute: (sql, params) => withConnection(connection => connection.execute(sql, params)),
    async end() { if (pool) { await pool.end(); pool = undefined; } },
  };
}
