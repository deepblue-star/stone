const { request } = require('../../services/api')
const regions = require('../../services/regions')
const { regionState, indicesFor } = require('../../services/region-model')
Page({
  data: { form: { receiver_name: '', phone: '', address_line: '', set_as_default: false }, ranges: [[],[],[]], indices: [0,0,0], regionText: '请选择省 / 市 / 区', regionValue: null, regionChosen: false, loading: false, submitting: false, error: '' },
  onLoad(options) { this.addressId = options.address_id || null; this.selecting = options.select === '1'; return this.load() },
  async load() {
    if (this.data.loading) return
    this.setData({ loading: true, error: '' })
    try {
      const { data } = await request('getShippingRegions', {}); this.allowed = data.regions
      let indices = [0,0,0]
      if (this.addressId) {
        const { data: book } = await request('listAddresses', {}), address = book.addresses.find(row => row.address_id === this.addressId)
        if (!address) throw new Error('此地址已不存在，请返回地址列表')
        this.setData({ form: { receiver_name: address.receiver_name, phone: address.phone, address_line: address.address_line, set_as_default: address.is_default } })
        indices = indicesFor(regions, this.allowed, address)
        if (this.allowed.some(row => row.province_code === address.province_code)) { this.updateRegion(indices, true) }
        else { this.updateRegion(indices, false); this.setData({ error: '原地址所在省份已停止配送，请重新选择可配送地区' }) }
      } else this.updateRegion(indices, false)
      if (!this.data.ranges[0].length) this.setData({ error: '商家尚未配置可配送省份，请联系客服' })
    } catch (e) { this.setData({ error: e.message || '地区读取失败，请重试' }) }
    finally { this.setData({ loading: false }) }
  },
  updateRegion(indices, chosen) { const state = regionState(regions, this.allowed || [], indices); if (chosen && state.value) this.confirmedIndices = state.indices.slice(); this.setData({ ranges: state.ranges, indices: state.indices, regionValue: state.value, regionChosen: chosen && !!state.value, regionText: chosen && state.value ? state.ranges.map((range, index) => range[state.indices[index]]).join(' / ') : '请选择省 / 市 / 区' }) },
  columnChange(e) { const indices = this.data.indices.slice(), column = e.detail.column; indices[column] = e.detail.value; for (let i = column + 1; i < 3; i++) indices[i] = 0; this.updateRegion(indices, false) },
  regionChange(e) { this.updateRegion(e.detail.value, true) },
  regionCancel() { this.updateRegion(this.confirmedIndices || [0,0,0], !!this.confirmedIndices) },
  input(e) { if (this.data.submitting) return; const form = { ...this.data.form }; form[e.currentTarget.dataset.field] = e.detail.value; this.setData({ form }) },
  defaultChange(e) { this.setData({ form: { ...this.data.form, set_as_default: e.detail.value.includes('default') } }) },
  async save() {
    if (this.data.submitting || this.data.loading) return
    const form = this.data.form, receiver_name = form.receiver_name.trim(), phone = form.phone.trim(), address_line = form.address_line.trim()
    if (!receiver_name || !/^1\d{10}$/.test(phone) || !address_line || !this.data.regionChosen || !this.data.regionValue) { this.setData({ error: '请填写姓名、11位手机号、详细地址并选择可配送地区' }); return }
    this.setData({ submitting: true, error: '' })
    try { const { data } = await request('saveAddress', { address_id: this.addressId || null, receiver_name, phone, address_line, set_as_default: form.set_as_default, ...this.data.regionValue }); if (this.selecting) wx.setStorageSync('stone.selectedAddressId', data.address_id); wx.navigateBack() }
    catch (e) { this.setData({ error: e.message || '地址保存失败，请重试' }) }
    finally { this.setData({ submitting: false }) }
  },
})
