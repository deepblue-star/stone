import type * as C from '../../../packages/contracts/src/index';
import type { AdminCatalogService } from '../../../packages/backend/src/services/admin-catalog-service';
import type { CatalogService } from '../../../packages/backend/src/services/catalog-service';
import type { InventoryService } from '../../../packages/backend/src/services/inventory-service';
import { validateCatalogPayload } from '../../../packages/backend/src/catalog/rules';
import type { RegisteredAction } from './action-registry';
import * as H from './handlers/catalog-handlers';
export interface CatalogServices { adminCatalogService: AdminCatalogService; catalogService: CatalogService; inventoryService: InventoryService }
export function catalogActions(services: CatalogServices): ReadonlyMap<string, RegisteredAction> {
  const admin = services.adminCatalogService; const publicService = services.catalogService; const inventory = services.inventoryService;
  function trusted<P>(action: string, handler: { handle(payload: P, identity: C.TrustedIdentity): Promise<unknown> }): [string, RegisteredAction] {
    return [action, { validate: payload => validateCatalogPayload(action, payload), async run(payload, resolveIdentity) { return handler.handle(payload as P, await resolveIdentity()); } }];
  }
  function publicAction<P>(action: string, handler: { handle(payload: P): Promise<unknown> }): [string, RegisteredAction] {
    return [action, { validate: payload => validateCatalogPayload(action, payload), async run(payload) { return handler.handle(payload as P); } }];
  }
  return new Map([
    trusted('listAdminCategories', new H.ListAdminCategoriesHandler(admin)), trusted('listAdminItems', new H.ListAdminItemsHandler(admin)), trusted('getAdminCatalogItem', new H.GetAdminCatalogItemHandler(admin)),
    trusted('saveCategory', new H.SaveCategoryHandler(admin)), trusted('saveCatalogItem', new H.SaveCatalogItemHandler(admin)), trusted('saveCatalogSku', new H.SaveCatalogSkuHandler(admin)), trusted('previewSkuDeactivation', new H.PreviewSkuDeactivationHandler(admin)),
    trusted('deleteCategory', new H.DeleteCategoryHandler(admin)), trusted('deleteCatalogItem', new H.DeleteCatalogItemHandler(admin)), trusted('deleteCatalogSku', new H.DeleteCatalogSkuHandler(admin)),
    trusted('adjustInventory', new H.AdjustInventoryHandler(inventory)), trusted('listInventoryMovements', new H.ListInventoryMovementsHandler(inventory)),
    publicAction('listStandardCategories', new H.ListStandardCategoriesHandler(publicService)), publicAction('listStandardItems', new H.ListStandardItemsHandler(publicService)), publicAction('getStandardItemDetail', new H.GetStandardItemDetailHandler(publicService)), trusted('listDiyMaterials', new H.ListDiyMaterialsHandler(publicService)),
  ]);
}
