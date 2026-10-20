const { request } = require("../../services/api");
const {
  selectedSku,
  selectableOptions,
} = require("../../services/catalog-selection");
Page({
  data: {
    item: null,
    loading: true,
    error: "",
    selection: {},
    dimensions: [],
    sku: null,
    priceText: "",
    quantity: 1,
    stockText: "请选择规格",
    coverUrl: "",
    gallery: [],
    totalText: "0.00",
  },
  onLoad(options) {
    this.itemId = options.id;
    this.load();
  },
  onShow() {
    if (this.loadedAt && Date.now() - this.loadedAt > 300000) this.load();
  },
  async load() {
    if (!this.itemId) {
      this.setData({ loading: false, error: "商品链接不完整，请返回商品列表" });
      return;
    }
    this.setData({ loading: true, error: "" });
    try {
      const { data } = await request("getStandardItemDetail", {
        item_id: this.itemId,
      });
      this.loadedAt = Date.now();
      const initial =
        data.skus.find((s) => s.available_stock > 0) || data.skus[0];
      this.setData({
        item: data,
        selection: initial ? initial.spec_values : {},
        gallery: data.images
          .map((id) => ({ id, url: (data.image_urls || {})[id] || "" }))
          .filter((img) => img.url),
        quantity: 1,
      });
      this.updateSelection();
    } catch (error) {
      this.setData({
        error: error.message || "商品暂时无法读取，请重试",
        item: null,
      });
    } finally {
      this.setData({ loading: false });
    }
  },
  updateSelection() {
    const item = this.data.item;
    if (!item) return;
    const sku = selectedSku(item.spec_schema, item.skus, this.data.selection);
    const urls = item.image_urls || {};
    const cover = sku && sku.image_file_id ? urls[sku.image_file_id] : " ";
    const quantity =
      sku && sku.available_stock > 0
        ? Math.max(1, Math.min(this.data.quantity, sku.available_stock))
        : 1;
    this.setData({
      sku,
      quantity,
      dimensions: selectableOptions(
        item.spec_schema,
        item.skus,
        this.data.selection,
      ),
      priceText: sku ? (sku.price_cent / 100).toFixed(2) : "",
      totalText: sku ? ((sku.price_cent * quantity) / 100).toFixed(2) : "0.00",
      stockText: sku
        ? sku.available_stock > 0
          ? "可用库存 " + sku.available_stock + " 件"
          : "当前规格暂时缺货"
        : "请选择完整规格",
      coverUrl:
        cover && cover.trim()
          ? cover
          : (this.data.gallery[0] && this.data.gallery[0].url) || "",
    });
  },
  chooseOption(event) {
    const key = event.currentTarget.dataset.key;
    const value = event.currentTarget.dataset.value;
    const selection = { ...this.data.selection };
    if (selection[key] === value) delete selection[key];
    else selection[key] = value;
    this.setData({ selection });
    this.updateSelection();
  },
  quantityChange(event) {
    const delta = Number(event.currentTarget.dataset.delta);
    if (!this.data.sku) return;
    const quantity = Math.max(
      1,
      Math.min(this.data.quantity + delta, this.data.sku.available_stock),
    );
    this.setData({ quantity });
    this.updateSelection();
  },
  previewImage() {
    const urls = this.data.gallery.map((image) => image.url);
    if (this.data.coverUrl && !urls.includes(this.data.coverUrl))
      urls.unshift(this.data.coverUrl);
    if (urls.length)
      wx.previewImage({ current: this.data.coverUrl || urls[0], urls });
  },
  coverError() {
    this.setData({ coverUrl: "" });
  },
  showPurchaseStatus() {
    wx.showModal({
      title: "购买功能尚未开放",
      content:
        "当前版本用于商品、规格和库存展示，购物车与订单功能将在后续模块接入。",
      showCancel: false,
    });
  },
});
