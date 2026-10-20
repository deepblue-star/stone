import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createMysqlDatabase, mysqlPoolOptions } from '../../packages/backend/src/db/mysql';

const driver = vi.hoisted(() => ({
  calls: [] as string[],
  failure: '' as string,
  result: [] as unknown,
  original: new Error('database operation failed'),
}));

vi.mock('mysql2/promise', () => ({
  default: {
    createPool() {
      driver.calls.push('createPool');
      return {
        async getConnection() {
          driver.calls.push('acquire');
          if (driver.failure === 'acquire') throw driver.original;
          return {
            async query(sql: string) { driver.calls.push(sql); if (driver.failure.startsWith('timezone')) throw driver.original; return [[], []]; },
            async execute(sql: string, params: unknown[]) { driver.calls.push(`${sql}:${JSON.stringify(params)}`); if (driver.failure === 'execute' || driver.failure === 'execute-and-release') throw driver.original; return [driver.result, []]; },
            async beginTransaction() { driver.calls.push('begin'); },
            async commit() { driver.calls.push('commit'); },
            async rollback() { driver.calls.push('rollback'); },
            release() { driver.calls.push('release'); if (driver.failure === 'release' || driver.failure === 'release-and-destroy' || driver.failure === 'execute-and-release') throw new Error('release failed'); },
            destroy() { driver.calls.push('destroy'); if (driver.failure === 'timezone-and-destroy' || driver.failure === 'release-and-destroy') throw new Error('destroy failed'); },
          };
        },
        async end() { driver.calls.push('end'); },
      };
    },
  },
}));

const env = { MYSQL_HOST: 'localhost', MYSQL_DATABASE: 'test', MYSQL_USER: 'test', MYSQL_PASSWORD: 'test' };
beforeEach(() => { driver.calls = []; driver.failure = ''; driver.result = []; });

describe('mysql connection adapter', () => {
  it('creates the pool lazily, sets session UTC before query, and releases reads', async () => {
    const db = createMysqlDatabase(env);
    expect(driver.calls).toEqual([]);
    driver.result = [{ id: '9007199254740993', price: '0.10' }];
    expect(await db.query('SELECT id, price FROM items WHERE id = ?', ['9007199254740993'])).toEqual(driver.result);
    expect(driver.calls).toEqual(['createPool', 'acquire', "SET SESSION time_zone = '+00:00'", 'SELECT id, price FROM items WHERE id = ?:["9007199254740993"]', 'release']);
    await db.end();
    expect(driver.calls.at(-1)).toBe('end');
  });
  it('preserves large string insert IDs', async () => {
    driver.result = { affectedRows: 1, insertId: '9007199254740993' };
    expect(await createMysqlDatabase(env).execute('INSERT INTO test (name) VALUES (?)', ['name'])).toEqual({ affectedRows: 1, insertId: '9007199254740993' });
  });
  it('rejects already rounded driver insert IDs', async () => {
    driver.result = { affectedRows: 1, insertId: 9007199254740992 };
    await expect(createMysqlDatabase(env).execute('INSERT INTO test VALUES ()')).rejects.toThrow('Unsafe insert identifier');
    expect(driver.calls.at(-1)).toBe('release');
  });
  it.each(['execute', 'execute-and-release'])('preserves query failure while cleaning up the connection: %s', async failure => {
    driver.failure = failure;
    await expect(createMysqlDatabase(env).query('SELECT 1')).rejects.toBe(driver.original);
    expect(driver.calls.at(-1)).toBe(failure === 'execute-and-release' ? 'destroy' : 'release');
  });
  it('reports release failure after a successful read', async () => {
    driver.failure = 'release';
    await expect(createMysqlDatabase(env).query('SELECT 1')).rejects.toThrow('release failed');
    expect(driver.calls.slice(-2)).toEqual(['release', 'destroy']);
  });
  it('preserves release failure even if best-effort destroy fails', async () => {
    driver.failure = 'release-and-destroy';
    await expect(createMysqlDatabase(env).query('SELECT 1')).rejects.toThrow('release failed');
    expect(driver.calls.slice(-2)).toEqual(['release', 'destroy']);
  });
  it('forwards discard to raw destroy without releasing the session', async () => {
    const connection = await createMysqlDatabase(env).getConnection();
    await connection.destroy();
    expect(driver.calls.at(-1)).toBe('destroy');
    expect(driver.calls).not.toContain('release');
  });
  it('destroys sessions that fail UTC initialization', async () => {
    driver.failure = 'timezone';
    await expect(createMysqlDatabase(env).getConnection()).rejects.toBe(driver.original);
    expect(driver.calls).toEqual(['createPool', 'acquire', "SET SESSION time_zone = '+00:00'", 'destroy']);
  });
  it('preserves session initialization failure even if destroy also fails', async () => {
    driver.failure = 'timezone-and-destroy';
    await expect(createMysqlDatabase(env).getConnection()).rejects.toBe(driver.original);
    expect(driver.calls.at(-1)).toBe('destroy');
  });
  it('does not release an unacquired connection', async () => {
    driver.failure = 'acquire';
    await expect(createMysqlDatabase(env).query('SELECT 1')).rejects.toBe(driver.original);
    expect(driver.calls).toEqual(['createPool', 'acquire']);
  });
  it('forwards transaction lifecycle to the same driver connection', async () => {
    const connection = await createMysqlDatabase(env).getConnection();
    await connection.beginTransaction();
    await connection.commit();
    await connection.rollback();
    await connection.release();
    expect(driver.calls.slice(-4)).toEqual(['begin', 'commit', 'rollback', 'release']);
  });
  it('supports verified TLS and rejects invalid TLS flags', () => {
    expect(mysqlPoolOptions({ ...env, MYSQL_SSL: 'true' }).ssl).toEqual({ rejectUnauthorized: true });
    expect(() => mysqlPoolOptions({ ...env, MYSQL_SSL: 'no-verify' })).toThrow('Invalid MYSQL_SSL');
  });
});
