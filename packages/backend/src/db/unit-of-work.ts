import { AsyncLocalStorage } from 'node:async_hooks';
import type { DatabaseExecutor, DatabasePool } from './database';

const transactionScope = new AsyncLocalStorage<boolean>();

/** Only database work belongs in the callback; perform remote calls outside it. */
export class UnitOfWork<Daos> {
  constructor(private readonly pool: DatabasePool, private readonly createDaos: (executor: DatabaseExecutor) => Daos) {}

  async run<T>(callback: (daos: Daos) => Promise<T>): Promise<T> {
    if (transactionScope.getStore()) throw new Error('Nested UnitOfWork is not supported');
    return transactionScope.run(true, async () => {
      const connection = await this.pool.getConnection();
      let failed = false;
      let originalError: unknown;
      let discardConnection = false;
      let result: T | undefined;
      const discard = async () => {
        try {
          await connection.destroy();
        } catch (destroyError) {
          // Destruction is best-effort after another error; keep the primary failure.
          if (!failed) { failed = true; originalError = destroyError; }
        }
      };
      try {
        await connection.beginTransaction();
        result = await callback(this.createDaos(connection));
        await connection.commit();
      } catch (error) {
        failed = true;
        originalError = error;
        try {
          await connection.rollback();
        } catch {
          // A failed rollback leaves session state unknown. Never recycle it.
          discardConnection = true;
        }
      } finally {
        if (discardConnection) {
          await discard();
        } else {
          try {
            await connection.release();
          } catch (releaseError) {
            if (!failed) { failed = true; originalError = releaseError; }
            await discard();
          }
        }
      }
      if (failed) throw originalError;
      return result as T;
    });
  }
}
