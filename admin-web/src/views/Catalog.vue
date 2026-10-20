<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { RouterLink } from "vue-router";
import {
  Gem,
  Layers,
  Plus,
  Search,
  ChevronRight,
  Pencil,
  Trash2,
  RefreshCw,
  Package,
} from "@lucide/vue";
import type {
  AdminCategory,
  AdminCatalogItem,
  AdminCatalogSku,
  AdminItemSummary,
  CatalogType,
  Page,
  SaveCatalogSkuPayload,
} from "../../../packages/contracts/src/catalog";
import { api, auth } from "../platform";
import { assertSignOutSucceeded } from "../auth-result";
import { catalogLabels, errorMessage } from "../catalog-model";
import CategoryForm from "../components/catalog/CategoryForm.vue";
import ItemForm from "../components/catalog/ItemForm.vue";
import SkuForm from "../components/catalog/SkuForm.vue";
import InventoryPanel from "../components/catalog/InventoryPanel.vue";
import DeactivationDialog from "../components/catalog/DeactivationDialog.vue";
import ItemDetail from "../components/catalog/ItemDetail.vue";
const type = ref<CatalogType>("STANDARD");
const categories = ref<AdminCategory[]>([]);
const categoryId = ref("");
const visibleCategories = computed(() =>
  categories.value.filter((c) => c.catalog_type === type.value),
);
const selectedCategory = computed(
  () =>
    categories.value.find((c) => c.category_id === categoryId.value) ?? null,
);
const items = ref<AdminItemSummary[]>([]);
const next = ref<string | null>(null);
const loading = ref(false);
const categoryLoading = ref(false);
const detailLoading = ref(false);
const error = ref("");
const notice = ref("");
const keyword = ref("");
const sale = ref("ALL");
let requestVersion = 0;
const deleting = ref(false);
const detail = ref<AdminCatalogItem | null>(null);
const categoryModal = ref(false);
const editingCategory = ref<AdminCategory | null>(null);
const itemModal = ref(false);
const editingItem = ref<AdminCatalogItem | null>(null);
const skuModal = ref(false);
const editingSku = ref<AdminCatalogSku | null>(null);
const inventorySku = ref<AdminCatalogSku | null>(null);
const deactivation = ref<{
  sku: AdminCatalogSku;
  operation: "OFF_SALE" | "DELETE";
  payload?: SaveCatalogSkuPayload;
} | null>(null);
async function loadCategories() {
  categoryLoading.value = true;
  try {
    let cursor: string | null = null;
    const all: AdminCategory[] = [];
    const seen = new Set<string>();
    do {
      const { data }: { data: Page<AdminCategory> } = await api<
        Page<AdminCategory>
      >("listAdminCategories", {
        catalog_type: null,
        page_token: cursor,
        page_size: 100,
      });
      all.push(...data.items);
      cursor = data.next_page_token;
      if (cursor && seen.has(cursor)) throw new Error("分类分页返回重复游标");
      if (cursor) seen.add(cursor);
    } while (cursor);
    categories.value = all;
    if (
      !visibleCategories.value.some((c) => c.category_id === categoryId.value)
    )
      categoryId.value = visibleCategories.value[0]?.category_id ?? "";
  } catch (e) {
    error.value = errorMessage(e);
  } finally {
    categoryLoading.value = false;
  }
}
async function loadItems(append = false) {
  const version = ++requestVersion;
  if (!categoryId.value) {
    items.value = [];
    next.value = null;
    loading.value = false;
    return;
  }
  loading.value = true;
  error.value = "";
  const category = categoryId.value;
  try {
    const { data } = await api<Page<AdminItemSummary>>("listAdminItems", {
      category_id: category,
      name_keyword: keyword.value.trim() || null,
      is_on_sale: sale.value === "ALL" ? null : sale.value === "ON",
      page_token: append ? next.value : null,
      page_size: 20,
    });
    if (version !== requestVersion) return;
    items.value = append ? [...items.value, ...data.items] : data.items;
    next.value = data.next_page_token;
  } catch (e) {
    if (version === requestVersion) error.value = errorMessage(e);
  } finally {
    if (version === requestVersion) loading.value = false;
  }
}
async function chooseType(value: CatalogType) {
  detailVersion++;
  detailLoading.value=false;
  items.value=[];next.value=null;
  type.value = value;
  categoryId.value = visibleCategories.value[0]?.category_id ?? "";
  detail.value = null;
  keyword.value = "";
  sale.value = "ALL";
  await loadItems();
}
async function chooseCategory(id: string) {
  detailVersion++;
  detailLoading.value=false;
  items.value=[];next.value=null;
  categoryId.value = id;
  detail.value = null;
  await loadItems();
}
let detailVersion = 0;
async function openItem(id: string) {
  const version = ++detailVersion;
  detailLoading.value = true;
  try {
    const { data } = await api<AdminCatalogItem>("getAdminCatalogItem", {
      item_id: id,
    });
    if (version === detailVersion) detail.value = data;
  } catch (e) {
    if (version === detailVersion) error.value = errorMessage(e);
  } finally {
    if (version === detailVersion) detailLoading.value = false;
  }
}
async function savedItem(id: string) {
  itemModal.value = false;
  notice.value = "商品资料已保存";
  await loadCategories();
  await loadItems();
  await openItem(id);
}
async function savedCategory() {
  categoryModal.value = false;
  notice.value = "分类已保存";
  await loadCategories();
  await loadItems();
}
async function savedSku() {
  skuModal.value = false;
  deactivation.value = null;
  notice.value = "SKU 已保存";
  if (detail.value) await openItem(detail.value.item_id);
  await loadItems();
}
async function deleteCategory() {
  if (deleting.value) return;
  const c = selectedCategory.value;
  if (!c || !confirm(`确认删除分类“${c.name}”？分类中需没有未删除商品。`))
    return;
  deleting.value = true;
  try {
    await api("deleteCategory", { category_id: c.category_id });
    await loadCategories();
    await loadItems();
    notice.value = "分类已删除";
  } catch (e) {
    error.value = errorMessage(e);
  } finally {
    deleting.value = false;
  }
}
async function deleteItem() {
  if (deleting.value) return;
  const item = detail.value;
  if (
    !item ||
    !confirm(
      `确认删除“${item.name}”？必须先处理所有未删除 SKU，历史资料会保留。`,
    )
  )
    return;
  deleting.value = true;
  try {
    await api("deleteCatalogItem", { item_id: item.item_id });
    detail.value = null;
    await loadCategories();
    await loadItems();
    notice.value = "商品已删除";
  } catch (e) {
    error.value = errorMessage(e);
  } finally {
    deleting.value = false;
  }
}
function stageSkuDeactivation(payload: SaveCatalogSkuPayload) {
  if (!editingSku.value) return;
  deactivation.value = {
    sku: editingSku.value,
    operation: "OFF_SALE",
    payload,
  };
  skuModal.value = false;
}
async function logout() {
  try {
    assertSignOutSucceeded(await auth.signOut());
  } catch (e) {
    error.value = errorMessage(e);
  }
}
onMounted(async () => {
  await loadCategories();
  await loadItems();
});
</script>
<template>
  <div class="catalog-shell">
    <aside class="merchant-sidebar">
      <RouterLink to="/catalog" class="brand-lockup"
        ><Gem :size="28" aria-hidden="true" /><span
          >STONE<small>商家工作台</small></span
        ></RouterLink
      >
      <nav aria-label="管理导航">
        <RouterLink to="/catalog" aria-current="page"
          ><Layers :size="19" aria-hidden="true" />商品与库存</RouterLink
        ><RouterLink to="/"
          ><RefreshCw :size="19" aria-hidden="true" />联通检查</RouterLink
        >
      </nav>
      <p class="sidebar-note">开发环境<br />商品资料连接真实数据库</p>
      <button type="button" class="secondary" @click="logout">退出登录</button>
    </aside>
    <main class="catalog-workspace">
      <header class="catalog-page-header">
        <div>
          <p class="eyebrow">CATALOG / 商品目录</p>
          <h1>商品与库存</h1>
          <p class="muted">从材料到成品，统一管理规格、价格与库存。</p>
        </div>
        <button
          type="button"
          :disabled="!categoryId || categoryLoading"
          @click="
            editingItem = null;
            itemModal = true;
          "
        >
          <Plus :size="18" aria-hidden="true" />创建商品
        </button>
      </header>
      <div class="type-switch" aria-label="目录类型">
        <button
          v-for="(label, key) in catalogLabels"
          :key="key"
          type="button"
          :class="{ selected: type === key }"
          :aria-pressed="type === key"
          @click="chooseType(key)"
        >
          {{ label }}
        </button>
      </div>
      <p v-if="notice" role="status" class="success-notice">{{ notice }}</p>
      <div v-if="error" role="alert" class="error">
        {{ error }}
        <button
          type="button"
          class="text-button"
          @click="loadCategories().then(() => loadItems())"
        >
          重新读取
        </button>
      </div>
      <div class="catalog-columns">
        <section class="category-panel" aria-label="商品分类">
          <div class="row-between">
            <h2>分类</h2>
            <button
              type="button"
              class="icon-button"
              aria-label="创建分类"
              @click="
                editingCategory = null;
                categoryModal = true;
              "
            >
              <Plus :size="20" aria-hidden="true" />
            </button>
          </div>
          <p v-if="categoryLoading" role="status">正在读取分类…</p>
          <p v-else-if="!visibleCategories.length" class="empty-inline">
            还没有{{ catalogLabels[type] }}分类。先创建分类，再添加商品。
          </p>
          <div class="category-list">
            <button
              v-for="c in visibleCategories"
              :key="c.category_id"
              type="button"
              :class="{ selected: categoryId === c.category_id }"
              :aria-pressed="categoryId === c.category_id"
              @click="chooseCategory(c.category_id)"
            >
              <span
                >{{ c.name
                }}<small v-if="!c.is_enabled">前台已隐藏</small></span
              ><span class="category-count">{{ c.item_count }}</span>
            </button>
          </div>
          <div v-if="selectedCategory" class="category-tools">
            <button
              class="text-button"
              @click="
                editingCategory = selectedCategory;
                categoryModal = true;
              "
            >
              <Pencil :size="15" aria-hidden="true" />编辑分类</button
            ><button class="text-button danger-text" :disabled="deleting" @click="deleteCategory">
              <Trash2 :size="15" aria-hidden="true" />删除
            </button>
          </div>
        </section>
        <section class="product-panel" aria-label="分类商品">
          <div class="row-between">
            <div>
              <h2>{{ selectedCategory?.name || "商品列表" }}</h2>
              <p class="field-hint">
                {{
                  selectedCategory?.is_enabled === false
                    ? "该分类当前不在小程序展示"
                    : "查看公共资料与具体 SKU"
                }}
              </p>
            </div>
            <button
              class="icon-button"
              aria-label="刷新商品"
              :disabled="loading"
              @click="loadItems()"
            >
              <RefreshCw :size="18" aria-hidden="true" />
            </button>
          </div>
          <form class="catalog-filters" @submit.prevent="loadItems()">
            <div class="search-field">
              <Search :size="18" aria-hidden="true" /><label
                class="sr-only"
                for="catalog-search"
                >搜索当前分类商品</label
              ><input
                id="catalog-search"
                v-model="keyword"
                placeholder="搜索当前分类商品"
                maxlength="160"
              />
            </div>
            <label class="sr-only" for="catalog-sale">商品上架状态</label
            ><select id="catalog-sale" v-model="sale" @change="loadItems()">
              <option value="ALL">全部状态</option>
              <option value="ON">已上架</option>
              <option value="OFF">已下架</option></select
            ><button
              type="submit"
              class="secondary"
              :disabled="loading || !categoryId"
            >
              查询
            </button>
          </form>
          <div
            v-if="loading && !items.length"
            class="empty-state"
            role="status"
          >
            <span class="loading-line" />正在读取商品…
          </div>
          <div v-else-if="!items.length" class="empty-state">
            <Package :size="40" aria-hidden="true" />
            <h3>
              {{
                keyword || sale !== "ALL"
                  ? "没有匹配的商品"
                  : "让这个分类有第一件商品"
              }}
            </h3>
            <p>
              {{
                keyword || sale !== "ALL"
                  ? "试试更换关键词或筛选条件。"
                  : "先创建商品资料，再添加 SKU 和库存。"
              }}
            </p>
            <button
              v-if="categoryId && !keyword && sale === 'ALL'"
              type="button"
              class="secondary"
              @click="
                editingItem = null;
                itemModal = true;
              "
            >
              创建第一件商品
            </button>
          </div>
          <div v-else class="table-scroll">
            <table class="product-table">
              <thead>
                <tr>
                  <th>商品</th>
                  <th>状态</th>
                  <th>SKU</th>
                  <th>可用 / 总库存</th>
                  <th><span class="sr-only">操作</span></th>
                </tr>
              </thead>
              <tbody>
                <tr
                  v-for="item in items"
                  :key="item.item_id"
                  :class="{ chosen: detail?.item_id === item.item_id }"
                >
                  <td>
                    <button
                      type="button"
                      class="product-name-button"
                      @click="openItem(item.item_id)"
                    >
                      <span class="product-monogram" aria-hidden="true"
                        ><Gem :size="20" /></span
                      ><span
                        ><strong>{{ item.name }}</strong
                        ><small>ID {{ item.item_id }}</small></span
                      >
                    </button>
                  </td>
                  <td>
                    <span
                      class="status-badge"
                      :class="{ active: item.is_on_sale }"
                      >{{ item.is_on_sale ? "上架" : "下架" }}</span
                    >
                  </td>
                  <td class="numeric">{{ item.sku_count }}</td>
                  <td class="numeric">
                    {{ item.stock_total - item.stock_reserved }} /
                    {{ item.stock_total
                    }}<small v-if="item.stock_reserved"
                      >预占 {{ item.stock_reserved }}</small
                    >
                  </td>
                  <td>
                    <button
                      class="text-button"
                      :aria-label="`查看${item.name}规格`"
                      @click="openItem(item.item_id)"
                    >
                      管理<ChevronRight :size="15" aria-hidden="true" />
                    </button>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
          <button
            v-if="next"
            type="button"
            class="secondary load-more"
            :disabled="loading"
            @click="loadItems(true)"
          >
            {{ loading ? "读取中…" : "加载更多商品" }}
          </button>
        </section>
      </div>
      <p v-if="detailLoading" role="status" class="loading-detail">
        正在读取商品详情…
      </p>
      <ItemDetail
        v-if="detail"
        :item="detail"
        :busy="deleting"
        @edit="
          editingItem = detail;
          itemModal = true;
        "
        @add-sku="
          editingSku = null;
          skuModal = true;
        "
        @edit-sku="
          editingSku = $event;
          skuModal = true;
        "
        @inventory="inventorySku = $event"
        @deactivate="(sku, operation) => (deactivation = { sku, operation })"
        @delete="deleteItem"
      />
    </main>
    <CategoryForm
      v-if="categoryModal"
      :category="editingCategory"
      :catalog-type="type"
      @close="categoryModal = false"
      @saved="savedCategory"
    />
    <ItemForm
      v-if="itemModal"
      :item="editingItem"
      :categories="categories"
      :category-id="categoryId"
      @close="itemModal = false"
      @saved="savedItem"
    />
    <SkuForm
      v-if="skuModal && detail"
      :item="detail"
      :sku="editingSku"
      @close="skuModal = false"
      @saved="savedSku"
      @deactivate="stageSkuDeactivation"
    />
    <InventoryPanel
      v-if="inventorySku"
      :sku="inventorySku"
      @close="inventorySku = null"
      @changed="
        () => {
          if (detail) void openItem(detail.item_id);
          void loadItems();
        }
      "
    />
    <DeactivationDialog
      v-if="deactivation"
      v-bind="deactivation"
      @close="deactivation = null"
      @saved="savedSku"
    />
  </div>
</template>
