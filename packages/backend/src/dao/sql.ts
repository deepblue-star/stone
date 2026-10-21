/** Technical bounds only; callers own product pagination policy. */
export function page(limit = 50, offset = 0): [number, number] {
  return [
    Number.isFinite(limit) ? Math.max(1, Math.min(500, Math.trunc(limit))) : 50,
    Number.isFinite(offset)
      ? Math.max(0, Math.min(Number.MAX_SAFE_INTEGER, Math.trunc(offset)))
      : 0,
  ];
}
export function placeholders(values: readonly unknown[]): string {
  return values.map(() => "?").join(",");
}
export function batchPlaceholders(
  rows: readonly unknown[],
  width: number,
): string {
  return rows
    .map(() => `(${Array.from({ length: width }, () => "?").join(",")})`)
    .join(",");
}
