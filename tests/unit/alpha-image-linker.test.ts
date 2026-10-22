import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import { expect, it } from 'vitest';
import type { AdminCatalogItem } from '../../packages/contracts/src/catalog';

it('preserves all manually edited images and continues linking the remaining named fixtures', async () => {
  const env = 'test-env';
  const original = `cloud://${env}.bucket/catalog/original.png`;
  const definitions = ['white', 'pink', 'gold'].map(name => ({ type: 'BEAD' as const, name, imageAsset: `${name}-generated.png` }));
  const fixtures: AdminCatalogItem[] = definitions.map(({ name }, index) => {
    const itemImage = `cloud://${env}.bucket/catalog/manual-${name}.png`, skuImage = itemImage + '.sku';
    return { item_id: String(index + 1), category_id: 'category', catalog_type: 'BEAD', name, description: 'manual', spec_schema: null, is_on_sale: true, images: [itemImage], updated_at: 'same',
      skus: [{ sku_id: `sku-${index}`, item_id: String(index + 1), image_file_id: skuImage, updated_at: 'same', price_cent: 300, spec_values: null, spec_signature: null, diameter_mm: 6, is_on_sale: true, points_exchange_enabled: true, points_cost: 5, stock_total: 50, stock_reserved: 0, available_stock: 50 }], image_urls: { [itemImage]: 'https://assets.example.test/manual', [skuImage]: 'https://assets.example.test/manual-sku' } };
  });
  let reads = 0, saves = 0;
  let evidence: { result: { preserved_skus: number; updated_skus: number }[] } | undefined;
  const app = {
    auth: { signInWithPassword: async () => ({}), signOut: async () => undefined },
    getTempFileURL: async ({ fileList }: { fileList: { fileID: string }[] }) => ({ fileList: fileList.map(row => ({ ...row, tempFileURL: 'https://assets.example.test/uploaded' })) }),
    callFunction: async ({ data }: { data: { action: string; payload: { item_id: string } } }) => {
      if (data.action !== 'getAdminCatalogItem') { saves++; throw new Error('Unexpected fixture write'); }
      reads++;
      return { result: { ok: true, request_id: 'mock', data: structuredClone(fixtures.find(row => row.item_id === data.payload.item_id)) } };
    },
  };
  const source = readFileSync('scripts/seed-alpha-material-images.ts', 'utf8').replace(/main\(\)\.then\([\s\S]*$/, 'globalThis.done = main();');
  const sandbox: { done?: Promise<unknown>; [key: string]: unknown } = {
    exports: {}, console: { log() {} }, AbortSignal,
    process: { argv: ['node', 'script', '--apply'], env: {}, loadEnvFile() {} },
    fetch: async () => ({ ok: true, headers: { get: () => 'image/png' } }),
    require(specifier: string): unknown {
      if (specifier === 'node:assert/strict') return assert;
      if (specifier === 'node:fs/promises') return { readFile: async () => JSON.stringify({ username: 'dummy', password: 'dummy', environment: env }), writeFile: async (_path: string, content: string) => { evidence = JSON.parse(content); } };
      if (specifier === '@cloudbase/js-sdk') return { init: () => app };
      if (specifier === './seed-alpha-dev') return { alphaSeedDefinitions: () => definitions };
      if (specifier === './lib/tcb-sql') return { ENV_ID: env, tcbSql: async (sql: string) => sql.includes('DATABASE()') ? [{ name: env }] : sql.includes('SELECT images') ? [{ images: [original] }] : fixtures.filter(row => sql.includes(`'${row.name}'`)).map(row => ({ id: row.item_id })) };
      throw new Error(`Unexpected import: ${specifier}`);
    },
  };
  runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText, sandbox);
  await sandbox.done;
  expect(reads).toBe(6); expect(saves).toBe(0);
  expect(evidence?.result).toHaveLength(3);
  expect(evidence?.result.every(row => row.preserved_skus === 1 && row.updated_skus === 0)).toBe(true);
});
