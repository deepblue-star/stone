import cloudbase, { type IContextParam } from '@cloudbase/node-sdk';
import wx from 'wx-server-sdk';
import { createMysqlDatabase } from '../../../packages/backend/src/db/mysql';
import { createDaos } from '../../../packages/backend/src/dao';
import { SiteConfigService } from '../../../packages/backend/src/services/site-config-service';
import { AdminAccessService } from '../../../packages/backend/src/services/admin-access-service';
import { createBusinessApi } from './app';
import { resolveInvocationIdentity } from './identity';
import { createHmac } from 'node:crypto';
import { UnitOfWork } from '../../../packages/backend/src/db/unit-of-work';
import { createCatalogDaos } from '../../../packages/backend/src/catalog/dao';
import { PageTokens } from '../../../packages/backend/src/catalog/rules';
import { CloudCatalogFiles } from '../../../packages/backend/src/catalog/storage';
import { AdminCatalogService } from '../../../packages/backend/src/services/admin-catalog-service';
import { CatalogService } from '../../../packages/backend/src/services/catalog-service';
import { InventoryService } from '../../../packages/backend/src/services/inventory-service';

const database = createMysqlDatabase();
const daos = createDaos(database);
const service = new SiteConfigService(daos.siteConfig, new AdminAccessService(daos.admin));
let runtime: { wx: typeof wx; cloudbase: ReturnType<typeof cloudbase.init> } | undefined;
function getRuntime() {
  if (runtime) return runtime;
  const env = process.env.STONE_ENV_ID;
  if (!env) throw new Error('Missing CloudBase environment configuration');
  wx.init({ env });
  runtime = { wx, cloudbase: cloudbase.init({ env }) };
  return runtime;
}
const catalogDaos = createCatalogDaos(database);
const catalogUow = new UnitOfWork(database, createCatalogDaos);
const adminAccess = new AdminAccessService(daos.admin);
const tokens = new PageTokens(() => {
  if (process.env.CATALOG_PAGE_TOKEN_SECRET) return process.env.CATALOG_PAGE_TOKEN_SECRET;
  if (!process.env.MYSQL_PASSWORD) throw new Error('Missing catalog cursor signing configuration');
  return createHmac('sha256', process.env.MYSQL_PASSWORD).update('stone:catalog:page-token:v1').digest('hex');
});
const catalogFiles = new CloudCatalogFiles(() => process.env.STONE_ENV_ID ?? '', () => getRuntime().cloudbase);
const api = createBusinessApi({
  siteConfigService: service,
  catalogServices: {
    adminCatalogService: new AdminCatalogService(catalogDaos, catalogUow, adminAccess, tokens, catalogFiles, catalogFiles),
    catalogService: new CatalogService(catalogDaos, tokens, entry => console.warn(JSON.stringify(entry)), catalogFiles),
    inventoryService: new InventoryService(catalogDaos, catalogUow, adminAccess, tokens),
  },
  async resolveIdentity(context) {
    const sdk = getRuntime();
    return resolveInvocationIdentity(context, { getWechatContext: () => sdk.wx.getWXContext(), getCloudBaseUserInfo: () => sdk.cloudbase.auth().getUserInfo(), getCloudBaseContext: value => cloudbase.getCloudbaseContext(value as IContextParam) });
  },
  log(entry) { console.info(JSON.stringify(entry)); },
});

/** CloudBase SDK-invoked Event Function; caller context is interpreted by the official SDK. */
export async function main(event: unknown, context: unknown) { return api(event, context); }
