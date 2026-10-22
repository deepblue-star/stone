// Run as automation_evaluate fn-source in the logged-in development Mini Program.
// Creates clearly labelled, reusable fixtures for the CURRENT native user only.
// No fake identity, arbitrary balance adjustment, order creation or payment.
async function alphaNativeSmoke() {
  const existing = globalThis.__stoneAlphaNativeSmoke
  if (existing && existing.status === 'running') return { status: 'running', started_at: existing.started_at }
  const state = { status: 'running', started_at: new Date().toISOString() }
  globalThis.__stoneAlphaNativeSmoke = state
  run().then(result => { state.result = result; state.status = 'completed' }, error => { state.error = error.message; state.status = 'failed' })
  return { status: 'started', started_at: state.started_at }
  async function run() {
  const results = []
  async function api(action, payload) {
    const response = (await wx.cloud.callFunction({ name: 'business-api', config: { env: 'stone-d3gga4t2g2ffaedb6' }, data: { action, payload } })).result
    results.push({ action, ok: response.ok, code: response.code, request_id: response.request_id })
    if (!response.ok) throw new Error(action + ': ' + response.code)
    return response.data
  }
  function check(condition, label) { if (!condition) throw new Error('Alpha verification: ' + label) }
  const center = await api('getPointsCenter', {})
  const signIn = await api('dailyCheckIn', {})
  if (center.checked_in_today) check(signIn.idempotent_replay && (await api('getPointsCenter', {})).balance === center.balance, 'check-in replay does not credit again')
  const mall = await api('listPointsExchangeSkus', { category_id: null, page_token: null, page_size: 100 })
  const material = mall.items.find(row => row.item_name === '【Alpha样例】净体白水晶' && row.diameter_mm === 6)
  check(material, 'seed BEAD SKU exists')
  const exchange = await api('exchangePointsForSkuCoupon', { exchange_key: 'alpha_native_smoke_exchange_v1', sku_id: material.sku_id })
  const replay = await api('exchangePointsForSkuCoupon', { exchange_key: 'alpha_native_smoke_exchange_v1', sku_id: material.sku_id })
  check(replay.idempotent_replay && replay.coupon_id === exchange.coupon_id, 'exchange replay reuses coupon')
  check(replay.points_balance === exchange.points_balance, 'exchange replay does not debit again')
  const available = await api('getMyAvailableSkuCoupons', {})
  check(available.items.some(row => row.sku_id === material.sku_id && row.available_count >= 1), 'coupon available by SKU')

  const name = '【Alpha人工测试】白水晶设计'
  const designs = await api('listDesigns', { page_token: null, page_size: 100 })
  let design = designs.designs.find(row => row.name === name)
  if (!design) {
    const created = await api('saveDesign', { design_id: null, name, components: Array.from({ length: 27 }, () => ({ sku_id: material.sku_id })) })
    const second = mall.items.find(row => row.item_name === material.item_name && row.diameter_mm === 8)
    check(second, 'second seed specification exists')
    const components = Array.from({ length: 27 }, (_, index) => ({ sku_id: index === 0 ? second.sku_id : material.sku_id }))
    const updated = await api('saveDesign', { design_id: created.design_id, name, components })
    check(updated.version_no === 2, 'changed components create second version')
    design = { design_id: updated.design_id, current_design_version_id: updated.design_version_id }
  }
  const detail = await api('getDesignVersion', { design_version_id: design.current_design_version_id })
  const unchanged = await api('saveDesign', { design_id: design.design_id, name: detail.name, components: detail.components.map(row => ({ sku_id: row.sku_id })) })
  check(!unchanged.created_new_version && unchanged.design_version_id === detail.design_version_id, 'unchanged save keeps version')
  const versions = await api('listDesignVersions', { design_id: design.design_id, page_token: null, page_size: 100 })
  check(versions.versions.length >= 2, 'history is readable')
  const copyName = '【Alpha人工测试】复制设计'
  let copy = designs.designs.find(row => row.name === copyName)
  if (!copy) {
    const copied = await api('copyDesign', { design_version_id: design.current_design_version_id, name: copyName })
    copy = { design_id: copied.design_id, current_design_version_id: copied.design_version_id }
  }
  check(copy.design_id !== design.design_id, 'copy is independent')

  const regions = await api('getShippingRegions', {})
  check(regions.regions.some(row => row.province_code === '440000'), 'test province is enabled')
  const book = await api('listAddresses', {})
  let address = book.addresses.find(row => row.receiver_name === 'Alpha测试不发货' && row.address_line === '仅供开发人工测试，请勿实际配送')
  if (!address) {
    const saved = await api('saveAddress', { address_id: null, receiver_name: 'Alpha测试不发货', phone: '00000000000', province_code: '440000', city_code: '440300', city: '深圳市', district_code: '440305', district: '南山区', address_line: '仅供开发人工测试，请勿实际配送', set_as_default: false })
    address = { address_id: saved.address_id }
  }
  const items = await api('listStandardItems', { category_id: null, name_keyword: '【Alpha样例】水晶成品手串', page_token: null, page_size: 20 })
  check(items.items.length === 1, 'standard seed item exists')
  const standard = await api('getStandardItemDetail', { item_id: items.items[0].item_id })
  const standardSku = standard.skus.find(row => row.available_stock > 0)
  check(standardSku, 'standard seed SKU available')
  let cart = await api('getCart', {})
  const selected = []
  for (const versionId of [design.current_design_version_id, copy.current_design_version_id]) {
    let item = cart.items.find(row => row.item_type === 'DESIGN' && row.design_version_id === versionId)
    if (!item) item = await api('addCartItem', { item_type: 'DESIGN', design_version_id: versionId, quantity: 1 })
    selected.push(item.cart_item_id)
  }
  let standardCart = cart.items.find(row => row.item_type === 'STANDARD' && row.sku_id === standardSku.sku_id)
  if (!standardCart) standardCart = await api('addCartItem', { item_type: 'STANDARD', sku_id: standardSku.sku_id, quantity: 1 })
  selected.push(standardCart.cart_item_id)
  cart = await api('getCart', {})
  check(selected.every(id => cart.items.some(row => row.cart_item_id === id)), 'cart fixtures persist')
  const quote = await api('previewOrderFromCart', { cart_item_ids: selected, address_id: address.address_id })
  const applied = quote.items.reduce((sum, line) => sum + line.applied_sku_coupons.reduce((count, row) => count + (row.sku_id === material.sku_id ? row.free_quantity : 0), 0), 0)
  const couponCount = available.items.find(row => row.sku_id === material.sku_id).available_count
  check(applied <= couponCount && applied >= 1, 'shared coupon is not duplicated across designs')
  check(quote.items.length === 3 && quote.quote_hash, 'mixed checkout quote succeeds')
  const total = [quote.goods_amount_cent, quote.discount_amount_cent, quote.shipping_fee_cent, quote.total_amount_cent].map(Number)
  check(total.every(Number.isSafeInteger) && total[0] - total[1] + total[2] === total[3], 'quote arithmetic')
  return { checks: results, fixtures: { design_id: design.design_id, copy_design_id: copy.design_id, address_id: address.address_id, cart_item_ids: selected, coupon_id: exchange.coupon_id }, quote: { line_count: quote.items.length, free_quantity: applied, total_amount_cent: quote.total_amount_cent }, noOrderCreated: true }
  }
}
