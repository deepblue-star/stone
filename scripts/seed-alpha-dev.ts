import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import cloudbase from '@cloudbase/js-sdk';
import type { AdminCategory, AdminCatalogItem, Page, SavedCatalogSku, SpecSchema } from '../packages/contracts/src/catalog';
import { ENV_ID, tcbSql } from './lib/tcb-sql';

export function alphaSeedDefinitions() {
  return [
    { type: 'BEAD' as const, category: 'Alpha样例 · 白水晶', name: '【Alpha样例】净体白水晶', sizes: [6, 8, 10], prices: [300, 500, 800], pointsCost: 5, imageAsset: 'white-quartz-bead-generated.png' },
    { type: 'BEAD' as const, category: 'Alpha样例 · 彩色珠子', name: '【Alpha样例】草莓晶', sizes: [8, 10], prices: [600, 900], pointsCost: 10, imageAsset: 'strawberry-quartz-bead-generated.png' },
    { type: 'ACCESSORY' as const, category: 'Alpha样例 · 配件', name: '【Alpha样例】金色隔珠', sizes: [4], prices: [200], pointsCost: null, imageAsset: 'gold-spacer-bead-generated.png' },
    { type: 'STANDARD' as const, category: 'Alpha样例 · 标准商品', name: '【Alpha样例】水晶成品手串', sizes: [8, 10], prices: [12800, 16800], pointsCost: null, imageAsset: 'quartz-bracelet-generated.png' },
  ];
}

