const { request } = require('../../services/api')
const { open, query } = require('../../services/navigation')
Page({
  data: { categories: [], loading: false, error: '', keyword: '' },
  onShow() { this.load() },
  async load() {
    if (this.data.loading) return
    this.setData({ loading: true, error: '' })
    try {
      const { data } = await request('listStandardCategories', {})
      this.setData({ categories: data.categories.map(item => ({ ...item, coverUrl: (data.image_urls || {})[item.cover_file_id] || '' })) })
    } catch (error) { this.setData({ error: error.message || '商品分类读取失败' }) }
    finally { this.setData({ loading: false }) }
  },
  input(event) { this.setData({ keyword: event.detail.value }) },
  search() { const keyword = this.data.keyword.trim(); if (keyword) open(query('/pages/products/index', { keyword })) },
  openCategory(event) { const item = this.data.categories[event.currentTarget.dataset.index]; if (item) open(query('/pages/products/index', { category_id: item.id, name: item.name })) }
})
