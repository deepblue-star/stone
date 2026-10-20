import type {
  SaveCatalogSkuPayload,
  SpecValues,
  SpecSchema,
  CatalogType,
} from "../../packages/contracts/src/catalog";

export const catalogLabels = {
  BEAD: "珠子",
  ACCESSORY: "配件",
  STANDARD: "标准商品",
} as const;
export function priceToCent(value: string): number {
  if (!/^\d+(\.\d{1,2})?$/.test(value.trim()))
    throw new Error("请输入有效金额，最多两位小数");
  const [yuan, fraction = ""] = value.trim().split(".");
  const cents = Number(yuan) * 100 + Number(fraction.padEnd(2, "0"));
  if (!Number.isSafeInteger(cents)) throw new Error("金额超出可支持范围");
  return cents;
}
export const formatPrice = (cent: number): string => (cent / 100).toFixed(2);
export function cloneDimensions(schema:SpecSchema|null):SpecSchema['dimensions'] {
  return schema?.dimensions.map(dimension=>({...dimension,options:dimension.options.map(option=>({...option}))}))??[];
}
export function skuSpecValues(type:CatalogType,saved:SpecValues|null,selection:SpecValues):SpecValues|null {
  return type==='STANDARD'?{...selection}:saved===null?null:{...saved};
}
export function imageFileError(file: { type: string; size: number }): string {
  if (!["image/png", "image/jpeg", "image/webp"].includes(file.type))
    return "请选择 PNG、JPG 或 WebP 图片";
  if (file.size <= 0 || file.size > 5 * 1024 * 1024)
    return "图片需大于 0 且不超过 5 MB";
  return "";
}
export function stockOperationKey(
  storage: Pick<Storage, "getItem" | "setItem">,
  sku: string,
  delta: number,
  remark: string,
  create: () => string = () => crypto.randomUUID(),
  actor='current-admin',
): string {
  const fingerprint = JSON.stringify({ sku, delta, remark });
  const slot=stockSlot(actor,sku,delta,remark);
  const existing = storage.getItem(slot);
  if (existing) {
    try {
      const record: unknown = JSON.parse(existing);
      if (
        record &&
        typeof record === "object" &&
        "fingerprint" in record &&
        record.fingerprint === fingerprint &&
        "key" in record &&
        typeof record.key === "string"
      )
        return record.key;
    } catch {
      throw new Error('本地库存操作标识损坏，请先核对库存流水，不要直接重复登记');
    }
  }
  const key = create();
  storage.setItem(
    slot,
    JSON.stringify({ fingerprint, key }),
  );
  return key;
}
function stockSlot(actor:string,sku:string,delta:number,remark:string):string {
  return `stone:stock-operation:${JSON.stringify({actor,sku,delta,remark})}`;
}
export function completeStockOperation(storage:Pick<Storage,'getItem'|'removeItem'>,sku:string,delta:number,remark:string,key:string,actor='current-admin'):void {
  const slot=stockSlot(actor,sku,delta,remark);const saved=storage.getItem(slot);
  if(!saved)return;
  const record:unknown=JSON.parse(saved);
  if(record&&typeof record==='object'&&'key' in record&&record.key===key)storage.removeItem(slot);
}
export function skuPayload(draft: {
  sku_id: string | null;
  item_id: string;
  spec_values: SpecValues | null;
  diameter_mm: number | null;
  image_file_id: string | null;
  price: string;
  is_on_sale: boolean;
  points_exchange_enabled: boolean;
  points_cost: number | null;
}): SaveCatalogSkuPayload {
  const { price, ...fields } = draft;
  return {
    ...fields,
    price_cent: priceToCent(price),
    points_cost: fields.points_exchange_enabled ? fields.points_cost : null,
    deactivation_impact_hash: null,
  };
}
export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "操作未完成，请重试";
}
