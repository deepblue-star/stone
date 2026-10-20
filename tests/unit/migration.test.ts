import { describe, expect, it } from 'vitest';
import { splitStatements, initialTableNames } from '../../scripts/lib/migration.js';
import { readFileSync } from 'node:fs';

describe('migration SQL parsing', () => {
  it('preserves quoted semicolons and strips comments', () => {
    expect(splitStatements("-- header\nSELECT 'a;b'; /* middle */ SELECT 'it\\\'s';")).toEqual(["SELECT 'a;b'", "SELECT 'it\\\'s'"]);
  });
  it('rejects an unterminated quoted string', () => {
    expect(() => splitStatements("SELECT 'broken")).toThrow(/Unterminated/);
  });
  it('extracts exactly the twenty documented business tables', () => {
    const sql = readFileSync('database/migrations/001_initial_schema.sql', 'utf8');
    const statements = splitStatements(sql);
    expect(statements).toHaveLength(20);
    expect(initialTableNames(sql)).toContain('site_config');
    expect(new Set(initialTableNames(sql)).size).toBe(20);
    expect(statements.every(s => /^CREATE TABLE /.test(s))).toBe(true);
    expect(sql).not.toMatch(/\bFOREIGN KEY\b|\bDROP TABLE\b/);
  });
});
