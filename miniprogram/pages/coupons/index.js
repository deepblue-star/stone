const { request } = require('../../services/api')
const { open, query } = require('../../services/navigation')
const labels = { AVAILABLE: '可用', LOCKED: '待付款占用', USED: '已使用', REFUNDED: '已退分' }
Page({
  data: { status: 'AVAILABLE', items: [], nextPage: null, loading: false, error: '', filters: Object.keys(labels).map(value => ({ value, name: labels[value] })) },
  onShow() { this.load() },
  filter(event) { if (this.data.status === event.currentTarget.dataset.value) return; this.setData({ status: event.currentTarget.dataset.value }); this.load() },
  async load(append = false) {
    if (typeof append !== 'boolean') append = false
    const version = this.version = (this.version || 0) + 1
    const status = this.data.status
    this.setData({ loading: true, error: '', ...(!append ? { items: [], nextPage: null } : {}) })
    try {
      let items, nextPage = null
      if (status === 'AVAILABLE') {
        const [counts, materials] = await Promise.all([request('getMyAvailableSkuCoupons', {}), request('listDiyMaterials', { catalog_type: 'BEAD', category_id: null })])
        const bySku = {}
        materials.data.items.forEach(item => item.skus.forEach(sku => { bySku[sku.id] = { ...sku, item_name: item.name, is_on_sale: item.is_on_sale && sku.is_on_sale } }))
        items = counts.data.items.map(count => { const sku = bySku[count.sku_id]; return { ...count, item_name: sku ? sku.item_name : '珠子暂不可用', diameter_mm: sku ? sku.diameter_mm : null, url: sku ? (materials.data.image_urls || {})[sku.image_file_id] || '' : '', available: Boolean(sku && sku.is_on_sale && sku.available_stock > 0) } })
      } else {
        const result = await request('listMySkuCoupons', { status, page_token: append ? this.data.nextPage : null, page_size: 20 })
        items = result.data.coupons.map(item => ({ ...item, url: (result.data.image_urls || {})[item.image_file_id] || '' })); nextPage = result.data.next_page_token
      }
      if (version === this.version) this.setData({ items: append ? this.data.items.concat(items) : items, nextPage })
    } catch (error) { if (version === this.version) this.setData({ error: error.message || '优惠券读取失败' }) }
    finally { if (version === this.version) this.setData({ loading: false }) }
  },
  use(event) { const item = this.data.items[event.currentTarget.dataset.index]; if (!item) return; if (this.data.status === 'AVAILABLE') open(query('/pages/editor/index', { coupon_sku_id: item.sku_id })); else if (item.locked_order_no || item.used_order_no) open(query('/pages/order/index', { order_no: item.locked_order_no || item.used_order_no })) },
  more() { if (!this.data.loading && this.data.nextPage) this.load(true) }
})