async function main() {
  if (!process.argv.includes('--apply')) {
    console.log(JSON.stringify({ environment: ENV_ID, mode: 'preview', data: alphaSeedDefinitions(), rulesIfMissing: { daily_check_in_points: 20, referral_first_completed_order_points: 50 }, note: '只新增开发样例；重复运行保留人工编辑；不生成支付成功或真实用户奖励' }, null, 2));
    return;
  }
  const database = (await tcbSql<{ name: string }>('SELECT DATABASE() AS name'))[0]?.name;
  assert.equal(database, ENV_ID, 'Unexpected development database');
  process.loadEnvFile('.env.local');
  const credentials = JSON.parse(await readFile('.local/merchant-login.json', 'utf8')) as { username: string; password: string; environment: string };
  assert.equal(credentials.environment, ENV_ID, 'Unexpected merchant environment');
  const app = cloudbase.init({ env: ENV_ID, region: 'ap-shanghai', accessKey: process.env.VITE_PUBLISHABLE_KEY, auth: { detectSessionInUrl: false } });
  const evidence: { action: string; request_id: string }[] = [];
  const api = async <T>(action: string, payload: object): Promise<T> => {
    const response = await app.callFunction({ name: 'business-api', data: { action, payload } });
    const result = response.result as { ok: boolean; code: string; data: T; request_id: string };
    if (!result.ok) throw new Error(`${action}: ${result.code}`);
    evidence.push({ action, request_id: result.request_id });
    return result.data;
  };
  try {
    const login = await app.auth.signInWithPassword({ username: credentials.username, password: credentials.password });
    if (login.error) throw new Error('Development merchant login failed');
    const imageRows = await tcbSql<{ images: unknown }>("SELECT images FROM catalog_items WHERE name='【开发样例】白水晶手串' AND is_deleted=0 ORDER BY id LIMIT 1");
    const images: unknown = typeof imageRows[0]?.images === 'string' ? JSON.parse(imageRows[0].images) : imageRows[0]?.images;
    const imageId = Array.isArray(images) && typeof images[0] === 'string' && images[0].startsWith('cloud://') ? images[0] : null;
    const fixtures: { type: string; category_id: string; item_id: string; sku_ids: string[] }[] = [];
    for (const definition of alphaSeedDefinitions()) {
      const categories = await api<Page<AdminCategory>>('listAdminCategories', { catalog_type: definition.type, page_token: null, page_size: 100 });
      let category = categories.items.find(item => item.name === definition.category);
      if (!category) category = await api<AdminCategory>('saveCategory', { category_id: null, catalog_type: definition.type, name: definition.category, sort_order: 100, is_enabled: true });
      const found = await api<Page<{ item_id: string; name: string }>>('listAdminItems', { category_id: category.category_id, name_keyword: definition.name, is_on_sale: null, page_token: null, page_size: 100 });
      const existing = found.items.find(item => item.name === definition.name);
      const schema: SpecSchema | null = definition.type === 'STANDARD' ? { dimensions: [{ key: 'size', label: '珠子大小', options: definition.sizes.map(size => ({ value: String(size), label: size + 'mm' })) }] } : null;
      let item = existing ? await api<AdminCatalogItem>('getAdminCatalogItem', { item_id: existing.item_id }) : await api<AdminCatalogItem>('saveCatalogItem', { item_id: null, category_id: category.category_id, name: definition.name, description: '仅用于 Alpha 人工测试的虚构商品。图片复用开发样例，不代表实际材质；请勿用于经营。', images: imageId ? [imageId] : [], spec_schema: schema, is_on_sale: true });
      const ids: string[] = [];
      for (let index = 0; index < definition.sizes.length; index++) {
        const size = definition.sizes[index]!;
        let sku = item.skus.find(row => definition.type === 'STANDARD' ? row.spec_values?.size === String(size) : row.diameter_mm === size);
        if (!sku) {
          const saved = await api<SavedCatalogSku>('saveCatalogSku', { sku_id: null, item_id: item.item_id, spec_values: definition.type === 'STANDARD' ? { size: String(size) } : null, diameter_mm: definition.type === 'STANDARD' ? null : size, image_file_id: imageId, price_cent: definition.prices[index]!, is_on_sale: true, points_exchange_enabled: definition.pointsCost !== null, points_cost: definition.pointsCost, deactivation_impact_hash: null });
          // A stable key makes a failed/interrupted run resumable without re-adding stock.
          await api('adjustInventory', { operation_key: `alpha_seed_v1_${saved.sku_id}`, sku_id: saved.sku_id, stock_delta: 50, remark: 'Alpha样例初始化库存（仅开发）' });
          item = await api<AdminCatalogItem>('getAdminCatalogItem', { item_id: item.item_id });
          sku = item.skus.find(row => row.sku_id === saved.sku_id);
        }
        assert(sku);
        if (sku.stock_total === 0) await api('adjustInventory', { operation_key: `alpha_seed_v1_${sku.sku_id}`, sku_id: sku.sku_id, stock_delta: 50, remark: 'Alpha样例初始化库存（仅开发）' });
        ids.push(sku.sku_id);
      }
      fixtures.push({ type: definition.type, category_id: category.category_id, item_id: item.item_id, sku_ids: ids });
    }
    // Only initialize a missing rule record; never overwrite a merchant's configured values.
    await tcbSql("INSERT INTO site_config(config_key,config_value,created_at,updated_at) SELECT 'points_rules',JSON_OBJECT('daily_check_in_points',20,'referral_first_completed_order_points',50),UTC_TIMESTAMP(),UTC_TIMESTAMP() WHERE NOT EXISTS (SELECT 1 FROM site_config WHERE config_key='points_rules')", false);
    const provinces = JSON.parse(await readFile('node_modules/province-city-china/dist/province.json', 'utf8')) as { code: string; name: string }[];
    const shippingRules = JSON.stringify({ regions: provinces.map((province, index) => ({ province_code: province.code, province_name: province.name, shipping_fee_cent: 800, sort_order: index * 10, enabled: !['710000','810000','820000'].includes(province.code) })) });
    // Values come from a pinned public dataset; JSON is escaped as a SQL string literal.
    const shippingLiteral = "'" + shippingRules.replaceAll('\\', '\\\\').replaceAll("'", "''") + "'";
    await tcbSql(`INSERT INTO site_config(config_key,config_value,created_at,updated_at) SELECT 'shipping_rules',${shippingLiteral},UTC_TIMESTAMP(),UTC_TIMESTAMP() WHERE NOT EXISTS (SELECT 1 FROM site_config WHERE config_key='shipping_rules')`, false);
    await tcbSql("INSERT INTO site_config(config_key,config_value,created_at,updated_at) SELECT 'payment_rules',JSON_OBJECT('payment_timeout_minutes',5),UTC_TIMESTAMP(),UTC_TIMESTAMP() WHERE NOT EXISTS (SELECT 1 FROM site_config WHERE config_key='payment_rules')", false);
    const result = { environment: ENV_ID, fixtures, evidence, initializedRulesIfMissing: true, note: '重跑不覆盖人工编辑，不为任何真实用户伪造积分、优惠券或已支付订单' };
    await writeFile('.local/alpha-seed-results.json', JSON.stringify(result, null, 2));
    console.log(JSON.stringify({ environment: ENV_ID, fixtureItems: fixtures.length, fixtureSkus: fixtures.reduce((sum, item) => sum + item.sku_ids.length, 0), evidenceFile: '.local/alpha-seed-results.json' }));
  } finally { await app.auth.signOut(); }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().then(() => process.exit(0), error => { console.error(error instanceof Error && /^(Unexpected|Development|[a-zA-Z]+:)/.test(error.message) ? error.message : 'Alpha seed failed; inspect local configuration without printing credentials'); process.exit(1); });
}
