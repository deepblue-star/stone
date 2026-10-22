import type * as C from '../../../../packages/contracts/src/index';
import type { AdminCatalogService } from '../../../../packages/backend/src/services/admin-catalog-service';
import type { CatalogService } from '../../../../packages/backend/src/services/catalog-service';
import type { InventoryService } from '../../../../packages/backend/src/services/inventory-service';
export class ListAdminCategoriesHandler { constructor(private readonly service: AdminCatalogService) {} handle(payload: C.ListAdminCategoriesPayload, identity: C.TrustedIdentity) { return this.service.listCategories(payload, identity); } }
export class ListAdminItemsHandler { constructor(private readonly service: AdminCatalogService) {} handle(payload: C.ListAdminItemsPayload, identity: C.TrustedIdentity) { return this.service.listItems(payload, identity); } }
export class GetAdminCatalogItemHandler { constructor(private readonly service: AdminCatalogService) {} handle(payload: C.GetItemPayload, identity: C.TrustedIdentity) { return this.service.getItem(payload, identity); } }
export class SaveCategoryHandler { constructor(private readonly service: AdminCatalogService) {} handle(payload: C.SaveCategoryPayload, identity: C.TrustedIdentity) { return this.service.saveCategory(payload, identity); } }
export class SaveCatalogItemHandler { constructor(private readonly service: AdminCatalogService) {} handle(payload: C.SaveCatalogItemPayload, identity: C.TrustedIdentity) { return this.service.saveItem(payload, identity); } }
export class SaveCatalogSkuHandler { constructor(private readonly service: AdminCatalogService) {} handle(payload: C.SaveCatalogSkuPayload, identity: C.TrustedIdentity) { return this.service.saveSku(payload, identity); } }
export class PreviewSkuDeactivationHandler { constructor(private readonly service: AdminCatalogService) {} handle(payload: C.PreviewSkuDeactivationPayload, identity: C.TrustedIdentity) { return this.service.previewSkuDeactivation(payload, identity); } }
export class DeleteCategoryHandler { constructor(private readonly service: AdminCatalogService) {} handle(payload: C.DeleteCategoryPayload, identity: C.TrustedIdentity) { return this.service.deleteCategory(payload, identity); } }
export class DeleteCatalogItemHandler { constructor(private readonly service: AdminCatalogService) {} handle(payload: C.DeleteCatalogItemPayload, identity: C.TrustedIdentity) { return this.service.deleteItem(payload, identity); } }
export class DeleteCatalogSkuHandler { constructor(private readonly service: AdminCatalogService) {} handle(payload: C.DeleteCatalogSkuPayload, identity: C.TrustedIdentity) { return this.service.deleteSku(payload, identity); } }
export class AdjustInventoryHandler { constructor(private readonly service: InventoryService) {} handle(payload: C.AdjustInventoryPayload, identity: C.TrustedIdentity) { return this.service.adjustInventory(payload, identity); } }
export class ListInventoryMovementsHandler { constructor(private readonly service: InventoryService) {} handle(payload: C.ListInventoryMovementsPayload, identity: C.TrustedIdentity) { return this.service.listInventoryMovements(payload, identity); } }
export class ListStandardCategoriesHandler { constructor(private readonly service: CatalogService) {} handle() { return this.service.listStandardCategories(); } }
export class ListStandardItemsHandler { constructor(private readonly service: CatalogService) {} handle(payload: C.ListStandardItemsPayload) { return this.service.listStandardItems(payload); } }
export class GetStandardItemDetailHandler { constructor(private readonly service: CatalogService) {} handle(payload: C.GetItemPayload) { return this.service.getStandardItemDetail(payload); } }
export class ListDiyMaterialsHandler { constructor(private readonly service: CatalogService) {} handle(payload: C.ListDiyMaterialsPayload, identity: C.TrustedIdentity) { return this.service.listDiyMaterials(payload, identity); } }
