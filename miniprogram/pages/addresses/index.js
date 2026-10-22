const { request } = require('../../services/api')
const { open, query } = require('../../services/navigation')
Page({
  data: { items: [], selecting: false, loading: false, submitting: false, error: '' },
  onLoad(options) { this.selecting = options.select === '1'; this.setData({ selecting: this.selecting }) },
  onShow() { return this.load() },
  async load() {
    if (this.data.loading) return
    this.setData({ loading: true, error: '' })
    try { const { data } = await request('listAddresses', {}); this.setData({ items: data.addresses }) }
    catch (e) { this.setData({ error: e.message || '地址读取失败' }) }
    finally { this.setData({ loading: false }) }
  },
  choose(e) { if (this.selecting && !this.data.submitting) { wx.setStorageSync('stone.selectedAddressId', e.currentTarget.dataset.id); wx.navigateBack() } },
  create() { open(query('/pages/address-edit/index', { select: this.selecting ? '1' : '0' })) },
  edit(e) { if (!this.data.submitting) open(query('/pages/address-edit/index', { address_id: e.currentTarget.dataset.id })) },
  async defaultAddress(e) { const id = e.currentTarget.dataset.id; const item = this.data.items.find(row => row.address_id === id); if (!item || item.is_default || this.data.submitting) return; return this.mutate('setDefaultAddress', id) },
  remove(e) { if (this.data.submitting) return; const id = e.currentTarget.dataset.id; wx.showModal({ title: '删除收货地址', content: '确认删除此地址？历史订单中的收货信息不受影响。', success: result => { if (result.confirm) this.mutate('deleteAddress', id) } }) },
  async mutate(action, id) { if (this.data.submitting) return; this.setData({ submitting: true, error: '' }); try { await request(action, { address_id: id }); await this.load() } catch (e) { this.setData({ error: e.message || '地址操作失败' }) } finally { this.setData({ submitting: false }) } },
})
