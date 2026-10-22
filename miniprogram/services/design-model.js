/** Editing is local: no prices, coupons or snapshots are sent by saveDesign. */
function estimate(components, materials, couponCounts, quantity = 1) {
  const counts = {}, freeCounts = {}, remainingFree = {}, unavailable = []
  let priceCent = 0, millimeters = 0
  components.forEach(component => {
    const sku = materials[component.sku_id]
    counts[component.sku_id] = (counts[component.sku_id] || 0) + quantity
    if (!sku || !Number.isSafeInteger(sku.price_cent) || sku.price_cent < 0) { unavailable.push(component.sku_id); return }
    millimeters += Number(sku.diameter_mm) || 0
  })
  Object.keys(couponCounts).forEach(id => { remainingFree[id] = Number(couponCounts[id]) || 0 })
  Object.keys(counts).forEach(id => {
    const free = Math.min(counts[id], Number(couponCounts[id]) || 0)
    freeCounts[id] = free; remainingFree[id] = Math.max(0, (Number(couponCounts[id]) || 0) - free)
    if (materials[id] && Number.isSafeInteger(materials[id].price_cent)) {
      const amount = (counts[id] - free) * materials[id].price_cent
      priceCent += amount
      if (!Number.isSafeInteger(counts[id]) || !Number.isSafeInteger(amount) || !Number.isSafeInteger(priceCent)) unavailable.push(id)
    }
  })
  return { priceCent: unavailable.length || !Number.isSafeInteger(quantity) || quantity < 1 || !Number.isSafeInteger(priceCent) ? null : priceCent, perimeterCm: Math.round(millimeters) / 10, counts, freeCounts, remainingFree, unavailable: [...new Set(unavailable)] }
}
function ringLayout(components, materials, width, height) {
  if (!components.length) return []
  const diameters = components.map(item => Math.max(2, Number((materials[item.sku_id] || {}).diameter_mm) || 8))
  const total = diameters.reduce((sum, value) => sum + value, 0)
  const radius = Math.min(width, height) * .33
  const scale = Math.min(5, 2 * Math.PI * radius / total)
  let consumed = 0
  return components.map((component, index) => {
    const angle = -Math.PI / 2 + 2 * Math.PI * (consumed + diameters[index] / 2) / total
    consumed += diameters[index]
    return { sku_id: component.sku_id, x: width / 2 + radius * Math.cos(angle), y: height / 2 + radius * Math.sin(angle), size: Math.max(8, Math.min(64, diameters[index] * scale)) }
  })
}
function move(components, from, to) {
  const result = components.slice()
  if (from < 0 || to < 0 || from >= result.length || to >= result.length) return result
  result.splice(to, 0, result.splice(from, 1)[0])
  return result
}
module.exports = { estimate, ringLayout, move }
