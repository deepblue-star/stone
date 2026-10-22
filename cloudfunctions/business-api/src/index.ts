import cloudbase, { type IContextParam } from '@cloudbase/node-sdk';
import wx from 'wx-server-sdk';
import { createMysqlDatabase } from '../../../packages/backend/src/db/mysql';
import { createDaos } from '../../../packages/backend/src/dao/index';
import { SiteConfigService } from '../../../packages/backend/src/services/site-config-service';
import { AdminAccessService } from '../../../packages/backend/src/services/admin-access-service';
import { createBusinessApi } from './app';
import { resolveInvocationIdentity } from './identity';
import { createHmac } from 'node:crypto';
import { UnitOfWork } from '../../../packages/backend/src/db/unit-of-work';
import { createCatalogDaos } from '../../../packages/backend/src/catalog/dao';
import { PageTokens } from '../../../packages/backend/src/catalog/rules';
import { CloudCatalogFiles } from '../../../packages/backend/src/catalog/storage';
import { CatalogNodeStorage } from '../../../packages/backend/src/catalog/node-storage';
import { AdminCatalogService } from '../../../packages/backend/src/services/admin-catalog-service';
import { CatalogService } from '../../../packages/backend/src/services/catalog-service';
import { InventoryService } from '../../../packages/backend/src/services/inventory-service';
import { PointsService } from '../../../packages/backend/src/services/points-service';
import { ReferralService } from '../../../packages/backend/src/services/referral-service';
import { ProfileService } from '../../../packages/backend/src/services/profile-service';
import { SkuCouponService } from '../../../packages/backend/src/services/sku-coupon-service';
import { DesignService } from '../../../packages/backend/src/services/design-service';
import { CartService } from '../../../packages/backend/src/services/cart-service';
import { AddressService } from '../../../packages/backend/src/services/address-service';
import { CheckoutService } from '../../../packages/backend/src/services/checkout-service';
import { OrderService } from '../../../packages/backend/src/services/order-service';
import { PaymentReconciliationService } from '../../../packages/backend/src/services/payment-reconciliation-service';
import { AdminAuditService } from '../../../packages/backend/src/services/admin-audit-service';

const database = createMysqlDatabase();
const daos = createDaos(database);
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
function pageTokenSecret(): string {
  if (process.env.CATALOG_PAGE_TOKEN_SECRET) return process.env.CATALOG_PAGE_TOKEN_SECRET;
  if (!process.env.MYSQL_PASSWORD) throw new Error('Missing catalog cursor signing configuration');
  return createHmac('sha256', process.env.MYSQL_PASSWORD).update('stone:catalog:page-token:v1').digest('hex');
}
const tokens = new PageTokens(pageTokenSecret);
const catalogStorage=new CatalogNodeStorage(()=>getRuntime().cloudbase);
const catalogFiles = new CloudCatalogFiles(() => process.env.STONE_ENV_ID ?? '', () => catalogStorage);
const service = new SiteConfigService(daos.siteConfig, adminAccess, catalogFiles);
const buyerUow = new UnitOfWork(database, createDaos);
const points = new PointsService(daos, buyerUow, { tokenSecret: pageTokenSecret, images: catalogFiles });
const referral = new ReferralService(daos, buyerUow, points);
const api = createBusinessApi({
  siteConfigService: service,
  adminAuditService: new AdminAuditService(daos, adminAccess, { tokenSecret: pageTokenSecret, images: catalogFiles }),
  reconciliationService: new PaymentReconciliationService(daos, adminAccess, { tokenSecret: pageTokenSecret }),
  buyerServices: {
    designService: new DesignService(daos, buyerUow, { tokenSecret: pageTokenSecret, images: catalogFiles }),
    cartService: new CartService(daos, buyerUow, { images: catalogFiles }),
    addressService: new AddressService(daos, buyerUow),
  },
  pointsServices: {
    pointsService: points,
    referralService: referral,
    profileService: new ProfileService(daos, buyerUow, points),
    skuCouponService: new SkuCouponService(daos, buyerUow, points, { tokenSecret: pageTokenSecret, images: catalogFiles }),
  },
  transactionServices: {
    checkoutService: new CheckoutService(daos, buyerUow, { images: catalogFiles }),
    orderService: new OrderService(daos, buyerUow, adminAccess, referral, { tokenSecret: pageTokenSecret, images: catalogFiles }),
  },
  catalogServices: {
    adminCatalogService: new AdminCatalogService(catalogDaos, catalogUow, adminAccess, tokens, catalogFiles, catalogFiles),
    catalogService: new CatalogService(catalogDaos, tokens, entry => console.warn(JSON.stringify(entry)), catalogFiles),
    inventoryService: new InventoryService(catalogDaos, catalogUow, adminAccess, tokens),
  },
  async resolveIdentity(context) {
    const sdk = getRuntime();
    return resolveInvocationIdentity(context, { getWechatContext: () => sdk.wx.getWXContext(), getCloudBaseUserInfo: () => sdk.cloudbase.auth().getUserInfo(), parseInvocationContext: value => cloudbase.parseContext(value as IContextParam) });
  },
  log(entry) { console.info(JSON.stringify(entry)); },
});

/** CloudBase SDK-invoked Event Function; caller context is interpreted by the official SDK. */
export async function main(event: unknown, context: unknown) { return api(event, context); }
