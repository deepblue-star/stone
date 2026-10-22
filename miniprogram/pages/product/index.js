const { request } = require("../../services/api");
const { open, query } = require('../../services/navigation');
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
    galleryCurrent: 0,
    galleryVersion: 0,
    totalText: "0.00",
    submitting: false,
    purchaseError: '',
  },
  onLoad(options) {
    this.itemId = options.id;
    this.load();
  },
  onShow() {
    if (this.loadedAt && Date.now() - this.loadedAt > 300000) this.load();
  },
  async load() {
    const version = this.requestVersion = (this.requestVersion || 0) + 1;
    this.failedImages = new Set();
    this.setData({
      loading: true, error: '', item: null, sku: null, selection: {}, dimensions: [],
      priceText: '', totalText: '0.00', quantity: 1, stockText: '请选择规格',
      coverUrl: '', gallery: [], galleryCurrent: 0,
      galleryVersion: this.data.galleryVersion + 1, purchaseError: '',
    });
    if (!this.itemId) {
      this.setData({ loading: false, error: "商品链接不完整，请返回商品列表" });
      return;
    }
    try {
      const { data } = await request("getStandardItemDetail", {
        item_id: this.itemId,
      });
      if (version !== this.requestVersion) return;
      this.loadedAt = Date.now();
      const initial =
        data.skus.find((s) => s.available_stock > 0) || data.skus[0];
      this.setData({
        item: data,
        selection: initial ? initial.spec_values : {},
        quantity: 1,
      });
      this.updateSelection(true);
    } catch (error) {
      if (version !== this.requestVersion) return;
      this.setData({
        error: error.message || "商品暂时无法读取，请重试",
        item: null,
      });
    } finally {
      if (version === this.requestVersion) this.setData({ loading: false });
    }
  },
  updateSelection(refreshGallery) {
    const item = this.data.item;
    if (!item) return;
    const sku = selectedSku(item.spec_schema, item.skus, this.data.selection);
    const previousSkuId = this.data.sku ? this.data.sku.sku_id : '';
    const skuId = sku ? sku.sku_id : '';
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
    });
    if (refreshGallery || previousSkuId !== skuId) this.updateGallery();
  },
  updateGallery() {
    const item = this.data.item;
    const sku = this.data.sku;
    const urls = item.image_urls || {};
    const ids = (sku && sku.image_file_id ? [sku.image_file_id] : []).concat(item.images);
    const seenIds = new Set();
    const seenUrls = new Set();
    const galleryVersion = this.data.galleryVersion + 1;
    const gallery = [];
    ids.forEach((id) => {
      const url = urls[id];
      if (typeof url !== 'string' || !url.trim() || seenIds.has(id) || seenUrls.has(url) || (this.failedImages && this.failedImages.has(url))) return;
      seenIds.add(id);
      seenUrls.add(url);
      gallery.push({ id, url, key: galleryVersion + ':' + id });
    });
    this.setData({ gallery, galleryVersion, galleryCurrent: 0, coverUrl: gallery.length ? gallery[0].url : '' });
  },
  galleryChange(event) {
    if (Number(event.currentTarget.dataset.version) !== this.data.galleryVersion) return;
    const current = Number(event.detail.current);
    const image = this.data.gallery[current];
    if (!Number.isInteger(current) || !image) return;
    this.setData({ galleryCurrent: current, coverUrl: image.url });
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
    const current = urls[this.data.galleryCurrent];
    if (current) wx.previewImage({ current, urls });
  },
  coverError(event) {
    const image = event && event.currentTarget.dataset;
    if (!image || Number(image.version) !== this.data.galleryVersion) return;
    const failed = this.data.gallery.find((entry) => entry.id === image.id && entry.url === image.url);
    if (!failed) return;
    if (!this.failedImages) this.failedImages = new Set();
    this.failedImages.add(failed.url);
    const shown = this.data.gallery[this.data.galleryCurrent];
    const gallery = this.data.gallery.filter((entry) => entry !== failed);
    const shownIndex = gallery.findIndex((entry) => entry === shown);
    const galleryCurrent = shownIndex >= 0 ? shownIndex : Math.max(0, Math.min(this.data.galleryCurrent, gallery.length - 1));
    this.setData({ gallery, galleryCurrent, coverUrl: gallery.length ? gallery[galleryCurrent].url : '' });
  },
  async addCart() {
    if (this.data.submitting || this.data.loading || this.data.error || !this.data.item || !this.data.sku || this.data.sku.available_stock < this.data.quantity) return;
    this.setData({ submitting: true, purchaseError: '' });
    try { await request('addCartItem', { item_type: 'STANDARD', sku_id: this.data.sku.sku_id, quantity: this.data.quantity }); wx.showToast({ title: '已加入购物车', icon: 'success' }); }
    catch (e) { this.setData({ purchaseError: e.message || '加入购物车失败，请重试' }); }
    finally { this.setData({ submitting: false }); }
  },
  buy() { if (!this.data.submitting && !this.data.loading && !this.data.error && this.data.item && this.data.sku && this.data.sku.available_stock >= this.data.quantity) open(query('/pages/checkout/index', { item_type: 'STANDARD', sku_id: this.data.sku.sku_id, quantity: this.data.quantity })); },
  contact() { open('/pages/contact/index'); },
});
