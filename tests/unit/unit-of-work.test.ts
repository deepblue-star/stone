import { describe, expect, it } from 'vitest';
import { UnitOfWork } from '../../packages/backend/src/db/unit-of-work';
import type { DatabaseConnection, DatabasePool, SqlParameter } from '../../packages/backend/src/db/database';
import { createDaos } from '../../packages/backend/src/dao';

function fixture(failure?: string, cleanupFailures = false, destroyFails = false) {
  const calls: string[] = [];
  const error = new Error(failure ?? 'primary');
  const connection: DatabaseConnection = {
    async query<T>(_sql: string, _params?: readonly SqlParameter[]): Promise<readonly T[]> { calls.push('query'); return []; },
    async execute() { calls.push('execute'); return { affectedRows: 1, insertId: '1' }; },
    async beginTransaction() { calls.push('begin'); if (failure === 'begin') throw error; },
    async commit() { calls.push('commit'); if (failure === 'commit') throw error; },
    async rollback() { calls.push('rollback'); if (failure === 'rollback' || cleanupFailures) throw error; },
    async release() { calls.push('release'); if (failure === 'release' || cleanupFailures) throw new Error('release'); },
    async destroy() { calls.push('destroy'); if (destroyFails) throw new Error('destroy'); },
  };
  const pool: DatabasePool = { async getConnection() { calls.push('acquire'); if (failure === 'acquire') throw error; return connection; } };
  const work = new UnitOfWork(pool, createDaos);
  return { work, pool, connection, calls, error };
}

describe('UnitOfWork', () => {
  it('binds all DAOs to one connection and commits before release', async () => {
    const { work, calls } = fixture();
    const result = await work.run(async daos => {
      await daos.siteConfig.findByKey('home_banners');
      await daos.admin.findEnabledByAuthUid('admin');
      await daos.pointsAccounts.findByOpenId('openid');
      await daos.pointsLedger.findByEventKey('event');
      return 'committed';
    });
    expect(result).toBe('committed');
    expect(calls).toEqual(['acquire', 'begin', 'query', 'query', 'query', 'query', 'commit', 'release']);
  });

  it.each(['acquire', 'begin', 'commit'])('preserves %s failure and releases when acquired', async failure => {
    const { work, calls, error } = fixture(failure);
    await expect(work.run(async () => 'ok')).rejects.toBe(error);
    expect(calls).toEqual(failure === 'acquire' ? ['acquire'] : failure === 'begin' ? ['acquire', 'begin', 'rollback', 'release'] : ['acquire', 'begin', 'commit', 'rollback', 'release']);
  });

  it.each([false, true])('preserves callback error even when cleanup fails (%s)', async cleanupFails => {
    const { work, calls } = fixture(undefined, cleanupFails);
    const original = new Error('callback');
    await expect(work.run(async () => { throw original; })).rejects.toBe(original);
    expect(calls).toEqual(['acquire', 'begin', 'rollback', cleanupFails ? 'destroy' : 'release']);
  });

  it('reports release failure after commit without attempting rollback', async () => {
    const { work, calls } = fixture('release');
    await expect(work.run(async () => 'ok')).rejects.toThrow('release');
    expect(calls).toEqual(['acquire', 'begin', 'commit', 'release', 'destroy']);
  });

  it('preserves a null callback rejection when rollback also fails', async () => {
    const { work, calls } = fixture('rollback');
    await expect(work.run(async () => { throw null; })).rejects.toBeNull();
    expect(calls).toEqual(['acquire', 'begin', 'rollback', 'destroy']);
  });

  it('preserves commit failure and discards instead of releasing when rollback fails', async () => {
    const { work, error, calls } = fixture('commit', true);
    await expect(work.run(async () => 'ok')).rejects.toBe(error);
    expect(calls).toEqual(['acquire', 'begin', 'commit', 'rollback', 'destroy']);
  });

  it.each(['begin', 'commit'])('preserves %s failure even if rollback and destroy also fail', async failure => {
    const { work, error, calls } = fixture(failure, true, true);
    await expect(work.run(async () => 'ok')).rejects.toBe(error);
    expect(calls.at(-1)).toBe('destroy');
    expect(calls).not.toContain('release');
  });

  it('preserves the release failure after commit even if destroy fails', async () => {
    const { work, calls } = fixture('release', false, true);
    await expect(work.run(async () => 'ok')).rejects.toThrow('release');
    expect(calls).toEqual(['acquire', 'begin', 'commit', 'release', 'destroy']);
  });

  it('preserves the callback failure when normal rollback succeeds but release fails', async () => {
    const { work, calls } = fixture('release', false, true);
    const original = new Error('callback');
    await expect(work.run(async () => { throw original; })).rejects.toBe(original);
    expect(calls).toEqual(['acquire', 'begin', 'rollback', 'release', 'destroy']);
  });

  it('acquires a usable replacement after discarding a session with failed rollback', async () => {
    const broken = fixture('rollback');
    const usable = fixture();
    let acquisitions = 0;
    const pool: DatabasePool = {
      async getConnection() {
        acquisitions++;
        // Model mysql2's free list: release would make the broken session reusable.
        return acquisitions === 1 || broken.calls.includes('release') ? broken.connection : usable.connection;
      },
    };
    const work = new UnitOfWork(pool, createDaos);
    const original = new Error('callback');
    await expect(work.run(async () => { throw original; })).rejects.toBe(original);
    expect(broken.calls).toEqual(['begin', 'rollback', 'destroy']);
    await expect(work.run(async daos => { await daos.siteConfig.findByKey('home_banners'); return 'healthy'; })).resolves.toBe('healthy');
    expect(usable.calls).toEqual(['begin', 'query', 'commit', 'release']);
    expect(acquisitions).toBe(2);
  });

  it('rolls back and releases when the DAO factory fails', async () => {
    const { pool, calls } = fixture();
    const failure = new Error('factory');
    const work = new UnitOfWork(pool, () => { throw failure; });
    await expect(work.run(async () => 'unused')).rejects.toBe(failure);
    expect(calls).toEqual(['acquire', 'begin', 'rollback', 'release']);
  });

  it('rejects nesting even across different UnitOfWork instances', async () => {
    const first = fixture();
    const second = new UnitOfWork(first.pool, createDaos);
    await expect(first.work.run(async () => second.run(async () => 'nested'))).rejects.toThrow('Nested');
    expect(first.calls).toEqual(['acquire', 'begin', 'rollback', 'release']);
  });

  it('allows independent concurrent requests', async () => {
    const { work, calls } = fixture();
    await expect(Promise.all([work.run(async () => 1), work.run(async () => 2)])).resolves.toEqual([1, 2]);
    expect(calls.filter(call => call === 'commit')).toHaveLength(2);
    expect(calls.filter(call => call === 'release')).toHaveLength(2);
  });
});
