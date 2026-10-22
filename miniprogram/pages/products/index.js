const { request } = require('../../services/api')
const { open, query } = require('../../services/navigation')
function decodeText(value) {
  if (!value) return ''
  try { return decodeURIComponent(value) } catch (_) { return value }
}
Page({
  data: { title: '商品列表', categoryId: null, keyword: '', items: [], nextPage: null, loading: false, error: '' },
  onLoad(options) { this.requestVersion = 0; const keyword = decodeText(options.keyword); const name = decodeText(options.name); this.setData({ categoryId: options.category_id || null, keyword, title: name || (keyword ? '搜索结果' : '商品列表') }); return this.load() },
  input(event) { this.setData({ keyword: event.detail.value }) },
  search() { this.load() },
  async load(append = false) {
    if (typeof append !== 'boolean') append = false
    const version = ++this.requestVersion
    this.setData({ loading: true, error: '', ...(!append ? { items: [], nextPage: null } : {}) })
    try {
      const { data } = await request('listStandardItems', { category_id: this.data.categoryId, name_keyword: this.data.keyword.trim() || null, page_token: append ? this.data.nextPage : null, page_size: 20 })
      if (version !== this.requestVersion) return
      const items = data.items.map(item => ({ ...item, coverUrl: (data.image_urls || {})[item.cover_file_id] || '', priceText: item.min_price_cent === null ? '待补充规格' : '¥' + (item.min_price_cent / 100).toFixed(2) + ' 起' }))
      this.setData({ items: append ? this.data.items.concat(items) : items, nextPage: data.next_page_token })
    } catch (error) { if (version === this.requestVersion) this.setData({ error: error.message || '商品读取失败' }) }
    finally { if (version === this.requestVersion) this.setData({ loading: false }) }
  },
  more() { if (this.data.nextPage && !this.data.loading) this.load(true) },
  openItem(event) { open(query('/pages/product/index', { id: event.currentTarget.dataset.id })) }
})
