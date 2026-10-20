const { request } = require("../../services/api");
Page({
  data: {
    categories: [],
    categoryId: "",
    items: [],
    nextPage: null,
    loading: false,
    error: "",
    urls: {},
  },
  onLoad() {
    this.requestVersion = 0;
    this.load();
  },
  async load() {
    this.setData({ loading: true, error: "" });
    try {
      const { data } = await request("listStandardCategories", {});
      const categoryId = data.categories.length ? data.categories[0].id : "";
      this.setData({ categories: data.categories, categoryId });
      if (categoryId) await this.loadItems();
    } catch (error) {
      this.setData({ error: error.message || "商品暂时无法读取，请稍后重试" });
    } finally {
      this.setData({ loading: false });
    }
  },
  async loadItems(append = false) {
    const version = ++this.requestVersion;
    this.setData({ loading: true, error: "" });
    try {
      const { data } = await request("listStandardItems", {
        category_id: this.data.categoryId,
        page_token: append ? this.data.nextPage : null,
        page_size: 20,
      });
      if (version !== this.requestVersion) return;
      const urls = { ...this.data.urls, ...data.image_urls };
      const items = data.items.map((item) => ({
        ...item,
        priceText:
          item.min_price_cent === null
            ? "待补充规格"
            : (item.min_price_cent / 100).toFixed(2),
        coverUrl: urls[item.cover_file_id] || "",
      }));
      this.setData({
        items: append ? [...this.data.items, ...items] : items,
        nextPage: data.next_page_token,
        urls,
      });
    } catch (error) {
      if (version === this.requestVersion)
        this.setData({ error: error.message || "商品读取失败" });
    } finally {
      if (version === this.requestVersion) this.setData({ loading: false });
    }
  },
  categoryTap(event) {
    const id = event.currentTarget.dataset.id;
    if (id === this.data.categoryId) return;
    this.setData({ categoryId: id, items: [], nextPage: null });
    this.loadItems();
  },
  loadMore() {
    if (this.data.nextPage && !this.data.loading) this.loadItems(true);
  },
  openItem(event) {
    wx.navigateTo({
      url:
        "/pages/product/index?id=" +
        encodeURIComponent(event.currentTarget.dataset.id),
    });
  },
  openMaterials() {
    wx.navigateTo({ url: "/pages/materials/index" });
  },
  openFoundation() {
    wx.navigateTo({ url: "/pages/foundation/index" });
  },
  retry() {
    if (this.data.categories.length && this.data.categoryId) this.loadItems();
    else this.load();
  },
  imageFailed(event) {
    const index = event.currentTarget.dataset.index;
    this.setData({ ["items[" + index + "].coverUrl"]: "" });
  },
});
