import cloudbase from '@cloudbase/node-sdk';
import wx from 'wx-server-sdk';
import { createMysqlDatabase } from '../../../packages/backend/src/db/mysql';
import { createDaos } from '../../../packages/backend/src/dao';
import { SiteConfigService } from '../../../packages/backend/src/services/site-config-service';
import { AdminAccessService } from '../../../packages/backend/src/services/admin-access-service';
import { createBusinessApi } from './app';
import { resolveTrustedIdentity } from './identity';

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
const api = createBusinessApi({
  siteConfigService: service,
  async resolveIdentity() {
    const sdk = getRuntime();
    return resolveTrustedIdentity({ getWechatContext: () => sdk.wx.getWXContext(), getCloudBaseUserInfo: () => sdk.cloudbase.auth().getUserInfo() });
  },
  log(entry) { console.info(JSON.stringify(entry)); },
});

/** CloudBase SDK-invoked Event Function. Context is used only for its request ID. */
export async function main(event: unknown, context: unknown) { return api(event, context); }
