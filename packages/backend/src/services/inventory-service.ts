import type { AdjustInventoryPayload, InventoryMovementPage, InventoryStock, ListInventoryMovementsPayload, TrustedIdentity } from '../../../contracts/src/index';
import type { CatalogDaos } from '../catalog/dao';
import { stockModel } from '../catalog/models';
import { inventoryTotal, iso, PageTokens, validateCatalogPayload } from '../catalog/rules';
import type { UnitOfWork } from '../db/unit-of-work';
import { AppError } from '../errors';
import type { AdminAccessService } from './admin-access-service';
export class InventoryService {
  constructor(private readonly daos: CatalogDaos, private readonly uow: UnitOfWork<CatalogDaos>, private readonly access: AdminAccessService, private readonly tokens: PageTokens) {}
  async adjustInventory(payload: AdjustInventoryPayload, identity: TrustedIdentity): Promise<InventoryStock> {
    const admin = await this.access.requireEnabledAdmin(identity);
    validateCatalogPayload('adjustInventory', payload);
    return this.uow.run(async daos => {
      const sku = await daos.skus.findById(payload.sku_id, true);
      if (!sku || sku.is_deleted) throw new AppError('NOT_FOUND', 'SKU不存在');
      const eventKey = `ADMIN_ADJUST:${payload.operation_key}:${sku.id}`;
      const prior = await daos.inventoryMovements.findByEventKey(eventKey);
      if (prior) {
        if (prior.stock_delta !== payload.stock_delta || prior.remark !== payload.remark || prior.operator_uid !== admin.auth_uid) throw new AppError('CONFLICT', '操作标识已用于不同的库存调整');
        return stockModel(sku);
      }
      const total = inventoryTotal(sku.stock_total, sku.stock_reserved, payload.stock_delta);
      await daos.skus.adjustStock(sku.id, total);
      await daos.inventoryMovements.insertAdjustment(eventKey, sku.id, payload.stock_delta, admin.auth_uid, payload.remark);
      return stockModel({ ...sku, stock_total: total });
    });
  }
  async listInventoryMovements(payload: ListInventoryMovementsPayload, identity: TrustedIdentity): Promise<InventoryMovementPage> {
    const admin = await this.access.requireEnabledAdmin(identity);
    validateCatalogPayload('listInventoryMovements', payload);
    const scope = JSON.stringify(['inventory', admin.auth_uid, payload.sku_id]);
    const rows = await this.daos.inventoryMovements.listBySku(payload.sku_id, this.tokens.decode(payload.page_token, scope), payload.page_size + 1);
    const visible = rows.slice(0, payload.page_size); const last = visible.at(-1);
    return { movements: visible.map(row => ({ action: row.action, stock_delta: row.stock_delta, reserved_delta: row.reserved_delta, order_id: row.order_id, operator_uid: row.operator_uid, remark: row.remark, created_at: iso(row.created_at) })), next_page_token: rows.length > payload.page_size && last ? this.tokens.encode(scope, { id: last.id, time: iso(last.created_at).slice(0, 19).replace('T', ' ') }) : null };
  }
}
