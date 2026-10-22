const { request } = require('../../services/api')
const { open } = require('../../services/navigation')
Page({
  data: { loading: false, error: '', bannerError: '', banners: [], customer: null, entries: [], entryImages: { DIY: '', STANDARD: '' }, entryImageErrors: { DIY: '', STANDARD: '' } },
  onLoad() { return this.load() },
  onShow() { return this.load() },
  onHide() { this.loadVersion = (this.loadVersion || 0) + 1; this.setData({ loading: false }) },
  onUnload() { this.disposed = true; this.loadVersion = (this.loadVersion || 0) + 1 },
  async load() {
    if (this.data.loading || this.disposed) return
    const version = this.loadVersion = (this.loadVersion || 0) + 1
    this.setData({ loading: true, error: '', bannerError: '', entryImageErrors: { DIY: '', STANDARD: '' } })
    await Promise.all([
      this.loadConfig(version),
      this.loadEntryImage('DIY', 'listDiyMaterials', { catalog_type: 'BEAD', category_id: null }, version),
      this.loadEntryImage('STANDARD', 'listStandardCategories', {}, version)
    ])
    if (!this.disposed && version === this.loadVersion) this.setData({ loading: false })
  },
  async loadConfig(version) {
    try {
      const { data } = await request('getPublicSiteConfig', {})
      const fileIds = data.banners.map(item => item.image_file_id)
      if (data.customer_service && data.customer_service.qr_file_id) fileIds.push(data.customer_service.qr_file_id)
      let urls = data.image_urls || {}
      if (this.disposed || version !== this.loadVersion) return
      const applyConfig = () => {
        if (!this.disposed && version === this.loadVersion) this.setData({ banners: data.banners.map((item, index) => ({ ...item, displayKey: item.image_file_id + ':' + index, url: urls[item.image_file_id] || '' })), customer: data.customer_service, entries: data.feature_entries, customerQr: data.customer_service ? urls[data.customer_service.qr_file_id] || '' : '' })
      }
      applyConfig()
      if (fileIds.length && !data.image_urls) {
        try {
          const result = await wx.cloud.getTempFileURL({ fileList: [...new Set(fileIds)] })
          urls = Object.fromEntries(result.fileList.filter(item => typeof item.tempFileURL === 'string' && item.tempFileURL.startsWith('https://')).map(item => [item.fileID, item.tempFileURL]))
          applyConfig()
        } catch (error) {
          if (!this.disposed && version === this.loadVersion) this.setData({ bannerError: '首页图片暂不可用' })
        }
      }
    } catch (error) { if (!this.disposed && version === this.loadVersion) this.setData({ error: error.message || '首页读取失败' }) }
  },
  async loadEntryImage(key, action, payload, version) {
    try {
      const { data } = await request(action, payload)
      const urls = data.image_urls || {}
      let url = ''
      if (key === 'DIY') {
        for (const item of data.items) {
          if (!item.is_on_sale) continue
          const sku = item.skus.find(row => row.is_on_sale && row.available_stock > 0 && urls[row.image_file_id])
          if (sku) { url = urls[sku.image_file_id]; break }
        }
      } else {
        const category = data.categories.find(row => urls[row.cover_file_id])
        if (category) url = urls[category.cover_file_id]
      }
      if (!this.disposed && version === this.loadVersion) this.setData({ entryImages: { ...this.data.entryImages, [key]: url } })
    } catch (error) {
      if (!this.disposed && version === this.loadVersion) this.setData({ entryImages: { ...this.data.entryImages, [key]: '' }, entryImageErrors: { ...this.data.entryImageErrors, [key]: error.message || '图片暂不可用' } })
    }
  },
  entryImageError(event) {
    if (this.disposed) return
    const { key, url } = event.currentTarget.dataset
    if ((key === 'DIY' || key === 'STANDARD') && url && this.data.entryImages[key] === url) {
      this.setData({ entryImages: { ...this.data.entryImages, [key]: '' }, entryImageErrors: { ...this.data.entryImageErrors, [key]: '图片暂不可用' } })
    }
  },
  bannerImageError(event) {
    if (this.disposed) return
    const { index, url } = event.currentTarget.dataset
    if (!this.data.banners[index] || this.data.banners[index].url !== url) return
    this.setData({ banners: this.data.banners.map((item, position) => position === Number(index) ? { ...item, url: '' } : item) })
  },
  enter(event) {
    const key = event.currentTarget.dataset.key
    const entry = this.data.entries.find(item => item.key === key)
    if (entry && !entry.enabled) return wx.showToast({ title: '即将上线', icon: 'none' })
    open(key === 'DIY' ? '/pages/diy/index' : '/pages/catalog/index')
  },
  bannerTap(event) {
    const item = this.data.banners[event.currentTarget.dataset.index]
    if (!item || item.link_type !== 'PAGE') return
    const path = item.link_value || ''
    if (/^\/?pages\/[a-zA-Z0-9_/-]+(?:\?[^#]*)?$/.test(path)) open(path.startsWith('/') ? path : '/' + path)
  },
  contact() {
    if (!this.data.customer) return wx.showToast({ title: '客服信息暂未配置', icon: 'none' })
    wx.showActionSheet({ itemList: ['复制客服微信', '查看客服二维码'], success: result => {
      if (result.tapIndex === 0) wx.setClipboardData({ data: this.data.customer.wechat_id })
      else if (this.data.customerQr) wx.previewImage({ urls: [this.data.customerQr] })
      else wx.showToast({ title: '客服二维码暂不可用', icon: 'none' })
    } })
  }
})
