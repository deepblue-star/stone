const { request } = require('../../services/api')
const { open, query } = require('../../services/navigation')
const { money } = require('../../services/format')
Page({
  data: { items: [], selected: [], allSelected: false, count: 0, subtotalText: '0.00', goodsText: '', discountText: '', shippingText: '', quoteLoading: false, quoteError: '', quoteHint: '', loading: false, submitting: false, error: '' },
  onShow() { return this.load() },
  async load() {
    if (this.mutating) return
    const version = this.loadVersion = (this.loadVersion || 0) + 1
    this.invalidateQuote()
    this.addressId = null
    this.setData({ loading: true, error: '' })
    try {
      const [cart, addresses] = await Promise.allSettled([request('getCart', {}), request('listAddresses', {})])
      if (version !== this.loadVersion) return
      const errors = []
      if (cart.status === 'fulfilled') {
        const data = cart.value.data
        this.setData({ items: data.items.map(item => ({ ...item, imageUrl: (data.image_urls || {})[item.display.image_file_id] || '', priceText: money(item.display.current_unit_price_cent) })) })
      } else { this.setData({ items: [] }); errors.push(cart.reason.message || '购物车读取失败') }
      if (addresses.status === 'fulfilled') {
        const rows = addresses.value.data.addresses
        const address = rows.find(item => item.is_default) || rows[0]
        this.addressId = address ? address.address_id : null
      } else errors.push(addresses.reason.message || '地址读取失败')
      this.setData({ error: errors.join('；') })
      await this.selection(this.data.selected)
    } catch (e) { if (version === this.loadVersion) this.setData({ error: e.message || '购物车读取失败' }) }
    finally { if (version === this.loadVersion) this.setData({ loading: false }) }
  },
  invalidateQuote() {
    this.quoteVersion = (this.quoteVersion || 0) + 1
    this.setData({ subtotalText: this.data.selected.length ? '—' : '0.00', goodsText: '', discountText: '', shippingText: '', quoteLoading: false, quoteError: '', quoteHint: '' })
  },
  beginMutation() {
    this.mutating = true
    // A read started before a mutation cannot reselect rows or issue a new quote.
    this.loadVersion = (this.loadVersion || 0) + 1
    this.invalidateQuote()
    this.setData({ loading: false, submitting: true, error: '' })
  },
  selection(ids) {
    const selected = ids.filter(id => this.data.items.some(item => item.cart_item_id === id && item.purchasable))
    const items = this.data.items.map(item => ({ ...item, checked: selected.includes(item.cart_item_id) }))
    this.setData({ items, selected, count: selected.length, allSelected: !!selected.length && selected.length === items.filter(item => item.purchasable).length })
    this.invalidateQuote()
    return this.preview()
  },
  async preview() {
    const version = this.quoteVersion
    if (!this.data.selected.length) return
    if (this.data.error) return
    if (!this.addressId) { this.setData({ quoteHint: '结算时选择地址并核算' }); return }
    this.setData({ quoteLoading: true })
    try {
      const { data } = await request('previewOrderFromCart', { cart_item_ids: this.data.selected.slice(), address_id: this.addressId })
      if (version !== this.quoteVersion) return
      this.setData({ subtotalText: money(data.total_amount_cent), goodsText: money(data.goods_amount_cent), discountText: money(data.discount_amount_cent), shippingText: money(data.shipping_fee_cent) })
    } catch (e) { if (version === this.quoteVersion) this.setData({ quoteError: e.message || '金额预估失败' }) }
    finally { if (version === this.quoteVersion) this.setData({ quoteLoading: false }) }
  },
  toggle(e) { if (this.data.submitting) return; const id = e.currentTarget.dataset.id; return this.selection(this.data.selected.includes(id) ? this.data.selected.filter(value => value !== id) : this.data.selected.concat(id)) },
  toggleAll() { if (!this.data.submitting) return this.selection(this.data.allSelected ? [] : this.data.items.filter(item => item.purchasable).map(item => item.cart_item_id)) },
  async quantity(e) {
    if (this.data.submitting) return
    const item = this.data.items[e.currentTarget.dataset.index], quantity = item.quantity + Number(e.currentTarget.dataset.delta)
    if (!Number.isInteger(quantity) || quantity < 1 || quantity > 999) return
    this.beginMutation()
    try { await request('updateCartItem', { cart_item_id: item.cart_item_id, quantity }); this.mutating = false; await this.load() }
    catch (e) { this.invalidateQuote(); this.setData({ error: e.message || '数量修改失败' }) }
    finally { this.mutating = false; this.setData({ submitting: false }) }
  },
  remove(e) { if (!this.data.submitting) return this.confirmRemove([e.currentTarget.dataset.id]) },
  removeSelected() { if (!this.data.submitting && this.data.selected.length) return this.confirmRemove(this.data.selected.slice()) },
  confirmRemove(ids) { return new Promise(resolve => wx.showModal({ title: '删除购物车条目', content: '确认删除所选的 ' + ids.length + ' 个条目？', success: async result => { if (result.confirm) await this.deleteItems(ids); resolve() }, fail: () => resolve() })) },
  async deleteItems(ids) {
    if (this.data.submitting) return
    this.beginMutation()
    let failure = ''
    try { for (const id of ids) await request('deleteCartItem', { cart_item_id: id }) }
    catch (e) { failure = e.message || '部分条目删除失败，请重试' }
    finally { this.mutating = false; await this.load(); if (failure) this.invalidateQuote(); this.setData({ submitting: false, error: failure || this.data.error }) }
  },
  detail(e) { const item = this.data.items[e.currentTarget.dataset.index]; if (item && item.item_type === 'DESIGN') open(query('/pages/design/index', { design_version_id: item.design_version_id })) },
  checkout() { if (!this.data.submitting && this.data.selected.length) open(query('/pages/checkout/index', { cart_item_ids: this.data.selected.join(',') })) },
})
