import type { SpecSchema, SpecValues, StandardItemDetail } from "./catalog";
type Sku = StandardItemDetail["skus"][number];

/** A selection is complete only when every schema key matches exactly one SKU. */
export function selectedSku(
  schema: SpecSchema,
  skus: readonly Sku[],
  selection: SpecValues,
): Sku | null {
  if (schema.dimensions.some((d) => !selection[d.key])) return null;
  const matches = skus.filter((sku) =>
    schema.dimensions.every((d) => sku.spec_values[d.key] === selection[d.key]),
  );
  return matches.length === 1 ? matches[0]! : null;
}
export function selectableOptions(
  schema: SpecSchema,
  skus: readonly Sku[],
  selection: SpecValues,
) {
  return schema.dimensions.map((d) => ({
    ...d,
    options: d.options.map((option) => ({
      ...option,
      selected: selection[d.key] === option.value,
      available: skus.some(
        (sku) =>
          sku.available_stock > 0 &&
          sku.spec_values[d.key] === option.value &&
          schema.dimensions.every(
            (other) =>
              other.key === d.key ||
              !selection[other.key] ||
              sku.spec_values[other.key] === selection[other.key],
          ),
      ),
    })),
  }));
}
