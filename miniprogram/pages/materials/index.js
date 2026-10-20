const { request } = require("../../services/api");
Page({
  data: {
    catalogType: "BEAD",
    categories: [],
    categoryId: "",
    items: [],
    loading: false,
    error: "",
  },
  onLoad() {
    this.version = 0;
    this.load();
  },
  async load() {
    const version = ++this.version;
    this.setData({ loading: true, error: "" });
    try {
      const { data } = await request("listDiyMaterials", {
        catalog_type: this.data.catalogType,
        category_id: null,
      });
      if (version !== this.version) return;
      const urls = data.image_urls || {};
      const categoryId = data.categories.some(
        (c) => c.id === this.data.categoryId,
      )
        ? this.data.categoryId
        : (data.categories[0] && data.categories[0].id) || "";
      this.allItems = data.items.map((item) => ({
        ...item,
        skus: item.skus.map((sku) => ({
          ...sku,
          url: urls[sku.image_file_id] || "",
          priceText: (sku.price_cent / 100).toFixed(2),
          available:
            item.is_on_sale && sku.is_on_sale && sku.available_stock > 0,
          stockText: !item.is_on_sale || !sku.is_on_sale ? '已下架' : sku.available_stock === 0 ? '暂时缺货' : `可用 ${sku.available_stock} 件`,
        })),
      }));
      this.setData({ categories: data.categories, categoryId });
      this.filter();
    } catch (error) {
      if (version === this.version)
        this.setData({ error: error.message || "材料暂时无法读取" });
    } finally {
      if (version === this.version) this.setData({ loading: false });
    }
  },
  filter() {
    this.setData({
      items: (this.allItems || []).filter(
        (item) => item.category_id === this.data.categoryId,
      ),
    });
  },
  changeType(event) {
    const type = event.currentTarget.dataset.type;
    if (type === this.data.catalogType) return;
    this.setData({ catalogType: type, categoryId: "", items: [] });
    this.load();
  },
  chooseCategory(event) {
    this.setData({ categoryId: event.currentTarget.dataset.id });
    this.filter();
  },
});
