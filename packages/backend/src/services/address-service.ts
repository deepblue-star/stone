import type * as C from '../../../contracts/src/index';
import type { DaoSet, AddressRow } from '../dao/index';
import type { UnitOfWork } from '../db/unit-of-work';
import { AppError } from '../errors';
import { canonicalId, requireWechat, shippingRegions, validateBuyerPayload } from './buyer-rules';
export class AddressService {
  constructor(private readonly daos: DaoSet, private readonly uow: UnitOfWork<DaoSet>) {}
  private async owner(d: DaoSet, openid: string, id: string): Promise<AddressRow> { const row = await d.addresses.findByOwnerId(openid, canonicalId(id)); if (!row) throw new AppError('NOT_FOUND', '地址不存在'); return row; }
  async listAddresses(payload: Record<string, never>, identity: C.TrustedIdentity): Promise<C.AddressBook> {
    const openid = requireWechat(identity); validateBuyerPayload('listAddresses', payload);
    const rows: AddressRow[] = []; for (let offset = 0; ; offset += 500) { const page = await this.daos.addresses.listByOwner(openid, 500, offset); rows.push(...page); if (page.length < 500) break; }
    return { addresses: rows.map(r => ({ address_id: r.id, receiver_name: r.receiver_name, phone: r.phone, province_code: r.province_code, province: r.province, city_code: r.city_code, city: r.city, district_code: r.district_code, district: r.district, address_line: r.address_line, is_default: Boolean(r.is_default) })) };
  }
  async saveAddress(payload: C.SaveAddressPayload, identity: C.TrustedIdentity): Promise<C.SaveAddressResult> {
    const openid = requireWechat(identity); validateBuyerPayload('saveAddress', payload);
    return this.uow.run(async d => {
      const addressId = payload.address_id ? canonicalId(payload.address_id) : null; if (addressId) await this.owner(d, openid, addressId);
      const config = await d.siteConfig.findByKey('shipping_rules'); const province = shippingRegions(config?.config_value).find(r => r.province_code === payload.province_code);
      if (!province) throw new AppError('INVALID_ARGUMENT', '该省份暂不支持配送');
      const fields = { receiver_name: payload.receiver_name, phone: payload.phone, province_code: province.province_code, province: province.province_name, city_code: payload.city_code, city: payload.city, district_code: payload.district_code, district: payload.district, address_line: payload.address_line, is_default: payload.set_as_default ? 1 : 0 };
      if (payload.set_as_default) await d.addresses.clearDefault(openid);
      const id = addressId ?? await d.addresses.insert({ _openid: openid, ...fields });
      if (addressId && !(await d.addresses.update(openid, addressId, fields))) throw new AppError('NOT_FOUND', '地址不存在');
      return { address_id: id, is_default: Boolean(fields.is_default) };
    });
  }
  async setDefaultAddress(payload: C.AddressPayload, identity: C.TrustedIdentity): Promise<C.SaveAddressResult> {
    const openid = requireWechat(identity); validateBuyerPayload('setDefaultAddress', payload);
    return this.uow.run(async d => { const row = await this.owner(d, openid, payload.address_id); await d.addresses.clearDefault(openid); if (!(await d.addresses.setDefault(openid, row.id))) throw new AppError('NOT_FOUND', '地址不存在'); return { address_id: row.id, is_default: true }; });
  }
  async deleteAddress(payload: C.AddressPayload, identity: C.TrustedIdentity): Promise<{ address_id: string }> {
    const openid = requireWechat(identity); validateBuyerPayload('deleteAddress', payload); const id = canonicalId(payload.address_id); if (!(await this.daos.addresses.softDelete(openid, id))) throw new AppError('NOT_FOUND', '地址不存在'); return { address_id: id };
  }
}
