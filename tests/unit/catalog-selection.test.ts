import { expect, it } from "vitest";
import {
  selectedSku,
  selectableOptions,
} from "../../packages/contracts/src/catalog-selection";
import type {
  SpecSchema,
  StandardItemDetail,
} from "../../packages/contracts/src/catalog";
const schema: SpecSchema = {
  dimensions: [
    {
      key: "gravel",
      label: "碎石",
      options: [
        { value: "WHITE", label: "白水晶" },
        { value: "PINK", label: "粉晶" },
      ],
    },
    {
      key: "size",
      label: "尺寸",
      options: [
        { value: "8", label: "8mm" },
        { value: "10", label: "10mm" },
      ],
    },
  ],
};
const skus: StandardItemDetail["skus"] = [
  {
    sku_id: "1",
    spec_values: { gravel: "WHITE", size: "8" },
    price_cent: 100,
    available_stock: 2,
    image_file_id: null,
  },
  {
    sku_id: "2",
    spec_values: { gravel: "PINK", size: "10" },
    price_cent: 200,
    available_stock: 0,
    image_file_id: null,
  },
];
it("does not choose a SKU until every defined dimension is selected", () => {
  expect(selectedSku(schema, skus, { gravel: "WHITE" })).toBeNull();
  expect(
    selectedSku(schema, skus, { size: "8", gravel: "WHITE" })?.sku_id,
  ).toBe("1");
  expect(selectedSku(schema, skus, { size: "10", gravel: "WHITE" })).toBeNull();
});
it("option availability uses actual live SKU combinations and available stock", () => {
  expect(
    selectableOptions(schema, skus, { size: "8" })[0]?.options.map((o) => [
      o.value,
      o.available,
    ]),
  ).toEqual([
    ["WHITE", true],
    ["PINK", false],
  ]);
});
it("one default SKU can be selected without inventing a dimension", () => {
  expect(
    selectedSku({ dimensions: [] }, [{ ...skus[0]!, spec_values: {} }], {})
      ?.sku_id,
  ).toBe("1");
});
