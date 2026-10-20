// @vitest-environment happy-dom
import {mount,flushPromises} from '@vue/test-utils';
import {afterEach,describe,expect,it,vi} from 'vitest';
import {ref} from 'vue';
import ItemForm from '../../admin-web/src/components/catalog/ItemForm.vue';
import SkuForm from '../../admin-web/src/components/catalog/SkuForm.vue';
import Catalog from '../../admin-web/src/views/Catalog.vue';
import ImagePicker from '../../admin-web/src/components/catalog/ImagePicker.vue';
import ItemDetail from '../../admin-web/src/components/catalog/ItemDetail.vue';
import type {AdminCatalogItem,AdminCategory} from '../../packages/contracts/src/catalog';

const {api}=vi.hoisted(()=>({api:vi.fn()}));
vi.mock('../../admin-web/src/platform',()=>({api,auth:{signOut:vi.fn()}}));
vi.mock('../../admin-web/src/storage',()=>({imageUrls:vi.fn(async()=>({})),uploadCatalogImage:vi.fn()}));
const stubs={Modal:{template:'<section><slot/></section>'},ImagePicker:true,RouterLink:{template:'<a><slot/></a>'}};
const category:AdminCategory={category_id:'1',catalog_type:'STANDARD',name:'成品手串',sort_order:10,is_enabled:true,item_count:1,updated_at:'2026-10-21T00:00:00Z'};
const item:AdminCatalogItem={item_id:'11',category_id:'1',catalog_type:'STANDARD',name:'白水晶手串',description:'开发测试',images:[],spec_schema:{dimensions:[]},is_on_sale:true,skus:[],updated_at:'2026-10-21T00:00:00Z'};
afterEach(()=>{vi.resetAllMocks();document.body.innerHTML='';});

describe('catalog component editing',()=>{
 it('keeps a failed image reference removable without showing a broken image',async()=>{
  const wrapper=mount(ImagePicker,{props:{modelValue:['cloud://test/catalog/a.png'],label:'商品图片',resolved:{'cloud://test/catalog/a.png':'https://images.invalid/a.png'}}});
  await flushPromises();await wrapper.find('img').trigger('error');
  expect(wrapper.find('img').exists()).toBe(false);expect(wrapper.text()).toContain('预览不可用');wrapper.unmount();
 });
 it('replaces an unavailable detail cover with the non-image fallback',async()=>{
  const wrapper=mount(ItemDetail,{props:{item:{...item,images:['cloud://test/catalog/a.png'],image_urls:{'cloud://test/catalog/a.png':'https://images.invalid/a.png'}}}});
  await wrapper.find('img').trigger('error');expect(wrapper.find('img').exists()).toBe(false);wrapper.unmount();
 });
 it('opens existing reactive specification data without DataCloneError and saves complete fields',async()=>{
  const reactiveItem=ref(item);api.mockResolvedValue({data:item});
  const wrapper=mount(ItemForm,{props:{item:reactiveItem.value,categories:[category],categoryId:'1'},global:{stubs}});
  expect(wrapper.find('#item-name').element).toHaveProperty('value','白水晶手串');
  await wrapper.find('#item-name').setValue('更新名称');await wrapper.find('form').trigger('submit');await flushPromises();
  expect(api).toHaveBeenCalledWith('saveCatalogItem',expect.objectContaining({item_id:'11',name:'更新名称',spec_schema:{dimensions:[]},images:[]}));
  wrapper.unmount();
 });
 it('preserves material metadata when only a price changes',async()=>{
  const material:AdminCatalogItem={...item,catalog_type:'BEAD',spec_schema:null};
  const sku={sku_id:'22',item_id:'11',spec_values:{material:'QUARTZ'},spec_signature:null,diameter_mm:8,image_file_id:null,price_cent:100,is_on_sale:false,points_exchange_enabled:false,points_cost:null,stock_total:5,stock_reserved:0,available_stock:5,updated_at:item.updated_at};
  api.mockResolvedValue({data:sku});const wrapper=mount(SkuForm,{props:{item:material,sku},global:{stubs}});
  await wrapper.find('#sku-price').setValue('1.20');await wrapper.find('form').trigger('submit');await flushPromises();
  expect(api).toHaveBeenCalledWith('saveCatalogSku',expect.objectContaining({spec_values:{material:'QUARTZ'},price_cent:120}));
  expect(api.mock.calls[0]?.[1]).not.toHaveProperty('stock_total');wrapper.unmount();
 });
 it('clears previous-category products when the next category cannot load',async()=>{
  api.mockImplementation(async(action:string,payload:{category_id?:string})=>{
   if(action==='listAdminCategories')return {data:{items:[category,{...category,category_id:'2',name:'测试分类B'}],next_page_token:null}};
   if(action==='listAdminItems'&&payload.category_id==='2')throw new Error('测试网络中断');
   if(action==='listAdminItems')return {data:{items:[{item_id:'11',category_id:'1',catalog_type:'STANDARD',name:'A分类的商品',is_on_sale:true,sku_count:1,stock_total:5,stock_reserved:0,updated_at:item.updated_at}],next_page_token:'old-cursor'}};
   throw new Error('Unexpected test action');
  });
  const wrapper=mount(Catalog,{global:{stubs}});await flushPromises();expect(wrapper.text()).toContain('A分类的商品');
  const nextCategory=wrapper.findAll('.category-list button').find(button=>button.text().includes('测试分类B'))!;
  await nextCategory.trigger('click');await flushPromises();expect(wrapper.text()).not.toContain('A分类的商品');expect(wrapper.text()).toContain('测试网络中断');expect(wrapper.find('.load-more').exists()).toBe(false);wrapper.unmount();
 });
});
