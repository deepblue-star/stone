const { request } = require('../../services/api')
const { open, query } = require('../../services/navigation')
const { time, money } = require('../../services/format')
const { estimate } = require('../../services/design-model')
Page({
  data: { detail: null, components: [], versions: [], currentVersion: null, next: null, loading: false, versionsLoading: false, submitting: false, error: '', versionsError: '', purchasable: false, quantity: 1, estimateText: '无法估算' },
  onLoad(options) { this.versionId = options.design_version_id; return this.load() },
  onShow() { return this.load() },
  async load() {
    const version = this.loadVersion = (this.loadVersion || 0) + 1
    const versionId = this.versionId
    this.materials = null; this.couponCounts = null
    this.historyVersion = (this.historyVersion || 0) + 1
    this.setData({ detail: null, components: [], versions: [], currentVersion: null, next: null, versionsLoading: false, versionsError: '', purchasable: false, estimateText: '无法估算' })
    if (!this.versionId) { this.setData({ error: '设计版本链接不完整' }); return }
    this.setData({ loading: true, error: '' })
    try {
      const results = await Promise.allSettled([
        request('getDesignVersion', { design_version_id: versionId }),
        request('listDiyMaterials', { catalog_type: 'BEAD', category_id: null }),
        request('listDiyMaterials', { catalog_type: 'ACCESSORY', category_id: null }),
        request('getMyAvailableSkuCoupons', {})
      ])
      if (version !== this.loadVersion) return
      const detail = results[0]
      if (detail.status === 'fulfilled') {
        const data = detail.value.data
        const components = data.components.map((item, index) => { const display = item.current || item.snapshot; return { ...item, index, name: display.name, diameter: display.diameter_mm, imageUrl: (data.image_urls || {})[display.image_file_id] || '', missing: !item.current } })
        this.setData({ detail: data, components })
      }
      const failed = results.find(result => result.status === 'rejected')
      if (failed) this.setData({ error: failed.reason.message || '当前设计或预计价读取失败' })
      else {
        const materials = {}, coupons = {}
        ;[results[1].value.data, results[2].value.data].forEach(data => data.items.forEach(item => item.skus.forEach(sku => { materials[sku.id] = { ...sku, available: item.is_on_sale && sku.is_on_sale } })))
        results[3].value.data.items.forEach(item => { if (Number.isSafeInteger(item.available_count) && item.available_count > 0) coupons[item.sku_id] = (coupons[item.sku_id] || 0) + item.available_count })
        this.materials = materials; this.couponCounts = coupons
        this.reestimate()
      }
      if (this.data.detail) await this.loadVersions(false)
    } catch (e) { if (version === this.loadVersion) this.setData({ error: e.message || '设计读取失败', purchasable: false, estimateText: '无法估算' }) }
    finally { if (version === this.loadVersion) this.setData({ loading: false }) }
  },
  reestimate() {
    if (!this.data.detail || !this.materials || !this.couponCounts) return
    const result = estimate(this.data.detail.components, this.materials, this.couponCounts, this.data.quantity)
    const purchasable = result.priceCent !== null && !!this.data.components.length && this.data.components.every(item => item.purchasable && this.materials[item.sku_id] && this.materials[item.sku_id].available)
    this.setData({ estimateText: result.priceCent === null ? '无法估算' : money(result.priceCent), purchasable })
  },
  async loadVersions(append) {
    if (!this.data.detail || this.data.versionsLoading) return
    const version = this.historyVersion = (this.historyVersion || 0) + 1
    const loadVersion = this.loadVersion
    this.setData({ versionsLoading: true, versionsError: '' })
    try {
      const { data } = await request('listDesignVersions', { design_id: this.data.detail.design_id, page_token: append === true ? this.data.next : null, page_size: 20 })
      if (version !== this.historyVersion || loadVersion !== this.loadVersion) return
      const versions = data.versions.map(item => ({ ...item, timeText: time(item.created_at), imageUrl: (data.image_urls || {})[item.thumbnail_file_id] || '' }))
      this.setData({ versions: append === true ? this.data.versions.concat(versions) : versions, currentVersion: data.current_version_no, next: data.next_page_token })
    } catch (e) { if (version === this.historyVersion && loadVersion === this.loadVersion) this.setData({ versionsError: e.message || '历史版本读取失败' }) }
    finally { if (version === this.historyVersion && loadVersion === this.loadVersion) this.setData({ versionsLoading: false }) }
  },
  moreVersions() { if (this.data.next) return this.loadVersions(true) },
  version(e) { if (this.data.submitting) return; this.versionId = e.currentTarget.dataset.id; this.setData({ quantity: 1 }); return this.load() },
  edit() { if (this.data.detail) open(query('/pages/editor/index', { design_version_id: this.versionId })) },
  async copy() {
    if (this.data.submitting || !this.data.detail) return
    this.setData({ submitting: true, error: '' })
    try { const { data } = await request('copyDesign', { design_version_id: this.versionId, name: (this.data.detail.name || '我的手串').slice(0, 90) + '副本' }); open(query('/pages/design/index', { design_version_id: data.design_version_id })) }
    catch (e) { this.setData({ error: e.message || '复制失败，请重试' }) }
    finally { this.setData({ submitting: false }) }
  },
  quantity(e) { if (!this.data.submitting) { const quantity = this.data.quantity + Number(e.currentTarget.dataset.delta); if (!Number.isInteger(quantity)) return; this.setData({ quantity: Math.max(1, Math.min(999, quantity)) }); this.reestimate() } },
  async addCart() {
    if (this.data.submitting || !this.data.purchasable) return
    this.setData({ submitting: true, error: '' })
    try { await request('addCartItem', { item_type: 'DESIGN', design_version_id: this.versionId, quantity: this.data.quantity }); wx.showToast({ title: '已加入购物车', icon: 'success' }) }
    catch (e) { this.setData({ error: e.message || '加入购物车失败' }) }
    finally { this.setData({ submitting: false }) }
  },
  buy() { if (!this.data.submitting && this.data.purchasable) open(query('/pages/checkout/index', { item_type: 'DESIGN', design_version_id: this.versionId, quantity: this.data.quantity })) },
})
