import { describe, expect, it, vi } from 'vitest';
import { CloudCatalogFiles } from '../../packages/backend/src/catalog/storage';
describe('catalog storage references', () => {
  it('validates existing uploaded images using SDK metadata before save', async () => {
    const id = 'cloud://environment.bucket/catalog/image.png';
    const client = { getFileInfo: vi.fn(async () => ({ fileList: [{ fileID: id, code: 'SUCCESS', mime: 'image/png', size: 1024 }] })), getTempFileURL: vi.fn(async () => ({ fileList: [] })) };
    const storage = new CloudCatalogFiles(() => 'environment', () => client);
    await expect(storage.assertCanReference([id], { kind: 'web', uid: 'admin' })).resolves.toBeUndefined();
    client.getFileInfo.mockResolvedValue({ fileList: [{ fileID: id, code: 'SUCCESS', mime: 'application/xml', size: 512 }] });
    await expect(storage.assertCanReference([id], { kind: 'web', uid: 'admin' })).rejects.toMatchObject({ code: 'INVALID_ARGUMENT' });
  });
  it('rejects foreign environment and paths without signing them', async () => {
    const client = { getFileInfo: vi.fn(async () => ({ fileList: [] })), getTempFileURL: vi.fn(async () => ({ fileList: [] })) };
    const storage = new CloudCatalogFiles(() => 'environment', () => client);
    for (const id of ['cloud://other.bucket/catalog/image.png', 'cloud://environment.bucket/private/secret.png', 'cloud://environment.bucket/catalog/../private/secret.png']) await expect(storage.assertCanReference([id], { kind: 'web', uid: 'admin' })).rejects.toMatchObject({ code: 'INVALID_ARGUMENT' });
    expect(client.getFileInfo).not.toHaveBeenCalled();
    expect(await storage.resolve(['cloud://other.bucket/catalog/image.png'])).toEqual({});
    expect(client.getTempFileURL).not.toHaveBeenCalled();
  });
  it('omits a failed signing batch, warns safely, and continues remaining batches', async () => {
    const ids = Array.from({ length: 51 }, (_, index) => `cloud://environment.bucket/catalog/${index}.png`);
    const client = { getFileInfo: vi.fn(async () => ({ fileList: [] })), getTempFileURL: vi.fn().mockRejectedValueOnce(new Error('sensitive SDK error details')).mockResolvedValueOnce({ fileList: [{ fileID: ids[50], code: 'SUCCESS', tempFileURL: 'https://signed.example/last.png' }] }) };
    const warnings = vi.fn();
    const storage = new CloudCatalogFiles(() => 'environment', () => client, warnings);
    expect(await storage.resolve(ids)).toEqual({ [ids[50]!]: 'https://signed.example/last.png' });
    expect(client.getTempFileURL).toHaveBeenCalledTimes(2);
    expect(warnings.mock.calls).toEqual([[{ code: 'CATALOG_IMAGE_SIGNING_FAILED', count: 50 }]]);
  });
  it('summarizes individual signing failures without logging SDK response fields', async () => {
    const good = 'cloud://environment.bucket/catalog/good.png';
    const missing = 'cloud://environment.bucket/catalog/missing.png';
    const client = { getFileInfo: vi.fn(async () => ({ fileList: [] })), getTempFileURL: vi.fn(async () => ({ fileList: [{ fileID: good, code: 'SUCCESS', tempFileURL: 'https://signed.example/good.png' }, { fileID: missing, code: 'PRIVATE_SDK_DETAILS', tempFileURL: '' }] })) };
    const warnings = vi.fn();
    const storage = new CloudCatalogFiles(() => 'environment', () => client, warnings);
    expect(await storage.resolve([good, missing])).toEqual({ [good]: 'https://signed.example/good.png' });
    expect(warnings.mock.calls).toEqual([[{ code: 'CATALOG_IMAGE_SIGNING_FAILED', count: 1 }]]);
  });
  it('still rejects save validation when remote metadata lookup fails', async () => {
    const client = { getFileInfo: vi.fn(async () => { throw new Error('metadata unavailable'); }), getTempFileURL: vi.fn(async () => ({ fileList: [] })) };
    const storage = new CloudCatalogFiles(() => 'environment', () => client);
    await expect(storage.assertCanReference(['cloud://environment.bucket/catalog/image.png'], { kind: 'web', uid: 'admin' })).rejects.toThrow('metadata unavailable');
  });
});
