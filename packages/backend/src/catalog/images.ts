export interface ImageUrlResolver { resolve(fileIds: readonly string[]): Promise<Record<string, string>> }
export const noImageUrls: ImageUrlResolver = { async resolve() { return {}; } };
export function selectedImages(ids: readonly (string | null)[]): string[] { return [...new Set(ids.filter((value): value is string => typeof value === 'string' && value.startsWith('cloud://')))]; }
