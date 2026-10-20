import { app, auth } from "./platform";
import { imageFileError } from "./catalog-model";

export async function imageUrls(
  ids: readonly string[],
): Promise<Record<string, string>> {
  const unique = [...new Set(ids.filter(Boolean))];
  if (!unique.length) return {};
  const result = await app.getTempFileURL({
    fileList: unique.map((fileID) => ({ fileID, maxAge: 3600 })),
  });
  const urls: Record<string, string> = {};
  for (const row of result.fileList ?? []) {
    const url = row.tempFileURL;
    if (url?.startsWith("https://")) urls[row.fileID] = url;
  }
  return urls;
}
export async function uploadCatalogImage(
  file: File,
  onProgress: (percent: number) => void,
): Promise<{ fileId: string; url: string }> {
  const error = imageFileError(file);
  if (error) throw new Error(error);
  const session = await auth.getSession();
  if (
    session.error ||
    !session.data.session ||
    session.data.session.user?.is_anonymous
  )
    throw new Error("请先登录");
  const extension =
    file.type === "image/png"
      ? "png"
      : file.type === "image/webp"
        ? "webp"
        : "jpg";
  const result = await app.uploadFile({
    cloudPath: `catalog/${crypto.randomUUID()}.${extension}`,
    filePath: file,
    onUploadProgress: ({ loaded, total }: { loaded: number; total: number }) =>
      onProgress(total ? Math.round((loaded * 100) / total) : 0),
  });
  if (!result.fileID) throw new Error("上传未返回文件标识，请重试");
  const resolved = await imageUrls([result.fileID]);
  if (!resolved[result.fileID])
    throw new Error("图片已上传，但预览地址获取失败，请重新选择或稍后重试");
  return { fileId: result.fileID, url: resolved[result.fileID]! };
}
