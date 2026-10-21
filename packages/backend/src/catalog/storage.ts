import type { TrustedIdentity } from '../../../contracts/src';
import { AppError } from '../errors';
import type { ImageUrlResolver } from './images';
import { selectedImages } from './images';
import { fileId } from './rules';
import type { FileReferenceValidator } from '../services/admin-catalog-service';
interface StorageFile { fileID: string; code: string; tempFileURL?: string; mime?: string; size?: number }
export interface CatalogStorageClient {
  getTempFileURL(input: { fileList: { fileID: string; maxAge: number }[] }): Promise<{ fileList?: readonly StorageFile[] }>;
  getFileInfo(input: { fileList: { fileID: string; maxAge: number;urlType?:'COS_URL' }[] }): Promise<{ fileList?: readonly StorageFile[] }>;
}
export interface ImageSigningWarning { code: 'CATALOG_IMAGE_SIGNING_FAILED'; count: number }
export class CloudCatalogFiles implements ImageUrlResolver, FileReferenceValidator {
  constructor(private readonly env: () => string, private readonly client: () => CatalogStorageClient, private readonly warn: (entry: ImageSigningWarning) => void = entry => console.warn(JSON.stringify(entry))) {}
  private allowed(id: string): boolean {
    const env = this.env(); if (!env || !fileId(id)) return false;
    const slash = id.indexOf('/', 8); const authority = id.slice(8, slash);
    if (slash <= 8 || !(authority === env || authority.startsWith(`${env}.`))) return false;
    try {
      const path = decodeURIComponent(id.slice(slash + 1));
      return path.startsWith('catalog/') && !path.includes('\\') && !path.split('/').some(part => part === '.' || part === '..' || part === '');
    } catch { return false; }
  }
  async assertCanReference(ids: readonly string[], _identity: TrustedIdentity): Promise<void> {
    if (!ids.every(id => this.allowed(id))) throw new AppError('INVALID_ARGUMENT', '图片必须引用当前环境catalog目录的已上传文件');
    const files = [...new Set(ids)];
    for (let start = 0; start < files.length; start += 50) {
      const batch = files.slice(start, start + 50);
      const response = await this.client().getFileInfo({ fileList: batch.map(fileID => ({ fileID, maxAge: 60,urlType:'COS_URL' as const })) });
      const valid = new Set((response.fileList ?? []).filter(file => file.code === 'SUCCESS' && ['image/png', 'image/jpeg', 'image/webp'].includes(file.mime ?? '') && typeof file.size === 'number' && file.size > 0 && file.size <= 5 * 1024 * 1024).map(file => file.fileID));
      if (batch.some(id => !valid.has(id))) {
        const failed=(response.fileList??[]).find(file=>batch.includes(file.fileID)&&!valid.has(file.fileID));
        const code=failed&&/^[A-Z0-9_]{1,64}$/.test(failed.code)?failed.code:'MISSING_METADATA';
        const mime=failed?.mime&&/^[a-z0-9.+-]+\/[a-z0-9.+-]+$/.test(failed.mime)?failed.mime:'unknown';
        const size=typeof failed?.size==='number'&&Number.isFinite(failed.size)?failed.size:0;
        throw new AppError('INVALID_ARGUMENT', `图片不存在、格式不支持或超过5MB（${code}，${mime}，${size}字节）`);
      }
    }
  }
  async resolve(ids: readonly string[]): Promise<Record<string, string>> {
    const files = selectedImages(ids).filter(id => this.allowed(id)); const result: Record<string, string> = {};
    for (let start = 0; start < files.length; start += 50) {
      const batch = files.slice(start, start + 50);
      let response: Awaited<ReturnType<CatalogStorageClient['getTempFileURL']>>;
      try { response = await this.client().getTempFileURL({ fileList: batch.map(fileID => ({ fileID, maxAge: 3600 })) }); }
      catch { this.warn({ code: 'CATALOG_IMAGE_SIGNING_FAILED', count: batch.length }); continue; }
      for (const file of response.fileList ?? []) if (file.code === 'SUCCESS' && file.tempFileURL?.startsWith('https://') && batch.includes(file.fileID)) result[file.fileID] = file.tempFileURL;
      const failures = batch.filter(id => !Object.hasOwn(result, id)).length;
      if (failures) this.warn({ code: 'CATALOG_IMAGE_SIGNING_FAILED', count: failures });
    }
    return result;
  }
}
