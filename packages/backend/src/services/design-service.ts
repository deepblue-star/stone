import { randomBytes } from 'node:crypto';
import type * as C from '../../../contracts/src/index';
import type { DaoSet, DesignRow, DesignVersionRow } from '../dao/index';
import type { UnitOfWork } from '../db/unit-of-work';
import { PageTokens, iso } from '../catalog/rules';
import { noImageUrls, selectedImages, type ImageUrlResolver } from '../catalog/images';
import { AppError, isRecord } from '../errors';
import { canonicalId, componentDetails, decodeComponents, loadMaterials, material, requireWechat, snapshot, validateBuyerPayload } from './buyer-rules';
export interface DesignServiceOptions { tokenSecret?: string | (() => string); images?: ImageUrlResolver }
export class DesignService {
  private readonly tokens: PageTokens;
  private readonly images: ImageUrlResolver;
  constructor(private readonly daos: DaoSet, private readonly uow: UnitOfWork<DaoSet>, options: DesignServiceOptions = {}) { this.tokens = new PageTokens(options.tokenSecret ?? randomBytes(32).toString('hex')); this.images = options.images ?? noImageUrls; }
  private async owner(d: DaoSet, openid: string, id: string, lock = false, saving = false): Promise<DesignRow> {
    const row = await d.designs.findByOwnerId(openid, canonicalId(id), lock);
    if (!row) { if (saving) throw new AppError('FORBIDDEN', '无权保存该设计'); const existing = await d.designs.findByIds([canonicalId(id)]); if (!existing.length) throw new AppError('NOT_FOUND', '设计不存在'); throw new AppError('FORBIDDEN', '无权访问该设计'); } return row;
  }
  private async version(d: DaoSet, openid: string, id: string): Promise<{ design: DesignRow; version: DesignVersionRow }> {
    const version = await d.designVersions.findById(canonicalId(id)); if (!version) throw new AppError('NOT_FOUND', '设计版本不存在');
    return { version, design: await this.owner(d, openid, version.design_id) };
  }
  async saveDesign(payload: C.SaveDesignPayload, identity: C.TrustedIdentity): Promise<C.SaveDesignResult> {
    const openid = requireWechat(identity); validateBuyerPayload('saveDesign', payload);
    const designId = payload.design_id ? canonicalId(payload.design_id) : null;
    if (designId) await this.owner(this.daos, openid, designId, false, true);
    const ids = payload.components.map(c => canonicalId(c.sku_id)); const materials = await loadMaterials(this.daos, ids);
    const components: C.DesignComponent[] = ids.map(sku_id => { const { sku, item, category } = material(materials, sku_id); if (!sku || sku.is_deleted || !item || item.is_deleted || !category || category.is_deleted || !['BEAD','ACCESSORY'].includes(item.catalog_type) || item.catalog_type !== category.catalog_type) throw new AppError('ITEM_UNAVAILABLE', '设计材料不可用'); return { sku_id, snapshot: snapshot(sku, item) }; });
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        return await this.uow.run(async d => {
          const existing = designId ? await this.owner(d, openid, designId, true, true) : null;
          const current = existing ? await d.designVersions.findByDesignVersion(existing.id, existing.current_version_no) : null;
          if (existing && !current) throw new AppError('NOT_FOUND', '当前设计版本不存在');
          const same = current && JSON.stringify(decodeComponents(current.components).map(c => c.sku_id)) === JSON.stringify(ids);
          if (existing && current && same) {
            if (existing.name !== payload.name) await d.designs.update(openid, existing.id, { name: payload.name, current_version_no: existing.current_version_no });
            return { design_id: existing.id, design_version_id: current.id, version_no: current.version_no, created_new_version: false };
          }
          const version_no = (existing?.current_version_no ?? 0) + 1;
          if (version_no > 4294967295) throw new AppError('CONCURRENT_UPDATE', '设计版本超出范围');
          const id = existing?.id ?? await d.designs.insert({ _openid: openid, name: payload.name, current_version_no: version_no });
          const versionId = await d.designVersions.insert({ design_id: id, version_no, components, thumbnail_file_id: null });
          if (existing && !(await d.designs.update(openid, id, { name: payload.name, current_version_no: version_no }))) throw new AppError('CONCURRENT_UPDATE', '设计已变化，请重试');
          return { design_id: id, design_version_id: versionId, version_no, created_new_version: true };
        });
      } catch (error) {
        if (!isRecord(error) || error.code !== 'ER_DUP_ENTRY' || !String(error.sqlMessage ?? error.message ?? '').includes('uk_design_version')) throw error;
        if (attempt === 1) throw new AppError('CONCURRENT_UPDATE', '设计保存冲突，请重试');
      }
    }
    throw new AppError('CONCURRENT_UPDATE', '设计保存冲突，请重试');
  }
  private offset(token: string | null, scope: string): number { const cursor = this.tokens.decode(token, scope); const offset = cursor ? Number(cursor.id) - 1 : 0; if (!Number.isSafeInteger(offset) || offset < 0) throw new AppError('INVALID_ARGUMENT', '分页标识无效'); return offset; }
  async listDesigns(payload: C.BuyerPagePayload, identity: C.TrustedIdentity): Promise<C.DesignPage> {
    const openid = requireWechat(identity); validateBuyerPayload('listDesigns', payload); const scope = JSON.stringify(['designs',openid]); const offset = this.offset(payload.page_token, scope);
    const rows = await this.daos.designs.listByOwner(openid, payload.page_size + 1, offset);
    const designs = await Promise.all(rows.slice(0, payload.page_size).map(async row => { const current = await this.daos.designVersions.findByDesignVersion(row.id, row.current_version_no); return { design_id: row.id, name: row.name, current_version_no: row.current_version_no, current_design_version_id: current?.id ?? null, thumbnail_file_id: current?.thumbnail_file_id ?? null, updated_at: iso(row.updated_at) }; }));
    return { designs, next_page_token: rows.length > payload.page_size ? this.tokens.encode(scope, { id: String(offset + payload.page_size + 1) }) : null, image_urls: await this.images.resolve(selectedImages(designs.map(r => r.thumbnail_file_id))) };
  }
  async listDesignVersions(payload: C.ListDesignVersionsPayload, identity: C.TrustedIdentity): Promise<C.DesignVersionPage> {
    const openid = requireWechat(identity); validateBuyerPayload('listDesignVersions', payload); const design = await this.owner(this.daos, openid, payload.design_id); const scope = JSON.stringify(['design-versions',openid,design.id]); const offset = this.offset(payload.page_token, scope);
    const rows = await this.daos.designVersions.listByDesign(design.id, payload.page_size + 1, offset); const versions = rows.slice(0, payload.page_size).map(row => ({ design_version_id: row.id, version_no: row.version_no, thumbnail_file_id: row.thumbnail_file_id, created_at: iso(row.created_at) }));
    return { design_id: design.id, current_version_no: design.current_version_no, versions, next_page_token: rows.length > payload.page_size ? this.tokens.encode(scope, { id: String(offset + payload.page_size + 1) }) : null, image_urls: await this.images.resolve(selectedImages(versions.map(r => r.thumbnail_file_id))) };
  }
  async getDesignVersion(payload: C.DesignVersionPayload, identity: C.TrustedIdentity): Promise<C.DesignVersionDetail> {
    const openid = requireWechat(identity); validateBuyerPayload('getDesignVersion', payload); const { design, version } = await this.version(this.daos, openid, payload.design_version_id);
    const saved = decodeComponents(version.components); const materials = await loadMaterials(this.daos, saved.map(c => c.sku_id)); const components = componentDetails(saved, materials);
    return { design_id: design.id, name: design.name, design_version_id: version.id, version_no: version.version_no, components, image_urls: await this.images.resolve(selectedImages(components.flatMap(c => [c.snapshot.image_file_id, c.current?.image_file_id ?? null]))) };
  }
  async copyDesign(payload: C.CopyDesignPayload, identity: C.TrustedIdentity): Promise<C.CopyDesignResult> {
    const openid = requireWechat(identity); validateBuyerPayload('copyDesign', payload);
    return this.uow.run(async d => { const { version } = await this.version(d, openid, payload.design_version_id); const components = decodeComponents(version.components); const design_id = await d.designs.insert({ _openid: openid, name: payload.name, current_version_no: 1 }); const design_version_id = await d.designVersions.insert({ design_id, version_no: 1, components, thumbnail_file_id: version.thumbnail_file_id }); return { design_id, design_version_id, version_no: 1 }; });
  }
}
