import { describe, expect, it } from "vitest";
import { ref } from 'vue';
import {
  priceToCent,
  formatPrice,
  stockOperationKey,
  imageFileError,
  skuPayload,
  cloneDimensions,
  completeStockOperation,
  skuSpecValues,
} from "../../admin-web/src/catalog-model";

describe("catalog form boundaries", () => {
  it('keeps unresolved adjustment A when another SKU adjustment B finishes',()=>{
    const data=new Map<string,string>();
    const storage={getItem:(key:string)=>data.get(key)??null,setItem:(key:string,value:string)=>{data.set(key,value);},removeItem:(key:string)=>{data.delete(key);}};
    const a=stockOperationKey(storage,'sku-a',5,'补货',()=> 'operation-a','admin-a');
    const b=stockOperationKey(storage,'sku-b',2,'盘点',()=> 'operation-b','admin-a');
    completeStockOperation(storage,'sku-b',2,'盘点',b,'admin-a');
    expect(stockOperationKey(storage,'sku-a',5,'补货',()=> 'duplicate-a','admin-a')).toBe(a);
    expect(stockOperationKey(storage,'sku-a',5,'补货',()=> 'other-admin','admin-b')).not.toBe(a);
  });
  it('preserves material specification metadata during unrelated SKU edits',()=>{
    expect(skuSpecValues('BEAD',{material:'QUARTZ'},{size:'8'})).toEqual({material:'QUARTZ'});
    expect(skuSpecValues('STANDARD',{color:'WHITE'},{color:'PINK'})).toEqual({color:'PINK'});
  });
  it('copies reactive specification models into an independent editable draft',()=>{
    const item=ref({dimensions:[{key:'gravel',label:'碎石',options:[{value:'WHITE',label:'白水晶'}]}]});
    const draft=cloneDimensions(item.value);draft[0]!.options[0]!.label='修改后的标签';
    expect(item.value.dimensions[0]!.options[0]!.label).toBe('白水晶');
    expect(cloneDimensions(null)).toEqual([]);
  });
  it("converts decimal yuan without floating point rounding", () => {
    expect(priceToCent("1.01")).toBe(101);
    expect(priceToCent("0")).toBe(0);
    expect(formatPrice(101)).toBe("1.01");
    for (const value of ["-1", "1.001", "1e3", "", "NaN"])
      expect(() => priceToCent(value)).toThrow();
  });
  it("reuses a pending inventory operation key on retry but not for changed input", () => {
    const storage = new Map<string, string>();
    const store = {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => {
        storage.set(key, value);
      },
    };
    const first = stockOperationKey(
      store,
      "11",
      5,
      "盘点补录",
      () => "fixed-1",
    );
    expect(stockOperationKey(store, "11", 5, "盘点补录", () => "fixed-2")).toBe(
      first,
    );
    expect(
      stockOperationKey(store, "11", 6, "盘点补录", () => "fixed-3"),
    ).not.toBe(first);
  });
  it("rejects active files and excessive images before upload", () => {
    expect(imageFileError({ type: "image/svg+xml", size: 200 })).toContain(
      "PNG",
    );
    expect(
      imageFileError({ type: "image/png", size: 6 * 1024 * 1024 }),
    ).toContain("5 MB");
    expect(imageFileError({ type: "image/webp", size: 200 })).toBe("");
  });
  it("constructs the complete SKU request without stock fields or stale discount flags", () => {
    const payload = skuPayload({
      sku_id: null,
      item_id: "1",
      spec_values: {},
      diameter_mm: 8,
      image_file_id: null,
      price: "1.20",
      is_on_sale: false,
      points_exchange_enabled: false,
      points_cost: 100,
    });
    expect(payload).toMatchObject({
      price_cent: 120,
      points_cost: null,
      deactivation_impact_hash: null,
    });
    expect(payload).not.toHaveProperty("stock_total");
  });
});
