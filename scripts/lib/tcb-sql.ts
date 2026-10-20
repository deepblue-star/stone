import { execFile } from 'node:child_process';
import { existsSync } from 'node:fs';
import { delimiter, dirname, join } from 'node:path';
import { promisify } from 'node:util';

export const ENV_ID = 'stone-d3gga4t2g2ffaedb6';
const run = promisify(execFile);

/** Management-plane SQL only; application code must use the transaction connection. */
export async function tcbSql<Row extends object>(sql: string, readOnly = true): Promise<Row[]> {
  const args = ['db', 'execute', '--env-id', ENV_ID, '--sql', sql, '--json'];
  if (readOnly) args.push('--read-only');
  let command = 'tcb'; let commandArgs = args;
  if (process.platform === 'win32') {
    const pathDirs = (process.env.PATH ?? process.env.Path ?? '').split(delimiter);
    const wrapper = pathDirs.map(dir => join(dir, 'tcb.ps1')).find(p => existsSync(p));
    if (!wrapper) throw new Error('CloudBase CLI is missing from PATH');
    // The standard npm PowerShell wrapper identifies the installed CLI JS entry.
    // Run Node directly: avoids Windows PowerShell encoding and argv re-parsing.
    const entry = join(dirname(wrapper), 'node_modules', '@cloudbase', 'cli', 'bin', 'tcb');
    if (!existsSync(entry)) throw new Error('CloudBase CLI JavaScript entry was not found');
    command = process.execPath;
    commandArgs = [entry, ...args];
  }
  try {
    const { stdout } = await run(command, commandArgs, { timeout: 120000, maxBuffer: 8 * 1024 * 1024, windowsHide: true });
    const start = stdout.indexOf('{');
    if (start < 0) throw new Error('CLI did not return JSON');
    const result: unknown = JSON.parse(stdout.slice(start));
    if (!result || typeof result !== 'object' || !('data' in result)) throw new Error('CLI returned an error');
    const data = result.data;
    if (!data || typeof data !== 'object') throw new Error('CLI returned no SQL result');
    if ('items' in data && Array.isArray(data.items)) return data.items as Row[];
    if ('rowsAffected' in data) return [];
    throw new Error('Unexpected SQL result shape');
  } catch {
    // Do not dump child process arguments or raw database errors (may contain data).
    throw new Error(`CloudBase SQL command failed (${readOnly ? 'read' : 'write'}); inspect local CLI access and target schema`);
  }
}
