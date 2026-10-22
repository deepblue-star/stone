const { request } = require('../../services/api')
const { open, query } = require('../../services/navigation')
const { estimate, ringLayout, move } = require('../../services/design-model')
Page({
  data: { name: '我的手串', designId: null, versionId: null, components: [], categories: [], category: '', type: 'BEAD', filter: '', materials: [], keyword: '', selected: -1, priceText: '0.00', perimeterText: '0', count: 0, loading: false, submitting: false, error: '', status: '添加珠子开始设计', previewMode: 'fallback', nativeCanvasMounted: false, previewBeads: [], previewStyle: '', guideStyle: '' },
  onLoad(options) { this.isDevtools = wx.getDeviceInfo().platform === 'devtools'; this.options = options; this.bySku = {}; this.couponCounts = {}; this.allCategories = []; this.draftKey = 'stone.designDraft.' + (options.design_version_id || 'new'); this.initFallbackPreview(); this.load() },
  onReady() { this.initCanvas() },
  onResize() { this.initCanvas() },
  onUnload() { this.persistDraft(); this.destroyed = true; this.previewQueryId = (this.previewQueryId || 0) + 1; this.context = null; this.canvas = null },
  async load() {
    if (this.destroyed) return
    this.setData({ loading: true, error: '' })
    try {
      const [beads, accessories, coupons] = await Promise.all([request('listDiyMaterials', { catalog_type: 'BEAD', category_id: null }), request('listDiyMaterials', { catalog_type: 'ACCESSORY', category_id: null }), request('getMyAvailableSkuCoupons', {})])
      if (this.destroyed) return
      const bySku = {}, categories = []
      ;[[beads.data, 'BEAD'], [accessories.data, 'ACCESSORY']].forEach(([data, type]) => {
        data.categories.forEach(category => categories.push({ ...category, type }))
        data.items.forEach(item => item.skus.forEach(sku => { bySku[sku.id] = { ...sku, name: item.name, category_id: item.category_id, type, url: (data.image_urls || {})[sku.image_file_id] || '', available: item.is_on_sale && sku.is_on_sale && sku.available_stock > 0 } }))
      })
      this.bySku = bySku; this.allCategories = categories; this.couponCounts = Object.fromEntries(coupons.data.items.map(item => [item.sku_id, item.available_count]))
      let components = this.data.components
      if (this.options.design_version_id && !this.loaded) {
        const { data } = await request('getDesignVersion', { design_version_id: this.options.design_version_id })
        if (this.destroyed) return
        components = data.components.map(component => ({ sku_id: component.sku_id }))
        data.components.forEach(component => {
          if (!this.bySku[component.sku_id]) { const material = component.current || component.snapshot; this.bySku[component.sku_id] = { ...material, id: component.sku_id, url: (data.image_urls || {})[material.image_file_id] || '', available: false, price_cent: null } }
        })
        this.setData({ designId: data.design_id, versionId: data.design_version_id, name: data.name })
      } else if (!this.loaded) {
        const draft = wx.getStorageSync(this.draftKey)
        if (draft && Array.isArray(draft.components)) { components = draft.components.filter(item => item && typeof item.sku_id === 'string').map(item => ({ sku_id: item.sku_id })); this.setData({ name: draft.name || '我的手串', designId: draft.designId || null, versionId: draft.versionId || null }) }
      }
      this.loaded = true
      const category = categories.find(item => item.type === 'BEAD')
      this.setData({ components, categories: categories.filter(item => item.type === 'BEAD'), category: category ? category.id : '', filter: this.options.coupon_sku_id ? 'COUPON' : '' })
      this.recompute()
    } catch (error) { if (!this.destroyed) this.setData({ error: error.message || '设计材料读取失败' }) }
    finally { if (!this.destroyed) this.setData({ loading: false }) }
  },
  recompute() {
    this.currentEstimate = estimate(this.data.components, this.bySku || {}, this.couponCounts || {})
    const e = this.currentEstimate
    const materials = Object.values(this.bySku || {}).filter(sku => {
      if (this.data.filter === 'COUPON') return (e.remainingFree[sku.id] || 0) > 0 && sku.available
      if (this.data.filter === 'USED') return (e.counts[sku.id] || 0) > 0
      return sku.type === this.data.type && sku.category_id === this.data.category
    }).filter(sku => !this.data.keyword || sku.name.includes(this.data.keyword)).map(sku => ({ ...sku, used: e.counts[sku.id] || 0, free: e.remainingFree[sku.id] || 0, priceText: Number.isSafeInteger(sku.price_cent) ? (sku.price_cent / 100).toFixed(2) : '—' }))
    this.setData({ materials, priceText: e.priceCent === null ? '需更新材料' : (e.priceCent / 100).toFixed(2), perimeterText: e.perimeterCm.toFixed(1), count: this.data.components.length, status: e.unavailable.length ? '存在失效材料，请调整后保存' : e.perimeterCm < 12 ? '珠子数量不足，继续添加' : '按实际手围调整珠子数量' })
    this.persistDraft(); this.draw()
  },
  persistDraft() { if (this.draftKey && this.loaded) wx.setStorageSync(this.draftKey, { name: this.data.name, designId: this.data.designId, versionId: this.data.versionId, components: this.data.components.map(item => ({ sku_id: item.sku_id })) }) },
  chooseCategory(event) { this.setData({ category: event.currentTarget.dataset.id, filter: '' }); this.recompute() },
  chooseFilter(event) { this.setData({ filter: event.currentTarget.dataset.value }); this.recompute() },
  changeType(event) { const type = event.currentTarget.dataset.type; const categories = this.allCategories.filter(item => item.type === type); this.setData({ type, categories, category: categories[0] ? categories[0].id : '', filter: '' }); this.recompute() },
  input(event) { this.setData({ keyword: event.detail.value }); this.recompute() },
  add(event) {
    const sku = this.bySku[event.currentTarget.dataset.id]
    if (!sku || !sku.available) return wx.showToast({ title: '当前材料不可添加', icon: 'none' })
    if ((this.currentEstimate.counts[sku.id] || 0) >= sku.available_stock) return wx.showToast({ title: '本设计用量已达当前库存', icon: 'none' })
    if (this.data.components.length >= 1000) return wx.showToast({ title: '材料数量已达上限', icon: 'none' })
    this.setData({ components: this.data.components.concat({ sku_id: sku.id }), selected: this.data.components.length }); this.recompute()
  },
  tools() { wx.showActionSheet({ itemList: ['删除选中珠子', '选中珠子前移', '选中珠子后移', '清空当前设计'], success: result => {
    const selected = this.data.selected
    if (result.tapIndex === 3) { wx.showModal({ title: '清空当前设计？', content: '已保存的版本不会删除。', success: answer => { if (answer.confirm) { this.setData({ components: [], selected: -1 }); this.recompute() } } }); return }
    if (selected < 0) return wx.showToast({ title: '请先点击画布上的珠子', icon: 'none' })
    if (result.tapIndex === 0) { const components = this.data.components.slice(); components.splice(selected, 1); this.setData({ components, selected: -1 }) }
    else { const target = Math.max(0, Math.min(this.data.components.length - 1, selected + (result.tapIndex === 1 ? -1 : 1))); this.setData({ components: move(this.data.components, selected, target), selected: target }) }
    this.recompute()
  } }) },
  async save(finish = false) {
    if (typeof finish !== 'boolean') finish = false
    if (this.data.submitting) return
    if (!this.data.components.length) return wx.showToast({ title: '请先添加珠子或配件', icon: 'none' })
    this.setData({ submitting: true, error: '' })
    try {
      const answer = await new Promise(resolve => wx.showModal({ title: '保存设计', editable: true, content: this.data.name, placeholderText: '设计名称', success: resolve, fail: () => resolve({ confirm: false }) }))
      if (!answer.confirm) return
      const name = (answer.content || this.data.name).trim()
      if (!name || name.length > 120) throw new Error('设计名称须为 1–120 个字')
      const { data } = await request('saveDesign', { design_id: this.data.designId, name, components: this.data.components.map(item => ({ sku_id: item.sku_id })) })
      this.setData({ name, designId: data.design_id, versionId: data.design_version_id }); this.persistDraft()
      if (finish) open(query('/pages/design/index', { design_version_id: data.design_version_id }))
      else wx.showToast({ title: '设计已保存', icon: 'none' })
      return data
    } catch (error) { this.setData({ error: error.message || '保存失败，草稿已保留' }) }
    finally { this.setData({ submitting: false }) }
  },
  complete() { this.save(true) },
  initFallbackPreview() {
    if (this.destroyed) return
    const info = wx.getWindowInfo(), width = info.windowWidth, height = this.isDevtools ? info.screenHeight || info.windowHeight : info.windowHeight
    if (!(width > 0 && height > 0)) return
    const rpx = width / 750, safeTop = info.safeArea ? info.safeArea.top : info.statusBarHeight || 0
    const safeBottom = info.safeArea ? Math.max(0, (info.screenHeight || height) - info.safeArea.bottom) : 0
    // Match the existing status (64rpx), actions (92.2rpx), toolbar (81rpx)
    // and material panel dimensions. DevTools' CSS 100vh uses screenHeight.
    const materialsHeight = Math.min(600 * rpx, Math.max(320 * rpx, height * .38)) + safeBottom + rpx
    const availableHeight = height - (44 + safeTop) - 237.2 * rpx - materialsHeight
    const side = Math.floor(Math.min(width, Math.max(260 * rpx, availableHeight)))
    this.canvasSize = { width: side, height: side }
    this.setData({ previewStyle: 'width:' + side + 'px;height:' + side + 'px;' }); this.useFallback()
  },
  initCanvas() {
    if (this.destroyed) return
    this.initFallbackPreview()
    if (this.isDevtools) return
    const queryId = this.previewQueryId = (this.previewQueryId || 0) + 1
    const q = wx.createSelectorQuery().in(this)
    // Skyline DevTools can stall the entire query when a canvas node is requested.
    q.select('.canvas-area').boundingClientRect()
    q.exec(result => {
      if (this.destroyed || queryId !== this.previewQueryId) return
      const rect = result[0]
      if (!rect || !(rect.width > 0 && rect.height > 0)) return
      this.canvasRect = rect; this.canvasSize = { width: rect.width, height: rect.height }
      this.setData({ previewStyle: 'width:' + rect.width + 'px;height:' + rect.height + 'px;' })
      this.useFallback()
      if (!this.isDevtools) this.setData({ nativeCanvasMounted: true }, () => this.initNativeCanvas(queryId))
    })
  },
  initNativeCanvas(queryId) {
    if (this.destroyed || this.isDevtools || queryId !== this.previewQueryId) return
    try {
      const q = wx.createSelectorQuery().in(this)
      q.select('#bracelet').fields({ node: true, size: true })
      q.exec(result => {
        if (this.destroyed || queryId !== this.previewQueryId) return
        try {
          const canvas = result[0] && result[0].node
          const context = canvas && canvas.getContext('2d')
          if (!context) { this.useFallback(); return }
          const ratio = wx.getWindowInfo().pixelRatio || 1
          canvas.width = this.canvasSize.width * ratio; canvas.height = this.canvasSize.height * ratio; context.scale(ratio, ratio)
          this.canvas = canvas; this.context = context; this.imageCache = {}
          this.draw()
          if (this.context === context) this.setData({ previewMode: 'canvas', previewBeads: [] })
        } catch (error) { this.useFallback() }
      })
    } catch (error) { this.useFallback() }
  },
  useFallback() {
    if (this.destroyed) return
    this.context = null; this.canvas = null
    this.setData({ previewMode: 'fallback', nativeCanvasMounted: false }); this.draw()
  },
  drawFallback() {
    const width = this.canvasSize.width, height = this.canvasSize.height, radius = Math.min(width, height) * .33
    const previewBeads = this.positions.map((point, index) => {
      const sku = (this.bySku || {})[point.sku_id] || {}, url = sku.url || ''
      return { ...point, index, url: this.failedPreviewImages && this.failedPreviewImages[url] ? '' : url, label: sku.name || '失效材料', selected: index === this.data.selected, style: 'left:' + (point.x - point.size / 2) + 'px;top:' + (point.y - point.size / 2) + 'px;width:' + point.size + 'px;height:' + point.size + 'px;' }
    })
    this.setData({ previewBeads, guideStyle: 'left:' + (width / 2 - radius) + 'px;top:' + (height / 2 - radius) + 'px;width:' + radius * 2 + 'px;height:' + radius * 2 + 'px;' })
  },
  previewImageError(event) {
    if (this.destroyed) return
    const url = event.currentTarget.dataset.url
    if (!url) return
    if (!this.failedPreviewImages) this.failedPreviewImages = {}
    this.failedPreviewImages[url] = true; this.draw()
  },
  draw() {
    if (this.destroyed || !this.canvasSize) return
    this.positions = ringLayout(this.data.components, this.bySku || {}, this.canvasSize.width, this.canvasSize.height)
    if (!this.context) { this.drawFallback(); return }
    try {
      const ctx = this.context, width = this.canvasSize.width, height = this.canvasSize.height
      ctx.clearRect(0, 0, width, height); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, width, height)
      ctx.strokeStyle = '#eee'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(width / 2, height / 2, Math.min(width, height) * .33, 0, Math.PI * 2); ctx.stroke()
      this.positions.forEach((point, index) => {
        const sku = this.bySku[point.sku_id] || {}, cached = this.imageCache[sku.url]
        ctx.save(); ctx.beginPath(); ctx.arc(point.x, point.y, point.size / 2, 0, Math.PI * 2); ctx.clip()
        if (cached && cached.ready) ctx.drawImage(cached.image, point.x - point.size / 2, point.y - point.size / 2, point.size, point.size)
        else { ctx.fillStyle = sku.available === false ? '#ddd' : '#d7dad9'; ctx.fillRect(point.x - point.size / 2, point.y - point.size / 2, point.size, point.size); if (sku.url && !cached) { const image = this.canvas.createImage(), entry = { image, ready: false }; this.imageCache[sku.url] = entry; image.onload = () => { if (this.destroyed || this.imageCache[sku.url] !== entry) return; entry.ready = true; this.draw() }; image.onerror = () => {}; image.src = sku.url } }
        ctx.restore(); ctx.beginPath(); ctx.arc(point.x, point.y, point.size / 2 + 2, 0, Math.PI * 2); ctx.strokeStyle = index === this.data.selected ? '#b93434' : '#ccc'; ctx.lineWidth = index === this.data.selected ? 3 : 1; ctx.stroke()
      })
    } catch (error) { this.useFallback() }
  },
  selectPreviewBead(event) {
    if (this.destroyed || this.tapEligible === false || !this.positions) return
    const index = Number(event.currentTarget && event.currentTarget.dataset.index)
    if (!Number.isInteger(index) || index < 0 || index >= this.positions.length) return
    this.setData({ selected: index }); this.draw()
  },
  touchStart(event) {
    const touch = event.touches[0]
    if (this.destroyed || !touch || !this.positions) return
    this.tapEligible = true
    let selected = -1, point
    if (this.data.previewMode === 'fallback') {
      const index = Number(event.currentTarget && event.currentTarget.dataset.index)
      if (Number.isInteger(index) && index >= 0 && index < this.positions.length) selected = index
      point = selected < 0 ? { x: 0, y: 0 } : this.positions[selected]
      this.dragClientStart = { x: touch.clientX === undefined ? touch.x : touch.clientX, y: touch.clientY === undefined ? touch.y : touch.clientY }
    } else {
      if (!this.canvasRect) return
      this.dragClientStart = null; point = this.touchPoint(touch)
      this.positions.forEach((bead, index) => { if (Math.hypot(bead.x - point.x, bead.y - point.y) <= bead.size / 2 + 8) selected = index })
    }
    this.didDrag = false; this.dragStart = point; this.dragFrom = selected; this.dragTo = selected; this.setData({ selected }); this.draw()
  },
  touchPoint(touch) {
    if (this.data.previewMode === 'fallback' && this.dragClientStart) return { x: this.dragStart.x + (touch.clientX === undefined ? touch.x : touch.clientX) - this.dragClientStart.x, y: this.dragStart.y + (touch.clientY === undefined ? touch.y : touch.clientY) - this.dragClientStart.y }
    return { x: touch.clientX === undefined ? touch.x : touch.clientX - this.canvasRect.left, y: touch.clientY === undefined ? touch.y : touch.clientY - this.canvasRect.top }
  },
  touchMove(event) { if (this.destroyed || !(this.dragFrom >= 0) || !event.touches[0]) return; const point = this.touchPoint(event.touches[0]); let nearest = -1, distance = Infinity; this.positions.forEach((bead, index) => { const d = Math.hypot(bead.x - point.x, bead.y - point.y); if (d < distance) { distance = d; nearest = index } }); this.dragTo = nearest; this.didDrag = Math.hypot(point.x - this.dragStart.x, point.y - this.dragStart.y) > 8; if (this.didDrag) this.tapEligible = false },
  touchEnd() { if (!this.destroyed && this.didDrag && this.dragFrom >= 0 && this.dragTo >= 0) { this.setData({ components: move(this.data.components, this.dragFrom, this.dragTo), selected: this.dragTo }); this.recompute() } this.touchCancel() },
  touchCancel() { this.didDrag = false; this.dragFrom = -1; this.dragTo = -1; this.dragClientStart = null }
})
