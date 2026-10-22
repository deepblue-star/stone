/** Link the already uploaded single-bead development assets, preserving manual images. */
import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import cloudbase from '@cloudbase/js-sdk';
import type { AdminCatalogItem, SaveCatalogItemPayload, SaveCatalogSkuPayload } from '../packages/contracts/src/catalog';
import { alphaSeedDefinitions } from './seed-alpha-dev';
import { ENV_ID, tcbSql } from './lib/tcb-sql';

async function main() {
  const definitions = alphaSeedDefinitions().filter(item => item.type !== 'STANDARD');
  if (!process.argv.includes('--apply')) {
    console.log({ environment: ENV_ID, mode: 'preview', items: definitions.map(item => ({ name: item.name, image: item.imageAsset })), note: '只替换原整串占位图；保留人工修改；先上传 assets/samples 的三张单颗图到 catalog/alpha-20261022/' });
    return;
  }
  assert.equal((await tcbSql<{ name: string }>('SELECT DATABASE() AS name'))[0]?.name, ENV_ID);
  const originalRows = await tcbSql<{ images: unknown }>("SELECT images FROM catalog_items WHERE name='【开发样例】白水晶手串' AND is_deleted=0 ORDER BY id LIMIT 1");
  const originalImages: unknown = typeof originalRows[0]?.images === 'string' ? JSON.parse(originalRows[0].images) : originalRows[0]?.images;
  assert(Array.isArray(originalImages) && typeof originalImages[0] === 'string');
  const original: string = originalImages[0];
  assert(original.startsWith(`cloud://${ENV_ID}.`) && original.includes('/catalog/'));
  // Reuse the verified existing CloudBase fileID prefix, never invent a signed URL.
  const prefix = original.slice(0, original.indexOf('/catalog/'));
  process.loadEnvFile('.env.local');
  const credentials = JSON.parse(await readFile('.local/merchant-login.json', 'utf8')) as { username: string; password: string; environment: string };
  assert.equal(credentials.environment, ENV_ID);
  const app = cloudbase.init({ env: ENV_ID, region: 'ap-shanghai', accessKey: process.env.VITE_PUBLISHABLE_KEY, auth: { detectSessionInUrl: false } });
  const evidence: { action: string; request_id: string }[] = [];
  const api = async <T>(action: string, payload: object): Promise<T> => {
    const response = await app.callFunction({ name: 'business-api', data: { action, payload } });
    const result = response.result as { ok: boolean; code: string; data: T; request_id: string };
    if (!result.ok) throw new Error(`Action rejected: ${action}/${result.code}`);
    evidence.push({ action, request_id: result.request_id }); return result.data;
  };
  try {
    const login = await app.auth.signInWithPassword({ username: credentials.username, password: credentials.password });
    assert(!login.error, 'Development merchant login failed');
    const result: { item_id: string; updated_skus: number; preserved_skus: number; file_id: string }[] = [];
    for (const definition of definitions) {
      const fileId = `${prefix}/catalog/alpha-20261022/${definition.imageAsset.replace('-generated.png', '.png')}`;
      // Verify the uploaded object is readable before changing any database reference.
      const signed = await app.getTempFileURL({ fileList: [{ fileID: fileId, maxAge: 60 }] });
      const file = signed.fileList?.find(row => row.fileID === fileId);
      const temporaryUrl = file?.tempFileURL;
      assert(typeof temporaryUrl === 'string' && temporaryUrl.startsWith('https://'), 'Uploaded development asset is missing');
      const probe = await fetch(temporaryUrl, { method: 'HEAD', signal: AbortSignal.timeout(15000) });
      assert(probe.ok && probe.headers.get('content-type')?.startsWith('image/'), 'Uploaded development asset is unreadable');
      const literal = "'" + definition.name.replaceAll("'", "''") + "'";
      const rows = await tcbSql<{ id: string }>(`SELECT CAST(id AS CHAR) AS id FROM catalog_items WHERE name=${literal} AND is_deleted=0`);
      assert.equal(rows.length, 1, 'Expected exactly one named Alpha fixture');
      const before = await api<AdminCatalogItem>('getAdminCatalogItem', { item_id: rows[0]!.id });
      assert.equal(before.catalog_type, definition.type); assert.equal(before.name, definition.name);
      const businessState = (item: AdminCatalogItem) => ({ category: item.category_id, name: item.name, description: item.description, spec: item.spec_schema, sale: item.is_on_sale, skus: item.skus.map(({ image_file_id: _image, updated_at: _time, ...sku }) => sku) });
      const canReplace = (id: string | null) => id === original || id === fileId;
      let updated = 0;
      if (before.images.length === 1 && canReplace(before.images[0]!)) {
        const payload: SaveCatalogItemPayload = { item_id: before.item_id, category_id: before.category_id, name: before.name, description: before.description, images: [fileId], spec_schema: before.spec_schema, is_on_sale: before.is_on_sale };
        if (before.images[0] !== fileId) await api('saveCatalogItem', payload);
      }
      for (const sku of before.skus) {
        if (!canReplace(sku.image_file_id)) continue;
        if (sku.image_file_id !== fileId) {
          const payload: SaveCatalogSkuPayload = { sku_id: sku.sku_id, item_id: before.item_id, spec_values: sku.spec_values, diameter_mm: sku.diameter_mm, image_file_id: fileId, price_cent: sku.price_cent, is_on_sale: sku.is_on_sale, points_exchange_enabled: sku.points_exchange_enabled, points_cost: sku.points_cost, deactivation_impact_hash: null };
          await api('saveCatalogSku', payload);
        }
        updated++;
      }
      const after = await api<AdminCatalogItem>('getAdminCatalogItem', { item_id: before.item_id });
      assert.deepEqual(businessState(after), businessState(before), 'Non-image fixture fields changed');
      for (const sku of before.skus.filter(row => canReplace(row.image_file_id))) assert.equal(after.skus.find(row => row.sku_id === sku.sku_id)?.image_file_id, fileId);
      if (after.images.includes(fileId) || after.skus.some(row => row.image_file_id === fileId)) {
        assert(after.image_urls?.[fileId], 'Server did not resolve the linked development image');
      }
      result.push({ item_id: before.item_id, updated_skus: updated, preserved_skus: before.skus.length - updated, file_id: fileId });
    }
    await writeFile('.local/alpha-material-images-result.json', JSON.stringify({ environment: ENV_ID, result, evidence }, null, 2));
    console.log({ environment: ENV_ID, items: result.length, linkedSkus: result.reduce((n, item) => n + item.updated_skus, 0), preservedSkus: result.reduce((n, item) => n + item.preserved_skus, 0), businessFieldsUnchanged: true });
  } finally { await app.auth.signOut(); }
}
main().then(() => process.exit(0), () => { console.error('Alpha image linking failed; raw credentials, URLs and responses suppressed'); process.exit(1); });
