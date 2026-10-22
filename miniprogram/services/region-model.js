/** Province choices come from shipping_rules; city/district choices are bundled data. */
function regionState(data, allowed, indices) {
  const provinces = allowed.map(region => {
    const source = data.find(item => item.code === region.province_code)
    return source ? { ...source, name: region.province_name } : null
  }).filter(Boolean)
  const position = (index, length) => Math.max(0, Math.min(Number(index) || 0, Math.max(0, length - 1)))
  const p = position(indices && indices[0], provinces.length), province = provinces[p]
  let cities = province && province.children || []
  if (cities.length && !cities[0].children) cities = [{ code: cities[0].code.slice(0, 4) + '00', name: province.name, children: cities }]
  const c = position(indices && indices[1], cities.length), city = cities[c]
  const districts = city ? city.children && city.children.length ? city.children : [{ code: city.code, name: city.name }] : []
  const a = position(indices && indices[2], districts.length), district = districts[a]
  return { columns: [provinces, cities, districts], ranges: [provinces.map(row => row.name), cities.map(row => row.name), districts.map(row => row.name)], indices: [p,c,a], value: province && city && district ? { province_code: province.code, city_code: city.code, city: city.name, district_code: district.code, district: district.name } : null }
}
function indicesFor(data, allowed, address) {
  const initial = regionState(data, allowed, [0,0,0])
  const p = initial.columns[0].findIndex(row => row.code === address.province_code)
  if (p < 0) return [0,0,0]
  const province = regionState(data, allowed, [p,0,0])
  const c = Math.max(0, province.columns[1].findIndex(row => row.code === address.city_code))
  const city = regionState(data, allowed, [p,c,0])
  const a = Math.max(0, city.columns[2].findIndex(row => row.code === address.district_code))
  return [p,c,a]
}
module.exports = { regionState, indicesFor }
