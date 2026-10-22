const { request } = require('../../services/api')
const { open, query } = require('../../services/navigation')
const { time } = require('../../services/format')
Page({
  data: { items: [], loading: false, error: '', next: null },
  onShow() { return this.load() },
  async load(append) {
    if (this.data.loading) return
    const more = append === true
    this.setData({ loading: true, error: '' })
    try {
      const { data } = await request('listDesigns', { page_token: more ? this.data.next : null, page_size: 20 })
      const items = data.designs.map(item => ({ ...item, imageUrl: (data.image_urls || {})[item.thumbnail_file_id] || '', timeText: time(item.updated_at) }))
      this.setData({ items: more ? this.data.items.concat(items) : items, next: data.next_page_token })
    } catch (e) { this.setData({ error: e.message || '设计读取失败，请重试' }) }
    finally { this.setData({ loading: false }) }
  },
  more() { if (this.data.next) return this.load(true) },
  detail(e) { const item = this.data.items[e.currentTarget.dataset.index]; if (item && item.current_design_version_id) open(query('/pages/design/index', { design_version_id: item.current_design_version_id })) },
  create() { open('/pages/editor/index') },
})
