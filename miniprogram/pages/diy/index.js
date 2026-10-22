const { request } = require('../../services/api')
const { open, query } = require('../../services/navigation')
Page({
  data: { designs: [], loading: false, error: '' },
  onShow() { this.load() },
  async load() {
    if (this.data.loading) return
    this.setData({ loading: true, error: '' })
    try {
      const { data } = await request('listDesigns', { page_token: null, page_size: 6 })
      this.setData({ designs: data.designs.map(item => ({ ...item, thumbnail: (data.image_urls || {})[item.thumbnail_file_id] || '', dateText: item.updated_at ? new Date(item.updated_at).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai', hour12: false }) : '' })) })
    } catch (error) { this.setData({ error: error.message || '设计读取失败' }) }
    finally { this.setData({ loading: false }) }
  },
  more() { open('/pages/designs/index') },
  create() { open('/pages/editor/index') },
  edit(event) { open(query('/pages/editor/index', { design_version_id: event.currentTarget.dataset.id })) }
})
